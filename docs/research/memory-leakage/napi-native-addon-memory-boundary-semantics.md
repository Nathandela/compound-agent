# N-API Native Addon Memory Boundary Semantics

**A Technical Survey of Memory Flow, Lifecycle Guarantees, and Deterministic Cleanup at the V8/C++ Boundary**

---

## Abstract

Node.js native addons written in C++ occupy a structurally ambiguous position: they execute within a managed runtime (V8) while owning resources that the runtime cannot track. This survey examines the memory boundary between the V8 JavaScript heap, the native C++ heap, and OS kernel buffers as exposed through the Node-API (N-API) stable ABI. We analyze how each of the three principal mechanisms for crossing this boundary — `napi_wrap`, `napi_create_external_buffer`/`napi_create_external_arraybuffer`, and `napi_set_instance_data` — carries distinct ownership semantics, finalization guarantees, and failure modes. We then evaluate V8's garbage collector (Orinoco) from the perspective of a native addon author: how the Scavenge, Mark-Sweep, and Mark-Compact phases are blind to off-heap allocations, what role `AdjustExternalAllocatedMemory` plays in signaling pressure, and why finalizer queues produce non-deterministic cleanup under sustained allocation pressure. Three production case studies are examined in depth — better-sqlite3, sharp (libvips), and node-canvas (Cairo) — each illustrating a qualitatively different failure mode: zombie connection handles, allocator fragmentation that never returns to the OS, and surface double-initialization RSS growth respectively. We survey deterministic cleanup patterns including `Symbol.dispose` (TC39 Explicit Resource Management, conditionally Stage 4), try-finally wrappers, `AddEnvironmentCleanupHook`, and Worker thread isolation as an alternative to in-process cleanup. A comparative synthesis table summarises the trade-offs across all approaches. Open problems — including the finalizer queue saturation hazard under unyielding loops, the incompatibility of global singletons with Worker thread re-entrancy, and the allocator portability gap on Linux/glibc — are honestly characterised.

---

## 1. Introduction

The Node.js native addon ecosystem is the bridge between JavaScript application code and the performance-critical C/C++ libraries that power it: SQLite bindings, image processing pipelines, machine learning inference runtimes, cryptographic primitives, and audio/video codecs. The stability of that bridge depends on a correct mental model of memory ownership across a boundary that two fundamentally different resource managers — V8's tracing garbage collector and C++'s deterministic RAII idiom — must navigate simultaneously.

