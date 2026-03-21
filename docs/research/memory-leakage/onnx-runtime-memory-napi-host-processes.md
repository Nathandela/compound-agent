# ONNX Runtime Memory Behavior in N-API Host Processes

**A Technical Survey**

---

## Abstract

When a 23 MB quantized ONNX model is loaded via `@huggingface/transformers` in a Node.js process, the operating-system-reported resident set size (RSS) inflates to 370–460 MB and never returns to baseline after `pipeline.dispose()` is called. This survey provides a PhD-level mechanistic explanation of that phenomenon. We trace the inflation through five compounding causes: protobuf deserialization doubling, graph optimization copies, weight prepacking, BFCArena pre-allocation with the `kNextPowerOfTwo` extension strategy, and thread-pool stack memory. We then explain why `dispose()` fails to reclaim RSS: arena chunks are returned to the arena's free-bin list rather than to the OS; the initial allocation region is explicitly exempt from shrinkage under the default extension strategy; and the glibc/macOS allocator further retains freed heap pages in its own internal arenas. The N-API memory boundary compounds the problem because V8 is unaware of native allocations and therefore cannot schedule GC pressure on them. We analyze alternative approaches — subprocess isolation, WASM backend, worker-thread isolation, arena parameter tuning, and alternative allocators — and compare ONNX Runtime's behavior against TensorFlow.js/libtensorflow, PyTorch/libtorch, and llama.cpp's mmap model. The survey concludes with a comparative synthesis table and a catalog of open problems.

---

## 1. Introduction

Modern text-embedding pipelines for local use increasingly rely on compact ONNX models distributed through the Hugging Face Hub. The nomic-embed-text-v1.5 model in its INT8 (q8) quantization occupies roughly 23 MB on disk and produces 768-dimensional vectors. When loaded via `@huggingface/transformers` in a Node.js process — the canonical path for tools like compound-agent — the process RSS climbs to 370–460 MB, representing a 16–20× inflation factor relative to the serialized model file size.

This inflation is not a bug that can be patched in a single commit. It is the aggregate consequence of a stack of architectural decisions spanning ONNX's protobuf wire format, the ONNX Runtime graph compilation pipeline, the BFCArena allocator design, glibc's thread-local arena strategy, and the N-API boundary between V8 and native code. Each layer individually makes a defensible engineering trade-off; their composition produces a memory profile that surprises practitioners who expect "dispose cleans up after the model."

This survey addresses four research questions:

1. Where does the 16–20× inflation come from, in quantitative terms?
2. Why does `dispose()` / `release()` not return RSS to the OS?
3. What architectural constraints at the N-API boundary amplify the problem?
4. What isolation and tuning strategies exist, and what are their trade-offs?

### 1.1 Scope and Motivation

The survey is motivated by a concrete production scenario in compound-agent, a learning system that uses nomic-embed-text-v1.5 for semantic search over lesson files. During test-suite development, the embedding subsystem was discovered to leave 370–460 MB of RSS permanently allocated in long-lived Vitest worker processes, accumulating across test runs and inflating memory pressure for the entire test suite. The solution chosen — spawning a subprocess for the probe and allowing the OS to reclaim all memory on exit — is itself one of the isolation strategies analyzed in Section 4.3.

The survey is written for practitioners who need to understand *why* the problem exists at an architectural level in order to evaluate trade-offs confidently, and for researchers interested in the intersection of ML runtime design and OS memory management.

### 1.2 Terminology

| Term | Definition |
|------|-----------|
| RSS | Resident Set Size: physical RAM pages currently mapped to a process |
| Arena | A contiguous memory region managed by a custom allocator, not returned to the OS on individual `free()` calls |
| BFCArena | ONNX Runtime's "Best-Fit with Coalescing" arena allocator, derived from TensorFlow's BFC allocator |
| N-API | Node.js stable ABI for native addons; provides `napi_create_external_arraybuffer` and finalizer callbacks |
| PrePacking | ONNX Runtime optimization that reformats weight tensors for MLAS kernel efficiency at session init time |
| kNextPowerOfTwo | BFCArena extension strategy that grows the arena by rounding up to the next power of two |
| OrtEnv | The process-singleton ONNX Runtime environment object; owns global thread pools |

---

## 2. Foundations

### 2.1 ONNX Runtime Architecture

ONNX Runtime is a cross-platform inference engine designed around a provider-centric graph execution model. Its core abstraction is the **execution provider (EP)**: an object that declares which graph nodes it can handle, exposes a memory allocator for its device, and executes assigned subgraphs. The CPU EP uses Microsoft's MLAS (Math Library for Accelerated Inference) as its compute backend.

#### 2.1.1 Session Initialization Phases

An `InferenceSession.create()` call in onnxruntime-node triggers a four-phase initialization sequence in C++:

```
Phase 1 — Load
  ├── Parse ONNX protobuf → internal Graph representation
  ├── Allocate in-memory model proto (doubles weight memory transiently)
  └── Resolve domain/version mappings

Phase 2 — Initialize
  ├── RegisterExecutionProviders()   → CPU EP always; CUDA/DirectML/CoreML optionally
  ├── TransformGraph()               → Apply graph optimization passes (3 levels)
  ├── PartitionGraph()               → Assign nodes to EPs; insert MemcpyFromHost/ToHost
  ├── CreateKernels()                → Instantiate operator kernel objects
  ├── PrepackConstantInitializedTensors() → Reformat weights for MLAS kernels
  └── InitializeSessionState()       → Finalize allocator assignments

Phase 3 — Memory Planning (optional, when enable_mem_pattern=true)
  └── Analyze activation tensor lifetimes → build static allocation plan
      (intermediate buffers share address space via lifetime non-overlap)

Phase 4 — Ready
  └── Session object returned to caller; arena has been pre-allocated
```

During Phase 1, the weight tensors from the protobuf are converted to ORT's internal representation. The original protobuf data and the new in-memory representation coexist momentarily — a contributor confirmed on GitHub Issue #3802: "the initializers from the model file's protobuf format are converted to the ORT in-memory format. After the conversion the original initializers from the protobuf are freed, but until that point you'll have roughly double the size of the initializers in memory." For a 23 MB model this accounts for ~46 MB transiently.

During Phase 2, the graph optimization transformer pipeline may create new initializer tensors for constant-folded subgraphs. These are freed after optimization completes, but peak memory during optimization exceeds the final steady-state by an additional factor.

PrePacking (Phase 2, final step) is the largest single contributor to steady-state inflation. It reformats weight matrices from their serialized layout into MLAS-optimized tile packing (B-panel packing for GEMM, etc.). The prepacked buffers coexist with the original tensors until the original tensors are released. An experiment documented in GitHub Issue #21448 showed that disabling PrePacking entirely reduced memory commit by 77% on a 1.85 GB model (a ~1.4 GB reduction), at the cost of dramatically slower inference. For nomic-embed-text-v1.5 at q8 (INT8), the int8→int8 prepacked layout requires approximately the same storage as the original (no precision change), but the transposed and tiled arrangement means both exist concurrently during initialization.

#### 2.1.2 The OrtEnv Singleton

One architectural detail with lasting memory consequences is `OrtEnv`. This is a process-global singleton that owns:
- The global logging manager
- System-wide thread pools (when `DisablePerSessionThreads()` is set)
- Any allocators registered at the environment level

OrtEnv persists for the lifetime of the process. Even after all `InferenceSession` objects are destroyed, OrtEnv continues to hold its thread pool threads. In the Node.js binding, onnxruntime-node initializes OrtEnv at module load time and never destroys it before process exit. This is architecturally intentional: the cost of thread pool teardown and re-creation on session churn exceeds the cost of keeping the threads alive.

### 2.2 The BFCArena Allocator

The BFCArena is ONNX Runtime's primary CPU memory allocator when `enable_cpu_mem_arena=true` (the default). It is derived from TensorFlow's BFC allocator, itself inspired by Doug Lea's dlmalloc design philosophy. Understanding BFCArena is essential to understanding why RSS does not drop after `dispose()`.

#### 2.2.1 Data Structures

```
BFCArena
├── device_allocator_     (CPUAllocator — wraps malloc/free)
├── region_manager_       (maps pointer ranges to AllocationRegions)
│   └── AllocationRegion[]
│       ├── ptr_          (base pointer from malloc)
│       ├── memory_size_  (size of this region)
│       └── ChunkHandle[] (array of chunk descriptors)
├── bins_[21]             (free chunk bins, power-of-two sized)
│   └── Bin
│       ├── bin_size      (min allocation for this bin)
│       └── free_chunks   (set<ChunkHandle, ChunkComparator>)
└── chunks_               (all chunks, free and in-use)
    └── Chunk
        ├── ptr           (base address)
        ├── size          (allocated size)
        ├── requested_size (original request)
        ├── allocation_id (-1 if free)
        ├── prev/next     (doubly-linked contiguous chain)
        └── stream/sync_id (for stream-aware allocation)
```

Bins are indexed logarithmically. `BinNumToSize(index) = 256 << index`, creating 21 bins spanning from 256 bytes (Bin 0) to ~134 MB (Bin 19). Large allocations above the largest bin go to Bin 20. The minimum allocation unit (`kMinAllocationSize`) is 256 bytes.

#### 2.2.2 The kNextPowerOfTwo Extension Strategy

When a requested allocation cannot be satisfied from existing free chunks, `Extend()` is called. Under the default `kNextPowerOfTwo` strategy:

```
Extend(needed_bytes):
  rounded = next power of two >= needed_bytes
  region_ptr = device_allocator_.Alloc(rounded)
  Add region to region_manager_
  Create one large free chunk spanning the region
  Split chunk: return requested portion, add remainder to bins
```

The growth doubles aggressively: a 1 MB initial chunk grows to 2 MB, 4 MB, 8 MB, up to 1 GB maximum per extension. For a model like nomic-embed-text-v1.5 whose weights plus activation buffers require ~130–260 MB during initialization (q8 with activation overhead), the arena may commit several power-of-two regions before stabilizing.

This strategy is acknowledged in the official documentation: "all memory allocations except the initial allocation are considered for de-allocation at shrinkage, with the idea that users set a high enough `initial_chunk_size_bytes` to process most model requests without allocating more memory."

#### 2.2.3 The Shrink() Contract and Why RSS Does Not Drop

```
BFCArena::Free(ptr):
  if ptr in reserved_chunks_:
    device_allocator_.Free(ptr)   // immediately back to OS
    return
  DeallocateRawInternal(ptr):
    mark chunk as free (allocation_id = -1)
    insert chunk into appropriate free bin
    coalesce with adjacent free chunks
    // NOTE: does NOT call device_allocator_.Free()

BFCArena::Shrink():
  for each AllocationRegion R in region_manager_:
    if all chunks in R are free:
      for each chunk in R: remove from bins
      region_manager_.RemoveAllocationRegion(R)
      device_allocator_.Free(R.ptr)  // OS sees freed pages
      // BUT: if strategy==kNextPowerOfTwo AND R==initial_region:
      //   consider_first_allocation_region_for_shrinkage_ = false
      //   SKIP this region
```

The critical design decision: `Shrink()` only returns memory to the OS when an **entire region** is free. For the initial region under `kNextPowerOfTwo`, it is **never** returned — `consider_first_allocation_region_for_shrinkage_` is set to `false`. For subsequent regions, they must be *completely* free before shrinkage occurs.

In practice, ONNX Runtime's destructor calls `Shrink()` when the session is destroyed, but because:
1. The initial region is exempt from shrinkage
2. Some allocations (kernel objects, cached metadata) may span multiple regions keeping them non-empty
3. Thread-local buffers and profiling data may retain references

...the arena retains substantial committed memory. GitHub Issue #26831 documented a representative case: after calling `ReleaseSession` and `ReleaseEnv`, 1.16 GB remained allocated on a Linux system that had consumed 1.8 GB during inference.

#### 2.2.4 The System Allocator Layer Below BFCArena

Even for allocations that BFCArena does return to `CPUAllocator::Free()` (i.e., `device_allocator_.Free()`), that call reaches `free()` in glibc (on Linux) or `free()` in libSystem (on macOS). Neither immediately returns pages to the OS.

On Linux, glibc's ptmalloc2 maintains per-thread arenas (up to `MALLOC_ARENA_MAX = 8 × CPU_cores` by default). Each arena is a brk-extended heap segment. When `free()` is called, the block is placed on the arena's free list. Pages are only returned via `sbrk(-n)` (for top-of-heap blocks) or `madvise(MADV_FREE)` (for mmap-allocated blocks above `MMAP_THRESHOLD`). Algolia's engineering team documented a case where glibc retained ~137 GB of free blocks across 96 arenas, all unreturned to the OS. The `malloc_trim(0)` call explicitly requests glibc to release top-of-heap pages, and has been proposed as a post-`ReleaseSession` workaround in ONNX Runtime GitHub Issues #25325 and #26831.

macOS uses a different allocator (libmalloc with the nano-allocator for small objects and scalable zones for larger ones). Empirically, macOS tends to return more memory to the OS after free because it uses `madvise(MADV_FREE_REUSABLE)` — the system can reclaim those pages under pressure. GitHub Issue #26831 notes: "the macOS seems to be reclaiming the memory" while Linux does not, explaining why the behavior differs across platforms.

The full chain from application `dispose()` to OS RSS reduction:

```
app calls dispose() → InferenceSession destructor
       ↓
BFCArena::Shrink() called (where applicable)
       ↓
CPUAllocator::Free(region_ptr)   [only for non-exempt regions]
       ↓
glibc free(region_ptr)
       ↓
ptmalloc2 places block in arena free-list
       ↓  (NOT immediate — depends on block position and fragmentation)
sbrk(-n) or madvise(MADV_FREE)
       ↓  (NOT guaranteed — only under specific conditions)
OS page table: pages marked as free
       ↓  (only now does RSS drop)
ps/top reports lower RSS
```

### 2.3 Thread Pools and Their Memory Footprint

By default, each ONNX Runtime session creates two thread pools:
- **Intra-op pool**: parallelizes computation within a single operator (e.g., GEMM chunks)
- **Inter-op pool**: parallelizes independent operators in the graph

With `intra_op_num_threads=0` (default), the intra-op pool creates one thread per physical CPU core. On a machine with 8 physical cores, this means 8 threads. The inter-op pool defaults to 1 thread (sequential execution).

Each worker thread receives a stack allocation from the OS. On Linux the default thread stack size is 8 MB (controlled by `ulimit -s`); on macOS the default is 8 MB for secondary threads. For 8 intra-op threads:

```
Thread stack memory: 8 threads × 8 MB = 64 MB
```

This 64 MB is mapped into the process's virtual address space and contributes to RSS as each thread's stack pages are touched during inference. When the session is destroyed and threads are joined, the stacks are unmapped — but only if the thread pool is truly destroyed. When `DisablePerSessionThreads()` is set (or OrtEnv holds global pools), thread stack memory persists indefinitely.

Additionally, the ONNX Runtime threading subsystem uses Eigen's thread pool implementation in recent versions, which allocates per-thread local state structures for task queuing, approximately 1–4 KB per thread beyond the stack.

### 2.4 Memory Inflation Accounting for nomic-embed-text-v1.5 (q8)