The problem is not merely academic. In production systems that use addons like `better-sqlite3` or `@huggingface/transformers` (backed by ONNX Runtime's C++ engine), developers routinely observe Resident Set Size (RSS) growing after what they believe to be complete cleanup. A `db.close()` call does not guarantee that the SQLite internal page cache, WAL buffers, or mmap'd memory-mapped regions are returned to the OS. An `InferenceSession.release()` call does not guarantee that ONNX Runtime's memory arena is collapsed. These are not bugs in the conventional sense; they are structural consequences of the memory model at the N-API boundary.

This survey provides a PhD-level treatment of that model. It answers four questions:

1. What are the three memory spaces involved, and how does data flow between them?
2. How does V8's GC interact with (and fail to interact with) each space?
3. What real-world failure modes arise in production addons?
4. What patterns — and their trade-offs — exist for deterministic cleanup?

### Scope and Terminology

**N-API** refers to the C-level stable ABI (`node_api.h`). **node-addon-api** is the C++ wrapper layer on top of N-API. **napi_env** is the opaque handle representing a JavaScript execution environment; it is per-isolate and per-worker and must not be cached across threads. **RSS** (Resident Set Size) is the amount of physical RAM pages mapped to the process, including V8 heap, native C heap, and kernel buffers. **external memory** is heap memory allocated by native code that V8 tracks only when explicitly informed via `AdjustExternalAllocatedMemory` or `BackingStore` deleter callbacks.

---

## 2. Foundations

### 2.1 The Three Memory Spaces

```
┌──────────────────────────────────────────────────────────────────┐
│                        Process RSS                               │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   V8 Managed Heap                        │   │
│  │  ┌────────────┐  ┌────────────┐  ┌─────────────────┐   │   │
│  │  │  New Space │  │  Old Space │  │ Large Object    │   │   │
│  │  │ (1–8 MB)   │  │ (~1.5 GB)  │  │ Space (mmap'd)  │   │   │
│  │  └────────────┘  └────────────┘  └─────────────────┘   │   │
│  │  ┌────────────┐  ┌────────────────────────────────┐    │   │
│  │  │ Code Space │  │  External Pointer Table (EPT)  │    │   │
│  │  └────────────┘  │  (V8 sandbox mode only)        │    │   │
│  │                  └────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                             │  napi_wrap / BackingStore          │
│                             │  pointers/offsets                  │
│                             ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           Native C/C++ Heap (malloc/new/jemalloc)        │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌─────────────┐  │   │
│  │  │ sqlite3 handle│  │ libvips cache │  │ ONNX arenas │  │   │
│  │  │ + page cache  │  │ + thread pool │  │ + model wts │  │   │
│  │  └───────────────┘  └───────────────┘  └─────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                             │  mmap / file descriptors           │
│                             ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              OS Kernel Buffers                           │   │
│  │  ┌───────────────┐  ┌──────────────────────────────┐    │   │
│  │  │ Page cache    │  │ WAL file / mmap region       │    │   │
│  │  │ (filesystem)  │  │ (SQLite mmap_size pragma)    │    │   │
│  │  └───────────────┘  └──────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

**Space 1: V8 Managed Heap.** This is where JavaScript objects, arrays, closures, and typed views live. It is subdivided generationally: New Space (semi-space pair, 1–8 MB, collected by Scavenge), Old Space (collected by Mark-Sweep-Compact), Code Space (JIT-compiled machine code), Map Space, and Large Object Space (each object gets its own `mmap` region; objects never move). V8 knows the precise size of every live object in these spaces and drives GC based on heap growth against a dynamically computed limit.

**Space 2: Native C/C++ Heap.** Memory allocated by `malloc`, `new`, `sqlite3_malloc64`, `vips_malloc`, or a custom arena allocator. V8 is completely blind to this space unless the addon explicitly informs it via `AdjustExternalAllocatedMemory`. This is the root of the RSS-growth problem: an addon can allocate gigabytes here without triggering a single V8 GC cycle.

**Space 3: OS Kernel Buffers.** Memory-mapped files (`mmap`), anonymous mappings, and kernel page-cache pages accessed via `read`/`write`. SQLite's WAL journal and the `mmap_size` pragma place database pages here. These pages appear in RSS but are neither in the V8 heap nor in the malloc heap; they are demand-paged by the kernel and are not directly controllable from JavaScript.

### 2.2 N-API Cross-Boundary Mechanisms

N-API provides three principal mechanisms for connecting JavaScript objects to native memory:

#### 2.2.1 `napi_wrap` / `ObjectWrap`

Associates a native C++ pointer with a JavaScript object's internal field. When the JS object is garbage collected, a finalizer fires.

```c
// C++ side (N-API)
napi_status napi_wrap(
    napi_env env,
    napi_value js_object,      // The JS object to associate with
    void* native_object,       // Pointer to native C++ struct/class
    napi_finalize finalize_cb, // Called when JS object is GC'd
    void* finalize_hint,       // Passed to finalizer
    napi_ref* result           // Optional: strong ref to JS object
);

// Typical finalize_cb:
static void DestroyNative(napi_env env, void* data, void* hint) {
    // Called on the JS thread, after GC marks JS object dead
    // V8 heap access is allowed here
    MyNativeClass* obj = static_cast<MyNativeClass*>(data);
    delete obj;  // Releases native C++ heap
}
```

```typescript
// TypeScript/JavaScript side — the wrapper
class DatabaseWrapper {
  // The underlying JS object holds a napi_wrap pointer
  // to the sqlite3* handle in native memory.
  // When this JS object is GC'd, DestroyNative fires.
  constructor(path: string) { /* native init */ }
  close(): void { /* explicit close — preferred */ }
}
```

**Ownership model:** V8 owns the JS object's lifetime; the addon owns the pointed-to native memory; the finalizer is the handoff point. The critical invariant is that the finalizer must run before the native pointer is used again after the JS object becomes unreachable.

#### 2.2.2 `napi_create_external_buffer` / `napi_create_external_arraybuffer`

Creates a JavaScript `Buffer` or `ArrayBuffer` whose backing store is externally-allocated native memory. No copy occurs; the JS typed view is a zero-copy window into native memory.

```c
// C++ side
uint8_t* native_buf = malloc(4096);
napi_value js_buffer;

napi_status status = napi_create_external_buffer(
    env,
    4096,           // byte length
    native_buf,     // pointer to native memory
    FreeBuffer,     // deleter — called when ArrayBuffer's BackingStore is released
    nullptr,        // hint passed to deleter
    &js_buffer
);

// Deleter: called from V8's BackingStore destructor
// NOTE: may be called on a non-JS thread; Node.js posts it back to the JS thread
static void FreeBuffer(napi_env env, void* data, void* hint) {
    free(data);  // Releases native memory
}
```

**V8 Memory Cage constraint (Electron 21+, Chromium 103+).** When V8's sandboxed pointer mode is active, `ArrayBuffer` backing stores must reside inside the sandbox address space. Off-heap external buffers are forbidden and `napi_create_external_buffer` returns `napi_no_external_buffers_allowed`. Node.js itself currently disables the V8 sandbox to preserve ecosystem compatibility, but Electron and embedded V8 runtimes enable it. The recommended portable pattern is `Napi::Buffer::NewOrCopy`, which falls back to a copy when external buffers are prohibited.

**BackingStore race condition (Node.js PR #33321).** Prior to the fix in this PR, there was a race between the N-API finalizer (which freed the native memory) and V8's internal global array-buffer table (which still held a reference to the pointer). The allocator could then re-use the address, causing a crash when V8 attempted to deregister the old entry. The fix tied the finalizer invocation to the `BackingStore` deleter callback, posted back to the JS thread from whichever thread V8 called the deleter on.

#### 2.2.3 `napi_set_instance_data` / `AddEnvironmentCleanupHook`

Binds a single block of native memory to the lifetime of a `napi_env`. This is the correct pattern for addon-wide singletons (e.g., a connection pool or model cache) that must survive across many JS object creations but be cleaned up when the environment (or worker thread) is torn down.

```c
// C++ side
struct AddonState {
    sqlite3_pool* pool;
    std::mutex lock;
};

// Called once per environment (main thread + each Worker)
napi_value ModuleInit(napi_env env, napi_value exports) {
    AddonState* state = new AddonState();
    state->pool = sqlite3_pool_open(/* ... */);

    napi_set_instance_data(
        env,
        state,
        [](napi_env env, void* data, void* hint) {
            // Cleanup hook: called when this napi_env is torn down
            AddonState* s = static_cast<AddonState*>(data);
            sqlite3_pool_close(s->pool);
            delete s;
        },
        nullptr
    );
    return exports;
}
```

**Critical constraint:** `napi_env` values must never be shared across worker threads. Each `Worker` instantiation creates a fresh `napi_env`; the module's `ModuleInit` is re-invoked, and a new `AddonState` is allocated. This means a process-global singleton implemented with a static C++ variable bypasses the cleanup hook entirely and leaks when workers exit.

### 2.3 `AdjustExternalAllocatedMemory`

```c
// V8 C++ API (called from addon code)
isolate->AdjustAmountOfExternalAllocatedMemory(+bytes_allocated);
// ... later ...
isolate->AdjustAmountOfExternalAllocatedMemory(-bytes_freed);
```

V8 maintains a counter of externally-allocated memory reported by addons via this API. When the counter exceeds a platform-dependent threshold (approximately 32 MB in V8 ≥ 6.1.94), V8 schedules a Mark-Sweep GC cycle even if the JS heap is below its limit. This is the only mechanism by which a native addon's allocations can generate GC pressure.

The performance implication is significant: calling this API on every `malloc`/`free` pair introduces overhead. The recommended pattern (as implemented in `zlib` and `roaring-node`) is to accumulate a delta and call `AdjustExternalAllocatedMemory` only when the delta exceeds a meaningful threshold (e.g., 32 KB per instance or after batch operations like `shrinkToFit()`).

---

## 3. Taxonomy of Approaches

The space of approaches to cross-boundary memory management can be organised along two axes: **when cleanup is triggered** (deterministic vs. GC-driven) and **what object owns the resource** (JS object, addon instance, process/worker lifetime).

```
                 ┌─────────────────────────────────────────────────────┐
                 │          CLEANUP TRIGGER                            │
                 │   Deterministic          GC-driven                  │
  ─────────────────────────────────────────────────────────────────    │
  JS Object      │  Symbol.dispose /        napi_wrap finalizer /      │
  scope          │  try-finally             FinalizationRegistry       │
  ─────────────────────────────────────────────────────────────────    │
  Addon instance │  AddEnvironment          napi_wrap on exports       │
  (per-env)      │  CleanupHook             object (fragile)           │
  ─────────────────────────────────────────────────────────────────    │
  Process /      │  process.on('SIGTERM') + atexit() / static          │
  Worker         │  explicit close()        destructor (unreliable)    │
                 └─────────────────────────────────────────────────────┘
```

Six canonical approaches emerge from this taxonomy:

1. **GC-driven finalizers** (`napi_wrap` + `napi_finalize` callback)
2. **BackingStore deleter callbacks** (for external ArrayBuffers)
3. **Environment cleanup hooks** (`AddEnvironmentCleanupHook` / `napi_set_instance_data`)
4. **Explicit lifecycle methods** (`close()`, `release()`, `dispose()`)
5. **TC39 Explicit Resource Management** (`Symbol.dispose` + `using` declarations)
6. **Worker thread isolation** (each Worker owns its native resources; termination = cleanup)

---

## 4. Analysis

### 4.1 GC-Driven Finalizers

#### 4.1.1 Theory and Mechanism

When `napi_wrap` associates a native pointer with a JS object, V8 tracks the JS object as a weak persistent reference. When the GC determines the JS object is unreachable (during either Scavenge for new-space objects or Mark-Sweep for old-space objects), it schedules the finalizer callback. The callback is not invoked synchronously during GC; it is deferred to a point where the JS engine is in a safe state to execute native code.

Two categories of finalizer exist in modern N-API:

- **Basic finalizers** (`node_api_basic_finalize` callback type): May run during GC with restricted V8 API access. Cannot call back into JavaScript. Use for raw `free()` calls only.
- **Full finalizers** (`napi_finalize` callback type): Scheduled as microtasks on the event loop after GC. Have full `napi_env` access. Incur a delay.

```c
// Basic finalizer — safe to call during GC
static void BasicFree(node_api_basic_env env, void* data, void* hint) {
    free(data);  // No V8 API calls allowed here
}

// Full finalizer — deferred to event loop idle
static void FullFinalizer(napi_env env, void* data, void* hint) {
    // Can call napi_create_string, emit events, etc.
    MyObject* obj = static_cast<MyObject*>(data);
    obj->FlushPendingCallbacks(env);
    delete obj;
}
```

#### 4.1.2 Literature Evidence

The finalizer queue saturation hazard was documented in `nodejs/node-addon-api` issue #1140 (Gabriel Schulhof, 2021). The root cause: when JavaScript executes in a tight loop allocating `ObjectWrap`-ed objects without yielding, finalizers accumulate in a queue that is only drained when the microtask checkpoint runs — which requires yielding to the event loop. In stress tests, RSS grew without bound until the process was killed, even though the JS heap remained stable.

The quote from Schulhof captures the structural constraint: "We cannot synchronously free native memory during garbage collection, because freeing something on the native side may result in JavaScript getting executed, which cannot be done during garbage collection, because the engine is not in the right state for executing JavaScript."

The `FinalizationRegistry` (ES2021, `WeakRef`-based) exhibits an even weaker guarantee. Joyee Cheung's 2024 blog series on memory leak testing documented that `FinalizationRegistry` callbacks fire later and less predictably than `napi_add_finalizer` weak callbacks. In one test, callbacks fired 99 times instead of the expected 100 by the time the `exit` event fired. The ECMAScript specification explicitly allows conforming implementations to skip finalization callbacks entirely.

#### 4.1.3 Implementations and Benchmarks

The node-canvas issue #922 demonstrated a 8.9x RSS growth (72 MB → 643 MB over 1,000 requests) attributable to a leaked Cairo surface during Canvas object initialization. The fix was a one-line constructor change that avoided redundant `cairo_surface_create` calls; the lesson is that finalizer-dependent cleanup that never fires due to object re-creation inside constructors produces unbounded growth.

ONNX Runtime issue #25325 measured linear RSS growth of approximately 87 MB per session creation/release cycle (325 MB baseline, 9.12 GB after 100 cycles). The contributor's analysis identified memory arena retention: the `InferenceSession.release()` call correctly freed allocated objects but left ORT's internal allocator arenas holding address space, which glibc does not return to the OS.

#### 4.1.4 Strengths and Limitations

| Aspect | Detail |
|--------|--------|
| **Strength: zero JS change** | Finalizers require no explicit `close()` call from application code. Safety net for forgotten cleanup. |
| **Strength: handles cycles** | V8's tracing GC can collect cycles that reference counting cannot. |
| **Limitation: non-deterministic** | Timing depends on GC pressure, allocation rate, and event loop saturation. |
| **Limitation: queue starvation** | Unyielding loops prevent finalizer queue drain. RSS grows without bound. |
| **Limitation: no ordering** | Between two finalizers for related objects, no ordering is guaranteed. |
| **Limitation: shutdown gap** | During process exit and `worker.terminate()`, destructors are not guaranteed to run. |

### 4.2 BackingStore Deleter Callbacks

#### 4.2.1 Theory and Mechanism

When a JavaScript `ArrayBuffer` is created by an N-API call (e.g., `napi_create_external_arraybuffer`), V8 internally creates a `BackingStore` — a shared reference-counted object that coordinates the lifetime of the buffer's underlying memory. The `BackingStore` holds a deleter callback and invokes it when its reference count drops to zero (i.e., when no `ArrayBuffer` or `SharedArrayBuffer` JavaScript-level view references it).

```
JS ArrayBuffer (in V8 heap)
        │
        └─── v8::BackingStore (ref count = 1)
                    │  deleter = FreeNativeBuffer
                    │  data    = 0x7f3a00000000
                    │
                    ▼ (when ref count → 0)
              FreeNativeBuffer(data) called
              → free(0x7f3a00000000)   [native heap]
```

When an `ArrayBuffer` is **transferred** to a Worker thread via `postMessage` with a transfer list, the original isolate's backing store reference is released and a new one is created in the destination isolate. The deleter callback is preserved. When the destination isolate's `ArrayBuffer` is GC'd, the deleter fires in that isolate's context.

When an `ArrayBuffer` is **detached** (via `ArrayBuffer.prototype.transfer()` or `structuredClone` with transfer), the original `ArrayBuffer` becomes zero-length and inert; the backing store is migrated to the new `ArrayBuffer`. This is the zero-copy transfer mechanism between threads.

#### 4.2.2 Literature Evidence

Node.js PR #33321 (Anna Henningsen, 2020) fixed a race condition between N-API's own GC callback (which fired first and freed native memory) and V8's background thread invoking the `BackingStore` deleter (which tried to access the already-freed pointer). The fix changed the sequencing so that the N-API finalizer is only called after the `BackingStore` deleter completes, and the deleter is always posted back to the JS thread to satisfy the N-API contract of single-threaded finalizer invocation.

`SharedArrayBuffer` has a separate concern: since it is never transferred (it is shared by reference), the `BackingStore` lives as long as any `SharedArrayBuffer` across any live thread has a reference. Closing a Worker that holds a `SharedArrayBuffer` view does not free the backing store; the memory persists until the last reference in any thread is released. Node.js commit `d4e397a900` addressed a crash when a `SharedArrayBuffer` outlived its creating thread by keeping the `BackingStore` (and its allocator) alive via a separate reference count path.

#### 4.2.3 Strengths and Limitations

| Aspect | Detail |
|--------|--------|
| **Strength: correct sequencing** | BackingStore reference counting guarantees the deleter fires exactly once and after all views are released. |
| **Strength: thread transfer support** | Transfer semantics across Workers are handled by BackingStore, not the addon. |
| **Limitation: timing** | Still GC-driven; the deleter fires when the last JS view is collected, not when data is no longer logically needed. |
| **Limitation: memory cage** | In V8 sandbox mode (Electron 21+), external backing stores are prohibited; requires copy-based fallback. |
| **Limitation: background thread** | V8 may call the deleter on a non-JS thread; the N-API workaround (posting to JS thread) adds latency. |

### 4.3 Environment Cleanup Hooks

#### 4.3.1 Theory and Mechanism

`AddEnvironmentCleanupHook` registers a C++ callback to fire synchronously when the `napi_env` is torn down — either when the process exits normally or when a `Worker` thread terminates. `napi_set_instance_data` is the idiomatic single-allocation variant.

```c
// Register in module init
node::AddEnvironmentCleanupHook(
    isolate,
    [](void* arg) {
        // Runs on env teardown (LIFO order)
        auto* state = static_cast<AddonState*>(arg);
        state->db_pool->close_all();
        delete state;
    },
    state
);
```

Hooks execute in LIFO (last-in-first-out) order relative to registration. This means if addon A registers its hook before addon B, B's hook runs first — a useful property for expressing dependency ordering. In an async variant (available since Node.js 14.8.0/12.19.0), the hook receives a `void (*cb)(void*)` completion callback and may perform asynchronous teardown before signalling completion.

**Worker thread re-entrancy.** Because each Worker creates a fresh `napi_env`, and because the module `Init` function runs for each load, cleanup hooks registered in `ModuleInit` are automatically scoped per-Worker. The addon need not implement any thread-local storage or mutex; the `napi_env` IS the isolation unit.

#### 4.3.2 Literature Evidence

The Node-API Resource documentation explicitly identifies the per-worker `napi_env` pattern as the correct replacement for static global addon state. The contrast is stark: addons using `static` C++ variables for singletons will have those singletons shared (and their destructors NOT called) across Worker teardowns. Addons using `napi_set_instance_data` get per-worker singletons with automatic cleanup.

Node.js source PR #19377 ("src: clean up resources on Environment teardown") established the hook infrastructure and clarified that JavaScript destructors (`Symbol.dispose`, finalizers) are not reliable during worker termination — environment cleanup hooks are the only safe mechanism for native resource teardown in that context.

#### 4.3.3 Strengths and Limitations

| Aspect | Detail |
|--------|--------|
| **Strength: deterministic** | Fires on every normal env teardown, including Worker exit. |
| **Strength: LIFO ordering** | Dependency-ordered cleanup is expressible by registration order. |
| **Strength: per-worker** | Automatically scoped to each Worker; no manual thread-local logic needed. |
| **Limitation: not GC-triggered** | Does not fire when individual JS objects are collected — only on full env teardown. |
| **Limitation: forced kill** | `SIGKILL` or `worker.terminate()` may not give hooks time to run on all platforms. |
| **Limitation: async gap** | Pre-v14.8 Node.js lacks async hook variant; synchronous teardown cannot await I/O. |

### 4.4 Explicit Lifecycle Methods

#### 4.4.1 Theory and Mechanism

The simplest and most widely used pattern is an explicit `close()` or `dispose()` method that the addon exposes to JavaScript. The method invokes the C++ destructor sequence synchronously, well-defined in the call stack, with no GC indirection.

```typescript
// TypeScript wrapper with explicit close
class Database {
  private handle: NativeDatabase;

  constructor(path: string) {
    this.handle = new NativeDatabase(path);
  }

  // Synchronous, deterministic, call-stack traceable
  close(): void {
    this.handle.close();  // → sqlite3_close_v2() in C++
    // After this returns, sqlite3* handle is gone from native heap
  }
}
```

```c
// C++ side: Database::Close()
void Database::Close(const Napi::CallbackInfo& info) {
    if (this->open) {
        // Step 1: finalize all prepared statements
        for (Statement* stmt : this->stmts) {
            stmt->CloseHandles();
        }
        this->stmts.clear();

        // Step 2: close all backups
        for (Backup* backup : this->backups) {
            backup->CloseHandles();
        }
        this->backups.clear();

        // Step 3: close the connection
        // sqlite3_close_v2 defers if unfinalized stmts remain ("zombie mode")
        int rc = sqlite3_close(this->db_handle);
        assert(rc == SQLITE_OK);  // better-sqlite3 asserts all stmts were finalized
        this->open = false;
    }
}
```

**`sqlite3_close` vs. `sqlite3_close_v2`.** better-sqlite3 uses `sqlite3_close` (not `_v2`) with a prior assertion that all statements have been finalized. `sqlite3_close` returns `SQLITE_BUSY` if unfinalized statements remain; `sqlite3_close_v2` enters "zombie mode" and defers the actual deallocation. The zombie mode is designed for GC-managed languages where destructor ordering is non-deterministic — the database remains in a "closing" state until the last statement is finalized by the GC. Neither call releases SQLite's internal page cache, WAL buffers, or shared-memory segments to the OS; those persist until the OS closes all file descriptors associated with the WAL.

#### 4.4.2 Literature Evidence

better-sqlite3's `addon.cpp` implements a cleanup pattern that is called from both the explicit `close()` path and the addon-level cleanup hook registered via `napi_add_env_cleanup_hook`. The `Addon::Cleanup` static method iterates the `std::set<Database*> dbs`, calling `CloseHandles()` on each, then `delete`s the `Addon` struct. The invariant is that `addon->dbs.erase(db)` must be called before `db->CloseHandles()` to prevent use-after-free in multi-connection scenarios.

Statement finalization ordering is critical: the better-sqlite3 `Database::CloseHandles()` method explicitly iterates all live `Statement*` instances and calls `sqlite3_finalize(stmt->handle)` before `sqlite3_close`. This guarantees `sqlite3_close` succeeds rather than returning `SQLITE_BUSY`.

#### 4.4.3 Strengths and Limitations

| Aspect | Detail |
|--------|--------|
| **Strength: deterministic** | Runs synchronously in the call stack; timing is under application control. |
| **Strength: traceable** | Stack traces point directly to the close call; easy to profile and debug. |
| **Strength: can coordinate** | Application can sequence close() calls across dependent resources. |
| **Limitation: requires discipline** | If the application forgets to call close(), the resource leaks until GC or process exit. |
| **Limitation: error path gaps** | Exceptions between `open()` and `close()` skip cleanup unless wrapped in try-finally. |
| **Limitation: native heap retention** | Even after close(), allocator may hold pages (glibc fragmentation; arena retention in ONNX). |

### 4.5 TC39 Explicit Resource Management (`Symbol.dispose`)

#### 4.5.1 Theory and Mechanism

The TC39 Explicit Resource Management proposal (conditionally Stage 4 as of mid-2025, with `await using` remaining at Stage 2) introduces a language-level mechanism for scope-bound resource cleanup analogous to C#'s `using`, Python's `with`, and C++'s RAII.

```typescript
// Synchronous disposal
{
    using db = new Database('./app.db');
    // ... use db ...
}  // db[Symbol.dispose]() called here, even if an exception was thrown

// Asynchronous disposal (still Stage 2 as of 2026)
{
    await using session = await InferenceSession.create(modelPath);
    const output = await session.run(feeds);
}  // await session[Symbol.asyncDispose]() called on scope exit
```

The `DisposableStack` aggregator enables composing multiple resources with correct reverse-order disposal:

```typescript
const stack = new DisposableStack();
const db = stack.use(new Database('./app.db'));
const stmtA = stack.use(db.prepare('SELECT ...'));
const stmtB = stack.use(db.prepare('INSERT ...'));
// On stack.dispose(), stmtB[Symbol.dispose](), stmtA[Symbol.dispose](), db[Symbol.dispose]()
// called in LIFO order — critical for dependent resources
```

**V8 support status (as of early 2026).** Chromium 134 and V8 v13.8+ ship `Symbol.dispose`, `using`, and `DisposableStack`. Node.js support depends on the V8 version bundled: Node.js 22+ ships V8 versions that include this feature for synchronous disposal. `Symbol.asyncDispose` and `await using` remain experimental/not yet universally available.

```typescript
// Implementing Symbol.dispose on a native wrapper
class Database {
  private handle: NativeDatabase;

  constructor(path: string) {
    this.handle = new NativeDatabase(path);
  }

  close(): void {
    this.handle.close();
  }

  [Symbol.dispose](): void {
    this.close();
  }
}
```

#### 4.5.2 Literature Evidence

The Cloudflare Workers team documented the fundamental unreliability of `FinalizationRegistry` (the JS-level counterpart to N-API finalizers) in their post "We shipped FinalizationRegistry in Workers: why you should never use it." Key finding: "A conforming JavaScript implementation, even one that does garbage collection, is not required to call cleanup callbacks." Their conclusion: `FinalizationRegistry` is appropriate only as a safety net, never as the primary cleanup mechanism. The ERM `using` keyword is the correct alternative.

The proposal champion (Ron Buckton) explicitly designed `DisposableStack.prototype.move()` for the pattern of transferring resource ownership between scopes — addressing the case where a resource factory function needs to transfer ownership to a caller without risking double-dispose on error paths.

#### 4.5.3 Strengths and Limitations

| Aspect | Detail |
|--------|--------|
| **Strength: language-integrated** | Compiler/runtime guarantees disposal even on exception paths. |
| **Strength: composable** | DisposableStack with LIFO ordering handles interdependent resources. |
| **Strength: ownership transfer** | `stack.move()` enables zero-risk ownership handoff. |
| **Limitation: adoption lag** | Full support (sync + async) not yet universal across Node.js versions. |
| **Limitation: JS-layer only** | Only controls the explicit JS-side cleanup; cannot force C++ arena release. |
| **Limitation: async complexity** | `await using` remains Stage 2; async cleanup paths are more complex. |

### 4.6 Worker Thread Isolation as Cleanup Strategy

#### 4.6.1 Theory and Mechanism

Rather than attempting in-process cleanup of native resources — which is fundamentally constrained by GC non-determinism, allocator fragmentation, and arena retention — Worker thread isolation treats each Worker as a disposable container: all native resources are allocated within a Worker's `napi_env`, and `worker.terminate()` (or natural Worker exit) triggers the environment teardown path, which invokes all `AddEnvironmentCleanupHook` callbacks.

```
Main Thread                     Worker Thread
     │                               │
     │  new Worker('db-worker.js')   │
     │──────────────────────────────►│
     │                               │   sqlite3_open() → db handle in Worker's env
     │                               │   napi_set_instance_data(env, db_handle, ...)
     │                               │   [operations...]
     │  await worker.terminate()     │
     │──────────────────────────────►│
     │                               │   napi_env teardown
     │                               │   → CleanupHook fires
     │                               │   → sqlite3_close(db_handle)
     │                               │   → env destroyed, memory returned (partially)
     │◄──────────────────────────────│
     │  worker exits, RSS may drop   │
```

**`worker.terminate()` semantics.** The call stops all JavaScript execution in the Worker as quickly as possible. It does not guarantee that all async I/O in flight is completed before teardown. On Linux, because the Worker's heap and stack are OS thread-local pages, much of the RSS associated with that Worker's allocations becomes eligible for reclamation once the OS thread terminates — in contrast to within-process cleanup where the allocator retains freed blocks in its arena.

**`trackUnmanagedFds: true` option.** File descriptors opened by the Worker outside the `fs` API are automatically closed on Worker exit when this option is set, addressing a related class of kernel-buffer leaks.

**Shared memory considerations.** `SharedArrayBuffer` instances shared between the main thread and a Worker are NOT freed when the Worker exits; they remain alive until all threads release their references. This is intentional and correct. Native memory pointed to by a `SharedArrayBuffer` is freed only when the `BackingStore` reference count drops to zero across all threads.

#### 4.6.2 Literature Evidence

Node.js issue #45685 demonstrated that keeping references to terminated Workers prevents garbage collection of the Worker object itself and (transitively) its associated heap. The fix is to null out or remove from collections any Worker references after termination. This is the JS-heap analogue of the more fundamental problem: holding any live reference into a terminated Worker's data structures prevents OS page reclamation.

The ONNX Runtime issue #4093 explicitly identified that creating multiple ONNX Runtime sessions in the same process causes thread pool multiplication (5 sessions → 25 threads on a 4-core machine) because each session creates its own thread pool. The Worker isolation pattern sidesteps this by running exactly one ORT session per Worker, with `DisablePerSessionThreads()` sharing a single environment-level thread pool within each Worker.

#### 4.6.3 Strengths and Limitations

| Aspect | Detail |
|--------|--------|
| **Strength: OS-level cleanup** | Worker thread exit allows the OS to reclaim pages more aggressively than allocator-level free(). |
| **Strength: GC isolation** | Worker's GC heap is independent; a GC pause in the Worker does not block the main thread. |
| **Strength: env teardown hooks** | All `AddEnvironmentCleanupHook` callbacks fire deterministically on Worker exit. |
| **Limitation: IPC overhead** | All data exchange must cross thread via `postMessage` with structured clone or transfer. |
| **Limitation: startup cost** | Worker creation (parsing, linking, native addon init) has non-trivial latency. |
| **Limitation: forced kill gap** | `SIGKILL` or immediate OS-level termination can bypass even env teardown hooks. |
| **Limitation: SharedArrayBuffer** | Shared memory outlives the Worker; native memory behind SAB is not freed on Worker exit. |

---

## 5. Comparative Synthesis

### 5.1 Case Study: better-sqlite3

better-sqlite3 implements a tight, well-ordered cleanup hierarchy that serves as a reference model for addon design. The following ASCII diagram shows the ownership graph:

```
Addon struct (napi_set_instance_data)
    │
    ├── std::set<Database*> dbs
    │       │
    │       └── Database (napi_wrap on JS Database object)
    │               │  owns: sqlite3* db_handle
    │               │  owns: std::set<Statement*> stmts
    │               │  owns: std::set<Backup*> backups
    │               │
    │               ├── Statement (napi_wrap on JS Statement)
    │               │       owns: sqlite3_stmt* stmt_handle
    │               │       cleanup: sqlite3_finalize(stmt_handle)
    │               │
    │               └── cleanup: sqlite3_close(db_handle)
    │                   [asserts all stmts finalized first]
    │
    └── Addon::Cleanup() [called from env teardown hook]
            iterates dbs → CloseHandles() → delete db
```

**WAL mode and mmap RSS behavior.** When WAL mode is enabled (`PRAGMA journal_mode=WAL`) and `mmap_size` is non-zero, SQLite maps a portion of the database file into the process address space via `mmap`. These mapped pages appear in RSS. They are not freed by `sqlite3_close`; they are freed when the OS closes all file descriptors associated with the WAL. On Linux, the kernel may keep these pages in the page cache even after the file descriptors are closed, contributing to persistent RSS elevation that is not a "leak" in the conventional sense.

**Connection proliferation.** Opening many short-lived `Database` instances (e.g., in a request handler) and relying on GC to call finalizers generates `sqlite3*` handle accumulation if the event loop is saturated. Each open handle holds a 16 MB default page cache allocation. The singleton pattern (one global `Database` instance per process) avoids this; the Worker isolation pattern (one `Database` per Worker, closed on Worker exit) provides deterministic cleanup with OS-level recovery.

### 5.2 Case Study: sharp (libvips)

sharp's memory profile is governed by two independent retention mechanisms: libvips' operation cache and glibc's allocator fragmentation.

```
JavaScript call: sharp(inputBuffer).resize(800, 600).toBuffer()
        │
        ▼
libvips operation graph (C++ heap):
        │  VipsImage → VipsRegion → pixel data (malloc'd)
        │
        ├── Operation cache (default: 100 ops, 50 MB)
        │   Retains: recent operation results for re-use
        │   Release: sharp.cache(false) or cache(0, 0, 0)
        │
        └── Thread pool (default: CPU count threads)
            Each thread: local glibc arena
            → fragmented after many small allocations
            → freed to allocator, not to OS (glibc behavior)
            → RSS stays elevated even after all images processed
```

**glibc fragmentation mechanism.** glibc's `ptmalloc2` allocator creates per-thread arenas to reduce lock contention. Each arena is a growing heap segment. When `free()` is called, blocks are returned to the arena's free list but the segment is not unmapped unless a large contiguous region at the top of the heap can be trimmed. In a workload with mixed allocation sizes (typical for image processing: small control structs + large pixel buffers), fragmentation leaves "holes" in the heap that prevent OS-level memory return. RSS stays elevated indefinitely.

**jemalloc mitigation.** Replacing glibc malloc with jemalloc (via `LD_PRELOAD`) resolves the fragmentation issue for sharp. jemalloc's size-class bins and per-thread caches limit internal fragmentation to approximately 20% and actively unmap pages when regions become empty. Node.js issue #21973 documented dramatic improvements: one test case showed RSS dropping from 5,997 MiB to 75 MiB after buffer deallocation with jemalloc.

**sharp configuration controls.**

```typescript
import sharp from 'sharp';

// Disable libvips operation cache entirely
sharp.cache(false);

// Limit thread pool (reduces fragmentation at cost of parallelism)
sharp.concurrency(1);  // On Linux without jemalloc, default is already 1

// Limit input image dimensions (DoS protection)
sharp.limitInputPixels(268402689);  // Default ~16384 x 16384
```

### 5.3 Case Study: node-canvas (Cairo)

node-canvas wraps Cairo's `cairo_surface_t` as a native resource. Each `Canvas` instance allocates a surface; the surface holds a pixel bitmap whose size is `width × height × bytes_per_pixel`.

```
JS Canvas object (napi_wrap)
        │
        └── NativeCanvas (C++ heap)
                │
                └── cairo_surface_t* surface
                        │
                        └── bitmap data (malloc)
                            size = width × height × bpp
                            [NOT tracked by V8 GC pressure]
```

**RSS growth pattern.** The node-canvas issue #922 (v2.0 regression) showed RSS growing from 72 MB to 643 MB over 1,000 HTTP requests, each creating and discarding a `Canvas` object. The root cause: the Canvas constructor was creating Cairo surfaces twice (a regression from the v1.x constructor). Each `cairo_surface_create` allocates the full bitmap. The second (correct) surface was retained; the first leaked because the constructor did not call `cairo_surface_destroy` on the intermediate surface.

The structural lesson: because Cairo bitmap memory is not tracked by `AdjustExternalAllocatedMemory`, V8 saw only the small JS object wrapper and assigned low GC priority to the heap. The 571 MB of native memory accumulation went undetected by heap snapshots.

**Mitigation patterns for node-canvas.**

```typescript
// Pattern 1: Explicit reuse — reset instead of recreate
const canvas = createCanvas(1920, 1080);
const ctx = canvas.getContext('2d');

function processFrame(): Buffer {
    ctx.clearRect(0, 0, 1920, 1080);  // Reuse existing bitmap allocation
    // ... draw operations ...
    return canvas.toBuffer('image/png');
}

// Pattern 2: Resize to 0 to trigger Cairo surface deallocation
function releaseCanvas(canvas: Canvas): void {
    canvas.width = 0;  // Forces cairo_surface_destroy in native code
    canvas.height = 0;
}

// Pattern 3: Symbol.dispose wrapper
class ManagedCanvas implements Disposable {
    private canvas: Canvas;

    constructor(width: number, height: number) {
        this.canvas = createCanvas(width, height);
    }

    get context() { return this.canvas.getContext('2d'); }

    [Symbol.dispose](): void {
        this.canvas.width = 0;
        this.canvas.height = 0;
    }
}

// Usage:
{
    using canvas = new ManagedCanvas(1920, 1080);
    // ... render ...
}  // cairo_surface_destroy fires here via Symbol.dispose
```

### 5.4 Case Study: ONNX Runtime (`@huggingface/transformers`)

ONNX Runtime's Node.js binding (`onnxruntime-node`) wraps the C++ ORT inference engine. Memory behavior is governed by ORT's arena allocator, thread pool lifecycle, and execution provider (CPU/CUDA) memory management.

```
InferenceSession.create(modelPath)
        │
        ▼
ORT C++ Engine:
        ├── ModelProto deserialization (native heap)
        ├── SessionState (node allocation tables)
        ├── CPU ExecutionProvider
        │     └── BFCAllocator (arena) — size retained on release
        └── ThreadPool (shared if OrtEnv reused, per-session otherwise)

InferenceSession.release()
        │
        ├── Frees ModelProto, SessionState
        └── BFCAllocator arena: freed TO ALLOCATOR, not to OS
            → RSS does not return to baseline
```

**Arena retention.** The ORT BFCAllocator (Best-Fit Coalescing) reserves a large contiguous region on first use and sub-allocates from it. On `release()`, the arena's blocks are freed back to the arena's free list, but the arena itself retains its address-space reservation. This is intentional for performance — the next session creation reuses the arena without OS round-trips. The consequence is that RSS never returns to pre-`create()` baseline within a single process lifecycle.

**Thread pool multiplication.** Without explicit `OrtEnv` sharing and `DisablePerSessionThreads()`, each `InferenceSession` spawns its own inter-op and intra-op thread pools. In a process creating N sessions, this results in O(N × CPU_count) threads — 25 threads for 5 sessions on an 8-core machine, as documented in ORT issue #4093.

**Mitigation patterns.**

```typescript
// Pattern 1: Reuse a single OrtEnvironment across sessions
const env = new ort.InferenceSession.OrtEnvironment({ /* options */ });
const session = await ort.InferenceSession.create(modelPath, {
    // Reuse environment thread pool
    interOpNumThreads: 1,
    intraOpNumThreads: os.cpus().length,
});

// Pattern 2: Worker isolation — each Worker owns exactly one session
// worker.js
import * as ort from 'onnxruntime-node';
const session = await ort.InferenceSession.create(modelPath);
// When this Worker terminates, ORT env cleanup hook fires
// and the arena is at least released at the allocator level
```

### 5.5 Trade-off Table

| Cleanup Pattern | Deterministic | Per-Worker Safe | OS Memory Return | API Complexity | Node Version | V8 Sandbox Safe |
|----------------|---------------|-----------------|-----------------|----------------|--------------|-----------------|
| GC finalizer (`napi_wrap`) | No — GC-driven | Yes | No — allocator retains | Low (JS) | All | Yes |
| BackingStore deleter | No — GC-driven | Yes (with ref count) | Partial | Medium (C++) | v12+ | No (external buf) |
| `AddEnvironmentCleanupHook` | Yes — env teardown | Yes — per-env | Partial | Medium (C++) | All | Yes |
| Explicit `close()` | Yes — call-stack | Yes (with discipline) | No — allocator retains | Low (JS) | All | Yes |
| `Symbol.dispose` / `using` | Yes — scope exit | Yes | No — allocator retains | Low (JS) | v22+ (sync) | Yes |
| Worker isolation + terminate | Yes — OS thread exit | N/A — is the pattern | Yes — OS reclaims thread pages | High (architecture) | v12+ | Yes |
| jemalloc swap | Structural — allocator | Yes | Yes — design goal | None (LD_PRELOAD) | All (Linux) | Yes |
| `malloc_trim(0)` | Manual — explicit call | Yes | Partial — trims top | Low (C++) | All (Linux/glibc) | Yes |

---

## 6. Open Problems and Gaps

### 6.1 Finalizer Queue Saturation

The inability to drain the finalizer queue from within a tight allocation loop is a fundamental architectural constraint of V8's GC-safe state model. The only mitigation is `await new Promise(setImmediate)` at yield points in the application. There is no N-API mechanism to force queue drainage within an addon. Node.js PR #42208 proposed a dedicated finalizer queue separate from microtasks, but adoption has been slow. This problem particularly affects use cases like embedding system that create many short-lived `ObjectWrap`-ed instances in a loop.

### 6.2 Singleton Anti-Pattern and Worker Re-entrancy

Many mature addons (including older versions of better-sqlite3 and most ONNX Runtime wrappers) use `static` C++ variables for singletons — model weights, connection pools, thread pools. These singletons are shared invisibly across Workers because they live in the shared `.so` address space, not in any `napi_env`. Their destructors are called only at process exit (if at all), not on Worker teardown. This is both a memory management problem (no per-Worker cleanup) and a correctness problem (shared mutable state across concurrent Workers). The recommended `napi_set_instance_data` pattern eliminates this, but migrating existing addons requires careful audit.

### 6.3 Allocator Portability

The behavior of native memory after `free()` differs across platforms:

- **Linux/glibc ptmalloc2**: Fragmentation-prone; freed memory is NOT returned to OS unless at heap top. RSS stays elevated.
- **Linux/jemalloc**: Fragments bounded at ~20%; actively unmaps pages. RSS recoverable.
- **macOS/libmalloc**: Magazine-based; intermediate behavior; RSS partially recoverable.
- **Windows/HeapAlloc**: Page-granular; more aggressive OS return than glibc.

Node.js ships with glibc on most Linux distributions. There is no built-in mechanism for addons to request a different allocator. The jemalloc `LD_PRELOAD` approach works but is fragile in containerized environments, incompatible with some security policies, and requires all native code in the process to use the same allocator. Node.js issue #21973 remains open; there is no consensus on making jemalloc the default.

### 6.4 V8 Memory Cage and External Buffer Deprecation

The V8 memory cage (enabled in Electron 21+, in Chrome 103+) prohibits external ArrayBuffer backing stores. Node.js currently disables this feature to preserve ecosystem compatibility. The long-term trajectory of V8 development points toward universal sandbox enablement for security. When Node.js eventually enables the memory cage, all addons using `napi_create_external_buffer` with native memory pointers will break at runtime. The `napi_no_external_buffers_allowed` return code and the `Napi::Buffer::NewOrCopy` fallback provide a migration path, but require every affected addon to be updated.

### 6.5 `Symbol.asyncDispose` Deployment Gap

`await using` and `Symbol.asyncDispose` remain at TC39 Stage 2 as of early 2026. Most native addon cleanup (closing connections, flushing write-ahead logs, waiting for pending I/O) is inherently asynchronous. The synchronous `Symbol.dispose` cannot `await` the completion of an `sqlite3_close_v2` deferred close or an ORT session teardown that flushes background threads. Until `Symbol.asyncDispose` reaches Stage 4 and is implemented across target Node.js versions, async cleanup must use explicit `await db.close()` calls rather than `using` declarations.

### 6.6 Heap Snapshot Blindness to Native Memory

V8 heap snapshots capture only the V8-managed heap. Native addon memory — whether in the C++ heap, kernel buffers, or mmap'd regions — is invisible to `v8.writeHeapSnapshot()`, Chrome DevTools Memory tab, and heap profiler tooling. The only observable signal is `process.memoryUsage().external` (for BackingStore-tracked memory) and `process.memoryUsage().rss` (for total process RSS). Profiling tools like Valgrind, heaptrack, and `/proc/smaps` on Linux provide native heap visibility but require native debugging expertise. There is no equivalent of the V8 heap snapshot for native memory; this gap makes production diagnosis of native addon memory issues substantially harder than JS heap leak diagnosis.

### 6.7 Worker Termination and In-Flight Native I/O

When `worker.terminate()` is called, JavaScript execution stops immediately. If native C++ code was executing synchronously on the Worker's thread (e.g., a SQLite write in progress), `worker.terminate()` cannot interrupt it — it must wait for the native call to return. If native code is executing on a libuv thread pool thread (e.g., an async database write), `worker.terminate()` does not cancel that operation. The thread pool operation completes, but its callback back into JavaScript never fires because the Worker's event loop is gone. The native memory associated with the callback (e.g., a `napi_async_work` struct) is cleaned up by the environment teardown hook if the addon registers one, but only if the addon author anticipated this scenario.

---

## 7. Conclusion

The V8/C++ memory boundary in Node.js native addons is governed by three structural asymmetries: (1) V8's GC is tracing and non-deterministic while C++ RAII is deterministic; (2) the allocator layer below both is opaque to the GC and fragmentation-prone on Linux; (3) Worker thread isolation provides OS-level cleanup guarantees that application-level cleanup patterns cannot match.

For addon authors, the conclusions are:

- `napi_set_instance_data` with `AddEnvironmentCleanupHook` is the correct mechanism for addon-scoped singletons. Static C++ variables for this purpose are incorrect in a Worker-threads world.
- `AdjustExternalAllocatedMemory` must be called for large native allocations or V8's GC will be blind to memory pressure until the process is OOM-killed.
- Finalizers (`napi_wrap` callbacks, `FinalizationRegistry`) provide safety nets but not guarantees. They cannot substitute for explicit `close()` in resource-intensive paths.
- On Linux with glibc, RSS elevation after cleanup is structural, not a bug. jemalloc or `malloc_trim(0)` can recover pages; Worker isolation enables OS-level reclamation.
- `Symbol.dispose` (synchronous) is now viable for Node.js 22+ and should be implemented on all native wrappers as the JS-layer analogue of RAII.

For application authors using addons like better-sqlite3 and `@huggingface/transformers`:

- A single `db.close()` call does not return SQLite's page cache or mmap'd WAL to the OS. The RSS reduction from close() is at the sqlite3 handle layer; allocator arena and kernel page cache retention persist.
- ONNX Runtime's arena allocator retains address space after `session.release()` by design. Worker isolation is the most reliable strategy for bounding ORT-related RSS.
- Worker thread isolation — one Worker per heavyweight native resource — combined with deterministic Worker termination via `await worker.terminate()` provides the closest approximation to deterministic, OS-level cleanup available within the Node.js runtime model.

---

## References

1. Node.js N-API Documentation (v25). Node.js Foundation. https://nodejs.org/api/n-api.html

2. Node.js C++ Addons Documentation (v25). Node.js Foundation. https://nodejs.org/api/addons.html

3. Node.js Worker Threads Documentation (v25). Node.js Foundation. https://nodejs.org/api/worker_threads.html

4. Lees-Miller, A. (2023). "Electron and the V8 Memory Cage." Electron Blog. https://www.electronjs.org/blog/v8-memory-cage

5. Henningsen, A. (2020). "buffer,n-api: release external buffers from BackingStore callback." Node.js PR #33321. https://github.com/nodejs/node/pull/33321

6. Schulhof, G. (2021). "unbounded memory usage in unyielding JS jobs creating ObjectWrap-ed native objects." nodejs/node-addon-api Issue #1140. https://github.com/nodejs/node-addon-api/issues/1140

7. Schulhof, G. (2019). "ObjectWrap destructor crashes node due to double napi delete calls." nodejs/node-addon-api Issue #660. https://github.com/nodejs/node-addon-api/issues/660

8. Cheung, J. (2024). "Memory leak regression testing with V8/Node.js, part 2 — finalizer-based testing." https://joyeecheung.github.io/blog/2024/03/17/memory-leak-testing-v8-node-js-2/

9. WiseLibs. (2019). "How does better-sqlite3 manage memory?" better-sqlite3 Issue #150. https://github.com/WiseLibs/better-sqlite3/issues/150

10. WiseLibs. (2022). "Possible Memory Leak with Inserting Data." better-sqlite3 Issue #764. https://github.com/WiseLibs/better-sqlite3/issues/764

11. WiseLibs. better-sqlite3 source: addon.cpp, database.cpp, statement.cpp. https://github.com/WiseLibs/better-sqlite3

12. brand.dev Engineering. (2024). "Preventing Memory Issues in Node.js Sharp: A Journey." https://www.brand.dev/blog/preventing-memory-issues-in-node-js-sharp-a-journey

13. Attard, L. (2021). "Debugging high memory consumption for sharp.toBuffer." lovell/sharp Issue #890. https://github.com/lovell/sharp/issues/890

14. Sharp API documentation — Global properties. https://sharp.pixelplumbing.com/api-utility/

15. Automattic. (2018). "Memory leak in version 2.0." node-canvas Issue #922. https://github.com/Automattic/node-canvas/issues/922

16. Automattic. node-canvas source: Image.cc. https://github.com/Automattic/node-canvas/blob/master/src/Image.cc

17. Microsoft ONNX Runtime. (2024). "Memory leak and thread pools not closing." onnxruntime Issue #4093. https://github.com/microsoft/onnxruntime/issues/4093

18. Microsoft ONNX Runtime. (2024). "Memory leak after releasing inference session." onnxruntime Issue #25325. https://github.com/microsoft/onnxruntime/issues/25325

19. Buckton, R. (TC39). "proposal-explicit-resource-management." https://github.com/tc39/proposal-explicit-resource-management

20. V8 Team. (2022). "JavaScript's New Superpower: Explicit Resource Management." V8 Blog. https://v8.dev/features/explicit-resource-management

21. V8 Team. (2019). "Trash talk: the Orinoco garbage collector." V8 Blog. https://v8.dev/blog/trash-talk

22. Cloudflare. "We shipped FinalizationRegistry in Workers: why you should never use it." https://blog.cloudflare.com/we-shipped-finalizationregistry-in-workers-why-you-should-never-use-it/

23. Node-Addon-API. "Finalization documentation." https://github.com/nodejs/node-addon-api/blob/main/doc/finalization.md

24. Node-Addon-API. "ObjectWrap documentation." https://github.com/nodejs/node-addon-api/blob/main/doc/object_wrap.md

25. Node.js Addon Examples. "Context awareness." https://nodejs.github.io/node-addon-examples/special-topics/context-awareness/

26. Node.js. "Understanding and Tuning Memory." https://nodejs.org/en/learn/diagnostics/memory/understanding-and-tuning-memory

27. Previti, S. (2020). "Should inform V8's GC about externally allocated memory." roaring-node Issue #37. https://github.com/SalvatorePreviti/roaring-node/issues/37

28. Getz, B. (2021). "Why don't we use jemalloc?" nodejs/node Issue #21973. https://github.com/nodejs/node/issues/21973

29. Node.js. "src: clean up resources on Environment teardown." PR #19377. https://github.com/nodejs/node/pull/19377

30. IT Hare. (2016). "Testing Memory Allocators: ptmalloc2 vs tcmalloc vs hoard vs jemalloc." http://ithare.com/testing-memory-allocators-ptmalloc2-tcmalloc-hoard-jemalloc-while-trying-to-simulate-real-world-loads/

31. SQLite Foundation. "sqlite3_close / sqlite3_close_v2." https://sqlite.org/c3ref/close.html

32. SQLite Foundation. "Write-Ahead Logging." https://sqlite.org/wal.html

33. SQLite Foundation. "Memory-Mapped I/O." https://sqlite.org/mmap.html

34. Callstack. "Memory Ownership Models: When JavaScript Meets Native Code." https://www.callstack.com/blog/memory-ownership-models-when-javascript-meets-native-code

35. Node.js. "worker: fix crash when SharedArrayBuffer outlives creating thread." Commit d4e397a900. https://github.com/nodejs/node/commit/d4e397a900

36. InfoQ. (2025). "TC39 Advances Nine JavaScript Proposals, Including Array.fromAsync, Error.isError, and Using." https://www.infoq.com/news/2025/06/tc39-stage-4-2025/

37. V8 API Reference. "ArrayBuffer Class Reference." https://v8.github.io/api/head/classv8_1_1ArrayBuffer.html

38. V8 API Reference. "Isolate Class Reference (AdjustAmountOfExternalAllocatedMemory)." https://v8docs.nodesource.com/node-7.10/d5/dda/classv8_1_1_isolate.html

---

## Practitioner Resources

### Diagnosing Native Memory Issues

```bash
# 1. Observe RSS vs heap split (Node.js)
node -e "
  setInterval(() => {
    const m = process.memoryUsage();
    console.log(JSON.stringify({
      rss_mb: (m.rss / 1048576).toFixed(1),
      heap_mb: (m.heapUsed / 1048576).toFixed(1),
      external_mb: (m.external / 1048576).toFixed(1),
      arrayBuffers_mb: (m.arrayBuffers / 1048576).toFixed(1),
    }));
  }, 1000);
"

# 2. Linux: detailed memory map
cat /proc/<pid>/smaps | grep -A5 "heap\|sqlite\|libvips\|onnx"

# 3. Linux: heaptrack for native allocation profiling
heaptrack node ./app.js
heaptrack_gui heaptrack.node.*.gz

# 4. macOS: Instruments Allocations template
instruments -t Allocations -D trace.trace node ./app.js

# 5. Linux: jemalloc swap (diagnostic, not production)
LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2 node ./app.js
```

### Implementing Correct Cleanup Hooks in C++

```cpp
// CORRECT: Per-env singleton with cleanup hook
struct AddonData {
    sqlite3* db;

    static AddonData* Get(napi_env env) {
        AddonData* data;
        napi_get_instance_data(env, reinterpret_cast<void**>(&data));
        return data;
    }

    static void Cleanup(napi_env env, void* raw, void* hint) {
        AddonData* data = static_cast<AddonData*>(raw);
        if (data->db) {
            sqlite3_close(data->db);
            data->db = nullptr;
        }
        delete data;
    }
};

napi_value ModuleInit(napi_env env, napi_value exports) {
    AddonData* data = new AddonData{};
    sqlite3_open(":memory:", &data->db);
    napi_set_instance_data(env, data, AddonData::Cleanup, nullptr);
    return exports;
}

// INCORRECT: Static singleton bypasses per-env cleanup
// static sqlite3* g_db = nullptr;  // DON'T DO THIS
```

### TypeScript Pattern: Symbol.dispose + try-finally fallback

```typescript
// Works on Node.js 22+ with Symbol.dispose native support
// Falls back to try-finally on older versions

function isDisposable(obj: unknown): obj is Disposable {
    return obj != null && typeof (obj as Disposable)[Symbol.dispose] === 'function';
}

class DatabaseConnection implements Disposable {
    private db: NativeDatabase;
    private closed = false;

    constructor(path: string) {
        this.db = NativeDatabase.open(path);
    }

    query<T>(sql: string, params?: unknown[]): T[] {
        if (this.closed) throw new Error('Database is closed');
        return this.db.query(sql, params);
    }

    close(): void {
        if (!this.closed) {
            this.db.close();
            this.closed = true;
        }
    }

    [Symbol.dispose](): void {
        this.close();
    }
}

// Usage — deterministic cleanup on scope exit
function processBatch(items: Item[]): Result[] {
    using db = new DatabaseConnection('./batch.db');
    // Exception here? db[Symbol.dispose]() still fires.
    return items.map(item => db.query('SELECT ...', [item.id]));
}  // db.close() guaranteed here

// Pre-Node.js 22 fallback
function processBatchLegacy(items: Item[]): Result[] {
    const db = new DatabaseConnection('./batch.db');
    try {
        return items.map(item => db.query('SELECT ...', [item.id]));
    } finally {
        db.close();
    }
}
```

### Worker Isolation Pattern for Heavyweight Native Addons

```typescript
// worker-pool.ts — manages a pool of Workers, each owning one native session
import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';

class NativeWorkerPool extends EventEmitter {
    private workers: Worker[] = [];
    private available: Worker[] = [];

    constructor(
        private workerScript: string,
        private poolSize: number,
    ) {
        super();
    }

    async init(): Promise<void> {
        for (let i = 0; i < this.poolSize; i++) {
            const worker = new Worker(this.workerScript);
            await new Promise<void>((resolve, reject) => {
                worker.once('message', (msg) => {
                    if (msg.type === 'ready') resolve();
                });
                worker.once('error', reject);
            });
            this.workers.push(worker);
            this.available.push(worker);
        }
    }

    async run<T>(payload: unknown): Promise<T> {
        // Wait for available worker
        while (this.available.length === 0) {
            await new Promise<void>(resolve => this.once('workerAvailable', resolve));
        }
        const worker = this.available.pop()!;

        return new Promise<T>((resolve, reject) => {
            worker.once('message', (msg) => {
                this.available.push(worker);
                this.emit('workerAvailable');
                if (msg.error) reject(new Error(msg.error));
                else resolve(msg.result);
            });
            worker.postMessage(payload);
        });
    }

    async shutdown(): Promise<void> {
        // Worker termination triggers AddEnvironmentCleanupHook in native addon
        await Promise.all(this.workers.map(w => w.terminate()));
        // After terminate(), OS reclaims Worker thread pages
        this.workers = [];
        this.available = [];
    }
}

// sqlite-worker.js (loaded in Worker thread)
// import Database from 'better-sqlite3';
// const db = new Database('./app.db');
// parentPort.postMessage({ type: 'ready' });
// parentPort.on('message', (payload) => {
//     try {
//         const result = db.prepare(payload.sql).all(payload.params);
//         parentPort.postMessage({ result });
//     } catch (e) {
//         parentPort.postMessage({ error: e.message });
//     }
// });
// process.on('beforeExit', () => db.close());
```

### Monitoring External Memory Correctly

```typescript
// Tell V8 about large native allocations to trigger timely GC
// (Call from the C++ addon, not from JS)

// C++ wrapper pattern (node-addon-api):
void MyNativeObject::NotifyV8MemoryUsage(Napi::Env env, int64_t delta_bytes) {
    env.GetIsolate()->AdjustAmountOfExternalAllocatedMemory(delta_bytes);
}

// JavaScript: track external + arrayBuffers, not just heapUsed
function logMemoryBreakdown(label: string): void {
    const m = process.memoryUsage();
    const nativeEstimate = m.rss - m.heapTotal;
    console.log(`[${label}]`, {
        js_heap_mb: (m.heapUsed / 1e6).toFixed(1),
        v8_tracked_external_mb: (m.external / 1e6).toFixed(1),
        array_buffers_mb: (m.arrayBuffers / 1e6).toFixed(1),
        // rss - heapTotal is a rough proxy for native C++ heap + kernel buffers
        estimated_native_mb: (nativeEstimate / 1e6).toFixed(1),
        total_rss_mb: (m.rss / 1e6).toFixed(1),
    });
}
```