The model's components at each phase:

| Source | Estimated Size | Notes |
|--------|---------------|-------|
| ONNX file on disk (q8) | ~23 MB | Serialized protobuf + INT8 weights |
| Protobuf parse + in-memory graph | ~46 MB | Temporary double-allocation during conversion |
| Graph optimization copies | ~20–40 MB | Temporary; freed after TransformGraph() |
| INT8 weights in OrtValue tensors | ~23 MB | Post-conversion, original protobuf freed |
| Prepacked MLAS weight buffers | ~30–60 MB | Coexist with originals during init |
| BFCArena initial chunk + extensions | ~64–128 MB | kNextPowerOfTwo growth; includes activation space |
| Activation buffers (inference) | ~30–60 MB | For 512-token input through 12 transformer layers |
| Thread pool stacks (8 threads) | ~64 MB | 8 MB each, touched during first inference |
| OrtEnv / logging / kernel metadata | ~10–20 MB | Session-state objects, kernel registry |
| glibc / libmalloc arena overhead | ~30–50 MB | Per-thread arenas, metadata, fragmentation |

**Total estimated peak RSS: ~350–500 MB**

The observed 370–460 MB falls within this range. The primary variables are the BFCArena pre-allocation amount (depends on kNextPowerOfTwo growth path) and the thread count.

The disk-to-RSS ratio of ~16–20× decomposes as:
- 10× attributable to BFCArena pre-allocation + thread stacks + activation buffers
- 3–5× attributable to model format overhead (INT8 → MLAS packing) and graph optimization temporaries
- 2–3× attributable to allocator fragmentation and glibc arena retention

---

## 3. Taxonomy of Approaches

The strategies for managing ONNX Runtime memory in long-lived Node.js processes fall into five categories:

### 3.1 Arena Configuration Tuning

Modify session options to reduce arena pre-allocation:
- `enable_cpu_mem_arena = false`: disables BFCArena; each allocation uses the system allocator directly
- `arena_extend_strategy = kSameAsRequested`: grow by exactly what is requested rather than power-of-two rounding
- `initial_chunk_size_bytes`: sets the initial arena commitment
- `memory.enable_memory_arena_shrinkage`: enables periodic Shrink() calls

### 3.2 Allocator Substitution

Replace glibc's ptmalloc2 with an allocator that returns memory to the OS more aggressively:
- **mimalloc**: Microsoft's compact general-purpose allocator; ONNX Runtime has build-level support (`--use_mimalloc`); on Linux, usable via `LD_PRELOAD`
- **jemalloc**: Facebook's allocator; designed for minimal fragmentation; `LD_PRELOAD` on Linux
- **tcmalloc**: Google's thread-caching malloc; similar approach
- `malloc_trim(0)`: explicit trim call after session destruction; not directly accessible from Node.js without an FFI call

### 3.3 Process Isolation

Load the model in a subprocess so that all native allocations are reclaimed by the OS on process exit:
- `child_process.execFile(process.execPath, ['-e', script])`: full process isolation via inline script
- `child_process.fork()`: shares Node.js executable, new V8 isolate, full memory separation
- `cluster.fork()`: process-level isolation with built-in IPC channel

### 3.4 Worker Thread Isolation

Load the model in a Node.js worker thread, then terminate the thread:
- `new Worker(code, { eval: true })`: separate V8 isolate, but shared OS process memory space
- Transfer tensor data back via `SharedArrayBuffer` or message-passing before termination

### 3.5 WASM Backend

Use `onnxruntime-web` instead of `onnxruntime-node`:
- Model runs inside WebAssembly's linear memory (a growable `ArrayBuffer`)
- Memory layout is isolated within the WASM heap
- Releasing WASM module and allowing GC frees the `ArrayBuffer`, returning pages to the OS

### 3.6 Model Quantization and Compression

Reduce the model's weight footprint to shrink all downstream inflation:
- `dtype: 'q8'` (INT8): already applied in the compound-agent case
- `dtype: 'q4'` (INT4): further halves weight storage; accuracy trade-off
- `dtype: 'fp16'`: lower precision floating point; ~2× savings vs. fp32

---

## 4. Analysis

### 4.1 Arena Configuration Tuning

#### 4.1.1 Theory and Mechanism

Setting `enable_cpu_mem_arena = false` instructs ONNX Runtime to use `CPUAllocator` directly for all tensor allocations, bypassing BFCArena entirely. Each `Alloc()` call goes to `malloc()` and each `Free()` call goes to `free()`. Since there is no interposed arena, `free()` has a direct path to glibc, which in turn has a (probabilistic) path back to the OS.

Setting `arena_extend_strategy = kSameAsRequested` keeps BFCArena in place but eliminates the power-of-two inflation: extensions allocate exactly the requested size. This also sets `consider_first_allocation_region_for_shrinkage_ = true`, making the initial region eligible for reclamation by `Shrink()`.

From GitHub Issue #11627, ONNX Runtime contributor Tianlei Wu confirmed: "The memory arena system pre-allocates buffer space to optimize performance... without arena allocation, each inference operation requires heap memory allocation, increasing inference time."

#### 4.1.2 Literature Evidence

GitHub Issue #14029 documented that setting `enable_cpu_mem_arena = False` and `enable_mem_pattern = False` brought ONNX Runtime's memory usage "to torch level" on a Linux system with CUDA 11.3. GitHub Issue #11627 showed a 2 MB model consuming up to 6 GB with arena enabled (kNextPowerOfTwo over-allocation) versus ~217 MB with arena disabled — a 27× reduction in that pathological case.

#### 4.1.3 Implementations and Benchmarks

In Python, the configuration is:

```python
opts = ort.SessionOptions()
opts.enable_cpu_mem_arena = False
opts.enable_mem_pattern = False
```

In Node.js via onnxruntime-node:

```typescript
const session = await ort.InferenceSession.create(modelPath, {
  enableCpuMemArena: false,
  enableMemPattern: false,
});
```

For `@huggingface/transformers`, session options can be passed through `env.backends.onnx.wasm.sessionOptions` for the WASM backend or via the `session_options` parameter passed to `createInferenceSession()`.

#### 4.1.4 Strengths and Limitations

**Strengths**: Reduces peak RSS substantially; makes RSS drop after dispose more likely; no code restructuring required; single configuration flag change.

**Limitations**: Increases inference latency because each operation allocates fresh memory from glibc rather than from a pre-allocated arena; does not address glibc arena retention (RSS may still not return to baseline); does not address OrtEnv/thread pool memory; does not address PrePacking memory; the improvement is model- and workload-dependent.

---

### 4.2 Allocator Substitution

#### 4.2.1 Theory and Mechanism

The glibc ptmalloc2 allocator suffers from two compounding problems: (1) per-thread arena proliferation (up to 8 × CPU_cores arenas by default), each an independent heap that cannot release memory to other arenas even when all their data is freed; (2) heap compaction only at the top of the brk segment, meaning interleaved allocations permanently fragment and strand free blocks.

jemalloc addresses this through slab-based allocation with size-class segregation and explicit `purge` operations that use `madvise(MADV_FREE)` to return pages to the OS. tcmalloc uses a two-level system: per-thread caches for small objects and a central page heap that can return spans to the OS. mimalloc uses "free list sharding" with per-page metadata enabling efficient bulk reclamation.

On Linux, these allocators can be substituted without recompiling ONNX Runtime:

```bash
LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so node app.js
```

#### 4.2.2 Literature Evidence

Cloudflare documented a case study where switching RocksDB from ptmalloc2 to tcmalloc reduced physical memory usage from ~2.5 GB to ~1 GB — a 60% reduction — with no performance degradation. The root cause was ptmalloc2's inability to return interleaved-freed pages to the OS. The Algolia engineering blog documented `malloc_trim(0)` reducing a glibc-retained memory pool from 57 GB to 20 GB (a 65% reduction) in a single call, with 96 arenas retaining ~137 GB of technically-free memory.

#### 4.2.3 Implementations and Benchmarks

ONNX Runtime natively supports mimalloc through build flags on Windows. On Linux, jemalloc's `MALLOC_CONF="background_thread:true,metadata_thp:auto,dirty_decay_ms:1000,muzzy_decay_ms:1000"` enables aggressive background decay. The `MALLOC_ARENA_MAX` environment variable (`MALLOC_ARENA_MAX=4`) limits glibc arena proliferation at the cost of increased lock contention.

#### 4.2.4 Strengths and Limitations

**Strengths**: Works transparently without modifying ONNX Runtime code or session configuration; can dramatically improve RSS reclamation on Linux; no inference latency penalty.

**Limitations**: LD_PRELOAD-based substitution is brittle in containerized or restricted environments; does not address BFCArena's shrinkage exemption for the initial region; does not address thread pool memory; MALLOC_ARENA_MAX tuning trades fragmentation resistance for potential lock contention; behavior differences between Linux (where it helps significantly) and macOS (where the system allocator already does reasonable page reclamation).

---

### 4.3 Process Isolation

#### 4.3.1 Theory and Mechanism

When a child process exits, the OS reclaims all pages in its address space unconditionally — regardless of allocator strategy, arena state, or unfired finalizers. This is the only mechanism that guarantees 100% RSS reclamation. The mechanism is implemented in compound-agent's `model-probe.ts` as:

```typescript
execFile(process.execPath, ['-e', PROBE_SCRIPT], { timeout: 10_000 }, callback)
```

where `PROBE_SCRIPT` initializes the pipeline, calls `p.dispose()`, and exits with code 0. The parent process sees exit code 0 and concludes the model is usable, without retaining any of the child's allocations.

The key architectural insight is that RSS isolation maps exactly to OS process boundaries. Virtual address space is per-process; the MMU's page table entries for a given process are discarded on `exit()` or `waitpid()`. No amount of arena management, GC tuning, or finalizer orchestration can match this guarantee within a single process.

#### 4.3.2 Literature Evidence

GitHub issue discussions (e.g., Issues #25325 and #4093) consistently identify subprocess respawning as the only reliable workaround for persistent RSS inflation when model reloading is needed in production services. Multiple Node.js worker thread issues confirm that worker_threads with native addons can retain RSS after termination due to native allocator state not being cleaned up, making subprocess isolation more reliable than worker thread isolation for native code.

#### 4.3.3 Implementations and Benchmarks

Three subprocess strategies are available in Node.js:

```
Strategy A: child_process.execFile(node, ['-e', script])
  Isolation:  Complete — new process, new V8 isolate
  Overhead:   ~50–200 ms process spawn time
  IPC:        Via stdout/stderr or exit code
  Best for:   One-shot probe/check patterns

Strategy B: child_process.fork(module)
  Isolation:  Complete — new process, inherits module resolution
  Overhead:   ~100–300 ms (full Node.js init)
  IPC:        Built-in IPC channel (send/on('message'))
  Best for:   Returning structured inference results

Strategy C: cluster.fork()
  Isolation:  Complete — server-oriented process pool
  Overhead:   Similar to fork()
  IPC:        Via cluster IPC
  Best for:   Long-running inference worker pools
```

For the model-probe use case (one-time usability check), Strategy A with an inline script is optimal: it avoids requiring a separate module file, minimizes spawn overhead, and communicates result through exit code alone.

#### 4.3.4 Strengths and Limitations

**Strengths**: 100% RSS reclamation guaranteed; no ONNX Runtime internals knowledge required; works regardless of OS, allocator, or ONNX Runtime version; the parent process is fully isolated from child crashes or segfaults during model initialization.

**Limitations**: Process spawn overhead (50–300 ms) prohibits use for per-inference invocations; IPC serialization required for returning inference results (only viable for probe/check patterns or low-frequency inference, not hot-path inference); no shared state between parent and child; on resource-constrained systems, spawning a 370–460 MB child process simultaneously with the parent may cause memory pressure.

---

### 4.4 Worker Thread Isolation

#### 4.4.1 Theory and Mechanism

Node.js worker threads (`node:worker_threads`) create separate V8 isolates within the same OS process. Each worker gets its own JavaScript heap, event loop, and module graph. However, they share the same process virtual address space and, critically, the same native heap (glibc arenas). When native code (onnxruntime-node) allocates memory through `malloc()` inside a worker thread, those allocations live in the process's shared native heap, not in the worker's V8 isolate.

When the worker is terminated, the V8 isolate is destroyed (freeing JavaScript-heap objects) and N-API finalizers run (freeing external-memory handles registered with `napi_create_external_arraybuffer`). However, BFCArena allocations that are internal to ONNX Runtime — the weight tensors, prepacked buffers, kernel state — are not backed by `napi_create_external_arraybuffer`. They are plain `malloc()` allocations that the C++ destructor chain frees to glibc's free list. These freed blocks remain in the process's glibc arenas and do not reduce RSS.

#### 4.4.2 Literature Evidence

GitHub issue nodejs/node#51868 documented cases where creating and terminating many worker threads in rapid succession did not fully release their memory, with RSS growing continuously. GitHub issue nodejs/node#32265 ("worker_threads consuming so much memory") confirmed that native allocations from native addons loaded within workers are not reclaimed on worker termination when the addon uses non-finalizer memory paths.

#### 4.4.3 Strengths and Limitations

**Strengths**: Lower spawn overhead than subprocesses (~10–50 ms vs. 50–300 ms); `SharedArrayBuffer` allows zero-copy tensor transfer between workers and the parent; workers can be pooled and reused across multiple inference calls.

**Limitations**: Native ONNX Runtime allocations (BFCArena) are not reclaimed on worker termination — the worker's C++ destructor does call `free()`, but glibc retains pages in its arenas; if multiple workers each load the model, each brings a full ~370–460 MB BFCArena into the shared process space; RSS accumulation is not bounded over time; the isolation guarantee is weaker than subprocess isolation.

---

### 4.5 WASM Backend

#### 4.5.1 Theory and Mechanism

`onnxruntime-web` compiles the ONNX Runtime CPU engine to WebAssembly via Emscripten. Instead of using the native allocator hierarchy (BFCArena → CPUAllocator → glibc), the WASM backend allocates from Emscripten's linear memory: a single contiguous `WebAssembly.Memory` object (a `SharedArrayBuffer` or a resizable `ArrayBuffer`).

```
WASM memory model:

  ┌──────────────────────────────────────────────┐
  │ WebAssembly.Memory (Emscripten heap)          │
  │  ├── WASM global static data                 │
  │  ├── WASM stack                              │
  │  └── Emscripten malloc heap                  │
  │       ├── BFCArena (compiled to WASM)        │
  │       └── all ONNX Runtime state             │
  └──────────────────────────────────────────────┘
       grows via WebAssembly.Memory.grow()
```

When the ONNX Runtime session within WASM is released and the WASM module is dropped, the underlying `WebAssembly.Memory`'s `ArrayBuffer` can be garbage collected by V8. V8's GC is aware of the size of this ArrayBuffer (unlike external native memory), so it can apply appropriate memory pressure scheduling.

#### 4.5.2 Literature Evidence

The ONNX Runtime Web blog post (Microsoft Open Source, September 2021) describes the WASM backend as compiling "the native ONNX Runtime CPU engine" through Emscripten, "achieving ~2× better performance than ONNX.js." GitHub Issue #860 in huggingface/transformers.js documented a WebGPU-backend memory leak where tensors were not disposed after inference, demonstrating that the WASM/WebGPU memory model still requires explicit disposal but that V8 can eventually GC the WASM heap when given sufficient pressure and all references are dropped.

#### 4.5.3 Strengths and Limitations

**Strengths**: Memory fully bounded within a V8-managed `ArrayBuffer`; GC-aware (V8 knows the external size); consistent behavior across platforms (no glibc dependency); cross-origin isolation provides a security benefit.

**Limitations**: WASM execution is slower than native (typically 1.5–3× on CPU for this workload class); limited to CPU execution (no CUDA from WASM in Node.js); WASM linear memory only grows within a module instance — it never shrinks — though the module can be dropped; RSS still inflates during model loading (the WASM heap grows to accommodate the model); RSS only truly shrinks when the `WebAssembly.Memory` backing store is GC'd, which requires dropping all references and a GC cycle; `SharedArrayBuffer` for multithreaded WASM requires specific Node.js flags or HTTP headers.

---

### 4.6 Model Quantization Impact

#### 4.6.1 Theory and Mechanism

Quantization reduces the byte count of weight tensors. For nomic-embed-text-v1.5:

| Precision | Model file | Est. RSS (observed/projected) | Notes |
|-----------|-----------|-------------------------------|-------|
| fp32 | ~90 MB | ~800–1000 MB | All MLAS ops in fp32 |
| fp16 | ~46 MB | ~500–600 MB | Mixed-precision ops |
| q8 (INT8) | ~23 MB | ~370–460 MB | VNNI acceleration available |
| q4 (INT4) | ~12 MB | ~330–420 MB | Dequantize on-the-fly |

The q8 model is already applied in compound-agent. The 23 MB file size reflects INT8 weight storage, but the observed RSS inflation (370–460 MB) shows that weight size is not the primary driver: the arena pre-allocation, thread stacks, and activation buffers contribute the majority. Going from q8 to q4 would reduce the weight component by approximately half (~23 MB → ~12 MB), but the arena and thread-stack components would remain largely unchanged. The marginal RSS benefit from q4 is therefore modest (~20–30 MB reduction) at a meaningful accuracy cost.

The inflation *factor* worsens with smaller models: a 12 MB model showing 430 MB RSS represents a 35× inflation vs. 20× for the 23 MB model, because the fixed-cost components (arena overhead, thread stacks, glibc arenas) are relatively unchanged while the model weight size decreases.

#### 4.6.2 Strengths and Limitations

**Strengths**: Reduces inference compute intensity and model file download size; q8 provides good accuracy/size trade-off for embedding models and is already the optimal choice for this workload.

**Limitations**: Below INT8, embedding quality degrades for semantic search tasks; quantization addresses the weight component only, leaving the dominant overhead sources (arena, threads) unchanged; the inflation factor actually worsens for smaller models.

---

## 5. Comparative Synthesis

### 5.1 ONNX Runtime vs. Comparable Runtimes

Understanding ONNX Runtime's memory behavior is clarified by comparison with alternatives.

#### 5.1.1 TensorFlow.js / libtensorflow (Node.js)

`@tensorflow/tfjs-node` links against `libtensorflow`, Google's C++ TensorFlow runtime. TensorFlow uses its own BFC allocator — the direct ancestor of ONNX Runtime's BFCArena. The memory behavior is architecturally identical: TensorFlow's BFC allocator has the same arena retention characteristics. Tensor disposal via `tf.dispose()` returns tensors to the arena's free-bin list, not to the OS. There is no equivalent of `malloc_trim` in TensorFlow's public API.

A key difference: TensorFlow.js's public API emphasizes explicit tensor lifecycle management (`tf.dispose()`, `tf.tidy()`), and the documentation warns that undisposed tensors will exhaust memory. ONNX Runtime's Node.js API does not have a `tidy()` equivalent — the developer must call `session.release()` explicitly.

Both runtimes share the same fundamental limitation: V8 does not know about the native memory footprint, so GC pressure is not applied to free arenas.

#### 5.1.2 PyTorch / libtorch (C++)

PyTorch's CPU memory management uses glibc's allocator directly without an application-level arena (unlike GPU, which uses the CUDA Caching Allocator). For CPU tensors the chain is:

```
Tensor ref count drops to 0
  → storage_impl_->data_ptr_ unique_ptr destructor
  → ATen's DefaultCPUAllocator::free()
  → ::free()
  → glibc free-list (not immediately returned to OS)
```

PyTorch's CPU allocator is simpler than ONNX Runtime's BFCArena: it does not maintain an application-level pool, so there is no arena that is "retained even after all tensors freed." However, glibc still retains pages in its own arenas. From pytorch/pytorch#17095 and forum discussions, users confirm that deleting a loaded model does not immediately drop RSS — glibc retains the freed pages — but RSS *does* eventually drop under memory pressure or after `malloc_trim(0)`.

PyTorch's GPU caching allocator (`THCCachingAllocator`) is equivalent to ONNX Runtime's BFCArena for CUDA: it caches blocks internally and `torch.cuda.empty_cache()` returns them to CUDA's virtual memory manager (but not necessarily to the driver). There is no CPU equivalent of `empty_cache()` in PyTorch.

#### 5.1.3 llama.cpp (mmap approach)

llama.cpp defaults to memory-mapping model weight files using `mmap()`. This creates a fundamental architectural difference:

```
llama.cpp mmap model loading:

  open(model_file) → fd
  mmap(NULL, file_size, PROT_READ, MAP_SHARED, fd, 0) → ptr
  Model weights addressed directly through ptr (zero-copy)

  Activation buffers (ggml_context): malloc'd separately

  On model unload:
  munmap(ptr, file_size) → OS reclaims pages immediately
  free(activation_ctx)   → glibc free-list
```

With mmap, the weight pages are backed by the model file in the filesystem. The OS page cache serves as the allocator: pages are loaded on demand (page faults) and can be evicted under memory pressure without the application taking any action. `munmap()` immediately removes the VMA (virtual memory area) entry; RSS drops by the number of weight pages that were resident.

This means llama.cpp's unload is far more reliable for RSS reclamation than ONNX Runtime's `InferenceSession.release()`. However, as the Hacker News discussion of "Why MMAP in llama.cpp hides true memory usage" notes: the *actual* RAM used during inference is similar — all weight pages must be touched (and thus resident) during a forward pass — but mmap avoids the double-allocation problem (no buffer copy into a malloc'd region) and enables near-instantaneous process-exit reclamation via `munmap()`.

ONNX Runtime does not use mmap for its weight initializers by default on CPU inference. GitHub Issue #21448 proposes serializing prepacked weight data in mmap-friendly format to avoid heap allocation, but this was unimplemented as of early 2026.

#### 5.1.4 Candle (Rust, Hugging Face)

Candle is Hugging Face's Rust-native ML framework. It uses Rust's ownership model for tensor lifetime and the system allocator. Candle does not use an application-level arena for CPU inference. When a `Tensor` is dropped in Rust, its `Drop` implementation frees the backing `Vec<u8>`, which calls the Rust allocator's `dealloc()`. Because Rust's ownership model makes it impossible to have dangling references without `unsafe`, tensor lifetimes are statically enforced and memory frees are deterministic.

For ONNX model execution, `candle-onnx` parses the ONNX protobuf and executes through Candle's own computation graph. The memory behavior follows Candle's allocator (no BFCArena). As a result, the disk-to-RSS inflation factor for Candle is typically much lower than for ONNX Runtime — primarily the protobuf parse overhead and activation buffers, without the arena pre-allocation penalty.

### 5.2 The N-API Memory Boundary

The N-API (Node.js API) provides a stable ABI for native addons. onnxruntime-node uses N-API to expose `InferenceSession` to JavaScript. The memory behavior at this boundary has three important characteristics.

**External ArrayBuffer semantics**: Tensor output data from ONNX Runtime may be wrapped in an `napi_create_external_arraybuffer` call. The underlying memory is owned by ONNX Runtime and the JavaScript `ArrayBuffer` holds a view into it. V8 registers byte counts for GC heuristics — but the GC cannot collect the memory itself; it can only adjust the frequency of GC cycles. When the `ArrayBuffer` is GC'd, the finalizer registered with `napi_create_external_arraybuffer` is called, which frees the underlying C++ buffer. This is a best-effort mechanism: if the JS `ArrayBuffer` is retained in a long-lived variable, the C++ memory is not freed.

**V8 external memory pressure**: V8's GC heuristics for when to trigger a collection are based primarily on the JS heap size. External memory registered via `napi_adjust_external_memory()` influences GC scheduling, but V8's heuristics were designed for moderate external allocations (megabytes), not for the hundreds of megabytes that ONNX Runtime allocates internally. The GC will not aggressively collect in response to a 400 MB external allocation growing by another 400 MB.

**Unregistered native memory**: The bulk of ONNX Runtime's internal allocations — BFCArena regions, kernel state, thread pool memory — are not registered with V8 via `napi_adjust_external_memory()`. V8 is completely unaware of these allocations. This is architecturally correct from N-API's perspective (native modules are not required to register all their memory), but it means V8's GC scheduling is irrelevant to ONNX Runtime's primary memory footprint.

```
V8 heap visibility:

  ┌──────────────────────────────────────────────────────┐
  │ V8 JavaScript Heap (~50–100 MB for Node.js process)  │
  │  ├── InferenceSession JS object (tiny, ~1 KB)        │
  │  └── TypedArray (Float32Array) views of output data  │
  └──────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────┐
  │ Native heap (INVISIBLE TO V8 GC)                     │
  │  ├── BFCArena regions (300–400 MB)                   │
  │  │    ├── Weight tensors (prepacked, ~30–60 MB)      │
  │  │    ├── Activation buffers (~30–60 MB)             │
  │  │    └── Kernel state, graph metadata               │
  │  ├── Thread pool stacks (8 threads × 8 MB = 64 MB)  │
  │  ├── OrtEnv singleton data (~10 MB)                  │
  │  └── glibc arena overhead (~30–50 MB)               │
  └──────────────────────────────────────────────────────┘
```

This asymmetry is the fundamental reason why disposal from JavaScript is insufficient: calling `session.release()` in JavaScript triggers the C++ destructor chain, which frees memory back to glibc's free-list — but glibc does not return pages to the OS, and V8's GC has no knowledge of or leverage over this chain.

### 5.3 Trade-Off Matrix

| Approach | RSS Reclamation | Inference Latency Impact | Implementation Complexity | Platform Portability | Isolation Strength |
|----------|----------------|--------------------------|--------------------------|---------------------|--------------------|
| BFCArena disabled (`enable_cpu_mem_arena=false`) | Partial — glibc still retains | +10–30% latency | Low (1 config flag) | All platforms | None |
| `kSameAsRequested` + arena shrinkage | Partial — reduces peak, improves Shrink() | +5–15% latency | Low (1 config flag) | All platforms | None |
| `malloc_trim(0)` post-dispose | Partial — Linux only, manual FFI | None | Medium (FFI call) | Linux only | None |
| jemalloc / tcmalloc via LD_PRELOAD | Good on Linux, variable macOS | Comparable or slightly better | Medium (env config) | Linux primary | None |
| Process isolation (subprocess) | 100% guaranteed | +50–300 ms spawn | Medium (subprocess management) | All platforms | Full OS-level |
| Worker thread isolation | Poor for native allocations | +10–50 ms spawn | Medium | All platforms | V8 heap only |
| WASM backend (`onnxruntime-web`) | Good (GC-managed ArrayBuffer) | 1.5–3× slower inference | High (different package, flags) | All platforms | V8-managed |
| Model quantization (q4 vs q8) | Modest (~20–30 MB) | Inference faster | Low | All platforms | None |
| Long-lived shared session (never dispose) | N/A — never dispose | Minimal (amortized) | Low | All platforms | None |

---

## 6. Open Problems and Gaps

### 6.1 PrePacking Serialization

GitHub Issue #21448 proposes serializing prepacked weight data to disk in mmap-friendly format, so that subsequent loads can map the file directly without allocating a separate heap buffer. This would eliminate the prepacking copy overhead (potentially the largest single source of steady-state inflation) and allow `munmap()` for clean unload. The feature was proposed in 2023 and remains unimplemented. The technical challenge is that prepacked layouts are architecture-specific (VNNI, AVX-512, NEON, etc.), requiring either per-architecture files or a runtime selection mechanism at load time.

### 6.2 Arena Shrinkage on Session Destruction

The `Shrink()` method is a promising mechanism for returning arena memory to the OS, but it is only effective when entire regions are free. There is no implementation of partial region shrinkage or region compaction. For workloads with heterogeneous allocation sizes, small long-lived allocations (e.g., kernel registration metadata) commonly strand free space in multiple regions, preventing `Shrink()` from reclaiming any of them. A compacting allocator variant would require moving live allocations (invalid for pinned C++ pointers), making this architecturally difficult within the current design.

### 6.3 V8 External Memory Notification for Arena-Backed Allocations

If onnxruntime-node registered BFCArena's total committed bytes with V8 via `napi_adjust_external_memory()`, V8's GC heuristics would apply memory pressure that could trigger JS-side finalizers and `release()` calls more promptly. This is a low-complexity change with no correctness risk. However, it only addresses the promptness of GC-triggered cleanup, not the underlying arena retention problem. It has not been implemented in onnxruntime-node's binding code as of the time of writing.

### 6.4 mmap-Based Weight Loading for CPU Inference

ONNX Runtime has no mmap path for loading model initializers (weight tensors) on CPU inference. All weights are copied from the parsed protobuf buffer into arena-allocated tensors. An mmap path would follow llama.cpp's approach: parse the protobuf metadata in a temporary buffer, but use `mmap(MAP_SHARED)` for the raw weight data, then reference the mmap'd pages directly from tensor descriptors. This would eliminate the protobuf-to-OrtValue copy, allow `munmap()` to immediately unmap weight pages on session destruction, and enable OS page-cache sharing between multiple processes loading the same model file.

The technical barrier is that ONNX Runtime's tensor representation assumes contiguous allocated buffers. Adapting the Tensor class to support mmap'd backing stores would require changes to `OrtValue`, the allocator interface, and potentially the MLAS kernel interface for prepacking.

### 6.5 Process-Exit-Only Reclamation as a Documented Pattern

The subprocess isolation pattern used in compound-agent is currently an undocumented workaround rather than a first-class API pattern. There is no official ONNX Runtime guidance or `@huggingface/transformers` documentation describing this approach for long-lived Node.js services. A gap exists in the ecosystem for a `WorkerBoundSession` or `IsolatedInferenceSession` abstraction that encapsulates the subprocess spawn, inference execution, result serialization, and process exit lifecycle in a single reusable API.

### 6.6 Cross-Platform Allocator Tuning Documentation

The relationship between `MALLOC_ARENA_MAX`, `LD_PRELOAD` allocator selection, `malloc_trim(0)`, and ONNX Runtime's `OrtArenaCfg` is undocumented in ONNX Runtime's official documentation. Practitioners must piece together the interaction from scattered GitHub issues. A systematic memory tuning guide covering the full allocator stack (BFCArena → CPUAllocator → system allocator → OS VM subsystem) would significantly reduce the discovery cost for developers encountering these issues.

### 6.7 Quantifying Thread Pool Memory Contribution

No existing benchmark separates the thread pool stack contribution from the arena contribution in ONNX Runtime's RSS profile. A controlled experiment varying `intra_op_num_threads` from 1 to 32 while measuring RSS would quantify how much of the 370–460 MB is attributable to thread stacks versus model state. This would clarify whether `intra_op_num_threads=1` is a useful mitigation for single-inference use cases.

---

## 7. Conclusion

The 16–20× inflation of a 23 MB model to 370–460 MB RSS when loaded via `@huggingface/transformers` in Node.js, and the persistence of that RSS after `pipeline.dispose()`, is the aggregate product of five distinct mechanisms:

1. **Protobuf format overhead**: Temporary doubling during the in-memory conversion from protobuf wire format to OrtValue tensors, plus graph-optimization intermediate copies that transiently further increase peak memory.

2. **PrePacking**: ONNX Runtime reformats weight tensors into MLAS-optimized tile layouts at session initialization time, requiring both the original and prepacked representations to coexist until the original is freed, adding ~30–60 MB transiently and ~30 MB permanently.

3. **BFCArena kNextPowerOfTwo pre-allocation**: The default arena extension strategy rounds all region extensions up to the next power of two, causing massive over-commitment. The initial region is permanently exempt from shrinkage via `consider_first_allocation_region_for_shrinkage_ = false`. Interior region fragmentation prevents `Shrink()` from reclaiming non-initial regions even after session destruction.

4. **Thread pool memory**: Default per-session thread pools create one OS thread per physical CPU core, each consuming an 8 MB stack. On an 8-core machine this contributes 64 MB that persists for the thread lifetime, and indefinitely if OrtEnv holds global thread pools.

5. **System allocator arena retention**: Even allocations that BFCArena does return to `CPUAllocator::Free()` are placed in glibc's internal arena free-lists on Linux, where they remain as unreturned-to-OS pages until `malloc_trim()` is called or the process exits.

The N-API boundary amplifies the problem by ensuring V8's GC is entirely unaware of the dominant ~300–400 MB native allocation footprint, rendering GC-driven cleanup ineffective as a mitigation strategy.

Among the approaches surveyed, only process isolation guarantees complete RSS reclamation. Arena configuration tuning and allocator substitution reduce peak RSS and improve the probability of OS-level reclamation, but cannot guarantee it. Worker thread isolation provides V8-level isolation without native-heap isolation. The WASM backend trades hardware acceleration for GC-managed memory bounds. The mmap approach (used by llama.cpp) represents the most structurally sound long-term architecture for this class of problem, but it is not currently supported by ONNX Runtime's CPU inference path.

---

## References

1. Microsoft ONNX Runtime. "Memory Consumption." Official documentation. https://onnxruntime.ai/docs/performance/tune-performance/memory.html

2. Microsoft ONNX Runtime. "Graph Optimizations in ONNX Runtime." Official documentation. https://onnxruntime.ai/docs/performance/model-optimizations/graph-optimizations.html

3. Microsoft ONNX Runtime. "Thread Management." Official documentation. https://onnxruntime.ai/docs/performance/tune-performance/threading.html

4. Microsoft ONNX Runtime. "High-Level Design." Architecture reference. https://onnxruntime.ai/docs/reference/high-level-design.html

5. Microsoft ONNX Runtime. `bfc_arena.h` source file. GitHub. https://github.com/microsoft/onnxruntime/blob/main/onnxruntime/core/framework/bfc_arena.h

6. Microsoft ONNX Runtime. `bfc_arena.cc` source file. GitHub. https://github.com/microsoft/onnxruntime/blob/main/onnxruntime/core/framework/bfc_arena.cc

7. Microsoft ONNX Runtime. `allocator.h` source file. GitHub. https://github.com/microsoft/onnxruntime/blob/main/include/onnxruntime/core/framework/allocator.h

8. Microsoft ONNX Runtime. GitHub Issue #25325: "[Bug] [Node.js binding] Memory leak after releasing inference session." https://github.com/microsoft/onnxruntime/issues/25325

9. Microsoft ONNX Runtime. GitHub Issue #26831: "[Bug][Performance] Memory leak when destroying InferenceSession — memory not released by ReleaseSession or ReleaseEnv." https://github.com/microsoft/onnxruntime/issues/26831

10. Microsoft ONNX Runtime. GitHub Issue #5176: "Possible Memory leak over released sessions." https://github.com/microsoft/onnxruntime/issues/5176

11. Microsoft ONNX Runtime. GitHub Issue #4093: "Memory leak and thread pools not closing." https://github.com/microsoft/onnxruntime/issues/4093

12. Microsoft ONNX Runtime. GitHub Issue #11627: "Why does `enable_cpu_mem_arena` have such a large effect on memory usage during inference?" https://github.com/microsoft/onnxruntime/issues/11627

13. Microsoft ONNX Runtime. GitHub Issue #14029: "[Performance] onnx vs pt memory usage." https://github.com/microsoft/onnxruntime/issues/14029

14. Microsoft ONNX Runtime. GitHub Issue #3802: "ONNX runtime takes much time and memory to load model." https://github.com/microsoft/onnxruntime/issues/3802

15. Microsoft ONNX Runtime. GitHub Issue #21448: "[Feature Request] Memory Commit Savings." https://github.com/microsoft/onnxruntime/issues/21448

16. Microsoft ONNX Runtime. GitHub Issue #14526: "[Performance] Find out why the GPU memory allocated with CUDAExecutionProvider is much larger than the ONNX size." https://github.com/microsoft/onnxruntime/issues/14526

17. Microsoft ONNX Runtime. GitHub Discussion #18013: "Clear CPU memory after inference." https://github.com/microsoft/onnxruntime/discussions/18013

18. Hugging Face. Transformers.js backends/onnx API documentation. https://huggingface.co/docs/transformers.js/en/api/backends/onnx

19. Hugging Face. Transformers.js GitHub Issue #715: "How to unload/destroy a pipeline?" https://github.com/huggingface/transformers.js/issues/715

20. Hugging Face. Transformers.js GitHub Issue #860: "[Severe] Memory leak issue under WebGPU Whisper transcribe pipeline." https://github.com/huggingface/transformers.js/issues/860

21. Hugging Face. Transformers.js DeepWiki: Backend Architecture. https://deepwiki.com/huggingface/transformers.js/8.2-backend-architecture

22. Microsoft ONNX Runtime. DeepWiki: Inference Session lifecycle. https://deepwiki.com/microsoft/onnxruntime/3.2-inference-session

23. Microsoft ONNX Runtime. OrtApi struct reference (CreateArenaCfgV2). https://onnxruntime.ai/docs/api/c/struct_ort_api.html

24. Microsoft ONNX Runtime. OrtArenaCfg C# class documentation. https://onnxruntime.ai/docs/api/csharp/api/Microsoft.ML.OnnxRuntime.OrtArenaCfg.html

25. Algolia Engineering. "When Allocators are Hoarding Your Precious Memory." Blog post. https://www.algolia.com/blog/engineering/when-allocators-are-hoarding-your-precious-memory

26. CodeArcana. "Arena Leak in glibc." Blog post, 2016. https://codearcana.com/posts/2016/07/11/arena-leak-in-glibc.html

27. Cloudflare. "The Effect of Switching to TCMalloc on RocksDB Memory Use." Blog post. https://blog.cloudflare.com/the-effect-of-switching-to-tcmalloc-on-rocksdb-memory-use/

28. Brice Dutheil. "Handling native memory fragmentation of glibc." Blog post, 2021. https://blog.arkey.fr/drafts/2021/01/22/native-memory-fragmentation-with-glibc/

29. Heroku Dev Center. "Tuning glibc Memory Behavior." https://devcenter.heroku.com/articles/tuning-glibc-memory-behavior

30. Node.js. GitHub Issue #51868: "Creating a lot of worker threads at once doesn't fully release their memory." https://github.com/nodejs/node/issues/51868

31. Node.js. GitHub Issue #32265: "worker_threads consuming so much memory." https://github.com/nodejs/node/issues/32265

32. Node.js. GitHub Issue #2977: "V8 external array data changes." https://github.com/nodejs/node/issues/2977

33. Electron documentation. "Electron and the V8 Memory Cage." https://www.electronjs.org/blog/v8-memory-cage

34. Justine Tunney. "Edge AI Just Got Faster" (llama.cpp mmap blog post). https://justine.lol/mmap/

35. Hacker News discussion: "Why MMAP in llama.cpp hides true memory usage." https://news.ycombinator.com/item?id=35426679

36. neuralchain (Medium). "llamma-cpp default uses a memory-mapped file." https://neuralchain.medium.com/llamma-cpp-default-uses-a-memory-mapped-file-so-the-the-bottle-neck-will-be-the-io-of-the-disk-73e840d1b420

37. PyTorch Forums. "Memory management in libtorch." https://discuss.pytorch.org/t/memory-management-in-libtorch/199278

38. PyTorch Forums. "How to free CPU memory after inference in libtorch?" https://discuss.pytorch.org/t/how-to-free-cpu-memory-after-inference-in-libtorch/163803

39. PyTorch. GitHub Issue #17095: "libtorch elevated memory usage." https://github.com/pytorch/pytorch/issues/17095

40. TensorFlow.js. GitHub Issue #1662: "tensorflow/tfjs-node memory usage." https://github.com/tensorflow/tfjs/issues/1662

41. TensorFlow.js documentation. "Platform and environment." https://www.tensorflow.org/js/guide/platform_environment

42. Microsoft ONNX Runtime. InferenceSession TypeScript interface source. https://github.com/microsoft/onnxruntime/blob/main/js/common/lib/inference-session.ts

43. Microsoft ONNX Runtime. GitHub Issue #13391: "[Web] InferenceSession.dispose method is not exposed." https://github.com/microsoft/onnxruntime/issues/13391

44. Microsoft Open Source Blog. "ONNX Runtime Web — running your machine learning model in browser." September 2021. https://opensource.microsoft.com/blog/2021/09/02/onnx-runtime-web-running-your-machine-learning-model-in-browser/

45. Microsoft Open Source Blog. "Journey to optimize large scale transformer model inference with ONNX Runtime." June 2021. https://opensource.microsoft.com/blog/2021/06/30/journey-to-optimize-large-scale-transformer-model-inference-with-onnx-runtime/

46. Emscripten documentation. Memory model and `ALLOW_MEMORY_GROWTH`. https://emscripten.org/docs/tools_reference/settings_reference.html

47. Hugging Face. candle framework. GitHub. https://github.com/huggingface/candle

48. dev.to / Mayu. "Building Sentence Transformers in Rust: A Practical Guide with Burn, ONNX Runtime, and Candle." https://dev.to/mayu2008/building-sentence-transformers-in-rust-a-practical-guide-with-burn-onnx-runtime-and-candle-281k

49. Martyna Subonis (Substack). "9x Model Serving Performance Without Changing Hardware." https://martynassubonis.substack.com/p/optimize-for-speed-and-savings-high

50. ort (Rust ONNX Runtime bindings). Introduction. https://ort.pyke.io/

---

## Practitioner Resources

### Diagnosing Memory in Node.js + ONNX Runtime

```typescript
// Measure RSS before and after session creation
const before = process.memoryUsage().rss;
const session = await ort.InferenceSession.create(modelPath);
const after = process.memoryUsage().rss;
console.log(`Session RSS delta: ${((after - before) / 1024 / 1024).toFixed(1)} MB`);

// After dispose():
await session.release();
const afterRelease = process.memoryUsage().rss;
console.log(`After release delta: ${((afterRelease - after) / 1024 / 1024).toFixed(1)} MB`);
// Expected: near-zero on macOS (libmalloc reclaims); likely ~300-400 MB retained on Linux (glibc arena)
```

### Tuning Arena for Lower RSS

```typescript
// onnxruntime-node session options to reduce arena pre-allocation
const session = await ort.InferenceSession.create(modelPath, {
  enableCpuMemArena: false,    // disables BFCArena entirely
  enableMemPattern: false,     // disables memory pattern optimization
  executionMode: 'sequential', // disables inter-op parallelism
  intraOpNumThreads: 4,        // limit thread pool size
});
```

### Arena Strategy Tuning (Python API — for testing before applying in Node.js)

```python
import onnxruntime as ort

opts = ort.SessionOptions()
opts.add_session_config_entry("memory.enable_memory_arena_shrinkage", "cpu:0")
providers = [
    ("CPUExecutionProvider", {
        "arena_extend_strategy": "kSameAsRequested",
        "initial_chunk_size_bytes": "67108864",  # 64 MB initial chunk
    })
]
session = ort.InferenceSession(model_path, sess_options=opts, providers=providers)
```

### Subprocess Isolation Pattern (the compound-agent approach)

```typescript
import { execFile } from 'node:child_process';

function probeModelUsable(modelUri: string): Promise<boolean> {
  // All ~370-460 MB RSS in child process is reclaimed by OS on exit.
  // Parent process never sees the inflation.
  const script = `
    import('@huggingface/transformers')
      .then(m => m.pipeline('feature-extraction', '${modelUri}', { dtype: 'q8' }))
      .then(p => { if (p.dispose) p.dispose(); process.exit(0); })
      .catch(() => process.exit(1));
  `;
  return new Promise((resolve) => {
    execFile(process.execPath, ['-e', script], { timeout: 10_000 }, (err) => {
      resolve(!err);
    });
  });
}
```

### Linux Allocator Tuning

```bash
# Limit glibc arena proliferation (set in systemd unit or Docker entrypoint)
export MALLOC_ARENA_MAX=4

# Use jemalloc for better page return behavior
export LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
export MALLOC_CONF="background_thread:true,dirty_decay_ms:5000"

# OR: Use mimalloc
export LD_PRELOAD=/usr/local/lib/libmimalloc.so

node your-app.js
```

### Key GitHub Issues to Track

| Issue | Title | Relevance |
|-------|-------|-----------|
| [microsoft/onnxruntime#25325](https://github.com/microsoft/onnxruntime/issues/25325) | Node.js binding memory leak | Primary Node.js reference |
| [microsoft/onnxruntime#26831](https://github.com/microsoft/onnxruntime/issues/26831) | ReleaseSession/ReleaseEnv memory not freed | C API reference, Linux vs macOS behavior |
| [microsoft/onnxruntime#11627](https://github.com/microsoft/onnxruntime/issues/11627) | enable_cpu_mem_arena effect on memory | Arena configuration |
| [microsoft/onnxruntime#21448](https://github.com/microsoft/onnxruntime/issues/21448) | Memory commit savings / prepacking | Long-term fix proposal |
| [microsoft/onnxruntime#3802](https://github.com/microsoft/onnxruntime/issues/3802) | Model loading memory inflation | Root cause analysis |
| [microsoft/onnxruntime#4093](https://github.com/microsoft/onnxruntime/issues/4093) | Thread pools not closing | Thread pool lifetime |
| [huggingface/transformers.js#715](https://github.com/huggingface/transformers.js/issues/715) | How to unload/destroy a pipeline | Transformers.js dispose semantics |
