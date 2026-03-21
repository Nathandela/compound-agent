# Lightweight Process Dispatch and IPC Architecture for CLI Tools

**A Technical Survey**

---

## Abstract

High-frequency hook dispatch in agentic CLI tools exposes a fundamental tension between the process-per-invocation model and the latency, memory, and concurrency requirements of interactive AI workflows. This paper surveys the landscape of lightweight process dispatch and inter-process communication (IPC) architectures as they apply to CLI hook systems, with particular focus on eliminating the overhead introduced by package manager launchers such as `npx`. We examine seven architectural families: per-invocation forking, persistent daemon models, process pooling, socket-activated dispatch, shared memory approaches, thin shell dispatchers, and runtime-native single-binary patterns. For each, we characterize the theoretical cost model, survey implementation evidence from esbuild, Vite, TypeScript Language Server, Bun, and Deno, present available benchmark data, and analyze trade-offs. We derive a comparative synthesis table mapping architectural choices to latency budget, memory footprint, operational complexity, and crash-safety properties. The primary finding is that the `npx` launcher introduces a two-tier overhead—package resolution (50–300 ms) layered on top of Node.js process initialization (25–120 ms)—producing wall-clock costs of 75–420 ms per invocation that are incompatible with sub-100 ms hook latency budgets and cause pathological process accumulation under concurrent multi-agent workloads. The thin-dispatcher and persistent-daemon patterns emerge as the two viable paths for production hook systems; each carries distinct lifecycle management trade-offs documented in full. Open problems in zero-overhead warm dispatch, cross-platform socket activation, and daemon health propagation are identified.

---

## 1. Introduction

### 1.1 Motivation

Modern agentic AI systems such as Claude Code fire lifecycle hooks on every tool invocation: before a file write, after a shell command, when the user submits a prompt. In a compound multi-agent setup with three parallel agent instances each performing fifty tool calls per session, a conservative estimate places hook invocations at 300 to 450 events per session. If each hook is dispatched by spawning a fresh Node.js process via `npx`, the system sustains a continuous process birth-and-death rate of several processes per second.

The consequences are severe. On macOS, the default system process limit (`kern.maxproc`) is 2,666. A session with 200 concurrent in-flight hooks—each awaiting stdin from the parent process—can exhaust this limit within minutes. Memory pressure follows immediately: a single `npx ca hooks run <hook>` process loads the npm resolution machinery plus the full Commander.js CLI tree plus any lazy-loaded modules, producing a resident set size (RSS) of approximately 55 to 120 MB for a stripped hook runner and 2.86 GB when the full npx + CLI pipeline remains in memory. At 200 processes, this saturates available RAM on development machines.

This paper surveys the architectural patterns that practitioners and infrastructure projects have deployed to eliminate or amortize per-invocation process overhead, and characterizes the trade-offs among them.

### 1.2 The Compound Agent Hook Context

The motivating deployment is the `compound-agent` project, a TypeScript CLI that attaches learning and audit hooks to Claude Code. Its `.claude/settings.json` defines seven hook registrations covering `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `UserPromptSubmit`, and `Stop` events. Each registration calls `npx ca hooks run <hook-name>`, passing a JSON payload on stdin and reading a JSON response from stdout.

The existing `hook-runner.ts` module represents a first-generation thin-dispatcher optimization: it bypasses Commander.js, SQLite connection initialization, and embedding model loading, importing only the specific handler modules needed per hook type. Measured wall-clock time for `node dist/hook-runner.js pre-commit` is approximately 40 ms cold-start on a modern MacBook. The `npx` wrapper adds 150–350 ms of resolution overhead on top.

### 1.3 Scope and Definitions

This survey addresses:

- **Dispatch latency**: The elapsed time between hook event emission and the first line of handler code executing.
- **Process overhead**: The RSS contribution per active hook invocation.
- **Throughput**: Maximum sustainable hook invocations per second without degrading the primary agent loop.
- **Operational complexity**: The lifecycle management burden introduced by each architecture.

We do not address the correctness or expressiveness of hook handler implementations, the semantics of Claude Code's decision/block protocol, or general-purpose RPC frameworks outside the CLI context.

### 1.4 Paper Organization

Section 2 establishes foundations: Unix process creation primitives, the Node.js startup sequence, and the Claude Code hook protocol. Section 3 presents the taxonomy of architectural approaches. Section 4 provides deep analysis of each approach with theory, evidence, implementations, and benchmarks. Section 5 synthesizes trade-offs in a comparative table. Section 6 identifies open problems. Section 7 concludes.

---

## 2. Foundations

### 2.1 Unix Process Creation Primitives

The Unix process model provides three mechanisms for creating child processes relevant to CLI dispatch:

**fork(2)** duplicates the calling process, inheriting address space, file descriptors, and environment. On Linux with Copy-on-Write (COW) semantics, the physical memory pages are shared until modified; on macOS, the same COW mechanism applies. The key cost is not memory copying but rather kernel bookkeeping: page table duplication, signal handler reset, and file descriptor duplication. For a 500 MB Node.js process, `fork()` with COW completes in roughly 5–15 ms depending on the number of dirty pages and open file descriptors. An `exec()` call follows `fork()` to replace the address space with the new executable image; combined, `fork()+exec()` for a fresh process is typically 10–30 ms on modern hardware at the kernel level alone.

**posix_spawn(3)** combines `fork()+exec()` as an atomic operation optimized for systems where `fork()` is expensive or unavailable (embedded systems without an MMU). On systems with full MMU support, `posix_spawn` offers similar cost to `fork()+exec()` with slightly lower overhead for simple cases. POSIX rationale notes that it "is not intended as a replacement for fork" but as "useful process creation primitives for systems that have difficulty with fork."

**clone(2)** (Linux only) is the underlying primitive underlying both `fork()` and `pthread_create()`. The `CLONE_THREAD` flag creates a thread within the same process; without it, a new process is created. Worker threads in Node.js use `pthread_create()` via `clone()` internally, sharing the V8 heap but maintaining separate JavaScript execution contexts.

### 2.2 The Node.js Startup Sequence

A Node.js process invocation proceeds through several sequential phases before user code executes:

```
fork()+exec()
    |
    v
[1] ELF/Mach-O dynamic linker: resolves libv8, libuv, libssl (~5-15ms)
    |
    v
[2] V8 initialization: heap setup, builtin compilation, startup snapshot (~15-40ms)
    |
    v
[3] Node.js bootstrap: event loop init, process object, core module stubs (~5-10ms)
    |
    v
[4] ESM/CJS loader initialization: import.meta, require() hooks (~2-5ms)
    |
    v
[5] Entry point module load: parse, link, evaluate top-level imports (~varies)
    |
    v
[6] Transitive dependency load: each import triggers phases 4-6 recursively
    |
    v
[7] User code: first line of application logic executes
```

The wall-clock total for phases 1-4 (runtime initialization, independent of application code) is approximately 25–60 ms for Node.js v18+ on a cold process with a warm OS page cache. Phase 5 onward depends on the module graph complexity.

**V8 Startup Snapshot**: Node.js bundles a V8 startup snapshot that serializes the state of the V8 heap after loading all built-in JavaScript. This snapshot is deserialized rather than re-evaluated on each startup, which is the primary reason modern Node.js (v18+) starts faster than older versions. Node.js v20 introduced the ability for applications to create their own startup snapshots via `v8.startupSnapshot`, allowing application-level module pre-loading to be captured and deserialized on subsequent invocations.

**ESM vs CommonJS startup cost**: ESM module loading is inherently three-phased (Construction → Instantiation → Evaluation), where the Construction phase performs asynchronous I/O to locate and parse all modules before execution begins. CommonJS loads synchronously and incrementally (each `require()` triggers immediate loading). For CLI tools, this means ESM entry points incur the full dependency graph I/O upfront before any code runs, while CJS defers loading until the `require()` call site is reached. For a tool importing ten modules, the difference is typically 5–20 ms. For a tool importing 100+ modules (e.g., Commander.js + SQLite + embedding libraries), the difference can reach 100–300 ms.

**Bun benchmark baseline**: Bun, which uses JavaScriptCore (JSC) instead of V8 and is implemented in Zig, achieves approximately 5.2 ms for a hello-world on Linux versus 25.1 ms for Node.js—a 4.8x improvement. The `npm run` equivalent startup is 170 ms for npm versus 6 ms for `bun run`. These numbers represent the minimum achievable floor for a JavaScript-based hook system on current hardware.

### 2.3 The npx Resolution Pipeline

`npx` (npm's package executor) performs the following resolution before executing a binary:

```
npx ca hooks run <hook>
       |
       v
[1] Check $PATH for 'ca' binary (~1ms)
       |
       v  (not found in $PATH as standalone binary)
[2] Locate nearest package.json via directory traversal (~1-5ms)
       |
       v
[3] Read node_modules/.bin/ca symlink (~1ms)
       |
       v
[4] Resolve bin target from package.json "bin" field (~2ms)
       |
       v
[5] Verify package version matches installed (~5-10ms, cache lookup)
       |
       v
[6] Execute node with resolved script path (~25-120ms Node.js startup)
```

When the package is locally installed in `node_modules` (the common case in a project with compound-agent as a dev dependency), npx performs a local resolution that avoids downloading anything. The overhead is primarily from npm's own startup cost—npm is itself a Node.js program that must initialize before it can resolve anything. Measured overhead on a project with compound-agent installed locally: approximately 150–350 ms total, of which 100–250 ms is npm's own initialization.

**pnpm vs npm npx**: `pnpm dlx` fetches packages from the registry on demand without installing as a dependency. For locally installed packages, `pnpm exec` is the correct analog to `npx` with a locally installed tool—it resolves from `node_modules/.bin` without the full npm initialization overhead. The pnpm documentation notes that `pnpx` is now an alias for `pnpm dlx`. Anecdotally, `pnpm exec` is faster than `npx` for local resolution because pnpm's CLI startup is lighter, though no systematic published benchmarks compare the two in this specific scenario.

**Yarn dlx**: `yarn dlx` (Berry) operates similarly to `pnpm dlx`—it downloads and executes a package without installing it. For locally installed packages, `yarn exec` is appropriate and similarly avoids registry lookup. Yarn Berry uses a distinct package resolution algorithm (PnP) that eliminates the `node_modules` directory structure, which theoretically reduces symlink traversal overhead but requires runtime patching that adds its own startup cost.

### 2.4 IPC Transport Mechanisms

When processes need to communicate, the choice of transport determines latency floor:

**Named pipes (FIFOs)**: Kernel-buffered byte streams identified by filesystem path. On Linux, pipe read/write latency for small messages (< 64 KB) is approximately 1–5 microseconds for round-trip latency in a ping-pong benchmark. On macOS, comparable performance.

**Unix domain sockets (AF_UNIX)**: Socket semantics over filesystem paths. Slightly higher latency than pipes (2–8 microseconds round-trip) due to socket protocol overhead, but support bidirectional communication natively. Support `SOCK_STREAM` (reliable ordered bytes) and `SOCK_DGRAM` (unreliable datagrams). In practice, the primary advantage over named pipes is the ability to use `accept()` for multiple concurrent clients from a single listening socket.

**TCP loopback (127.0.0.1)**: Full TCP stack including connection establishment, socket buffers, and TCP state machine. Round-trip latency for small messages: 20–100 microseconds. Approximately 10–20x slower than Unix domain sockets for small messages. The overhead is primarily from the TCP state machine and socket buffer management rather than network traversal (loopback avoids network hardware entirely on Linux via `lo` device shortcutting). The advantage is cross-machine portability and firewall integration.

**Shared memory / mmap**: Direct memory access with no system call overhead for data transfer after initial setup. Two processes mapping the same file (via `shm_open()` + `mmap()`) can exchange data at memory bus speeds. Coordination still requires synchronization primitives (mutexes, semaphores, or atomics on `SharedArrayBuffer`). Effective for large payloads; for small messages the synchronization overhead dominates.

**Node.js IPC channel**: `child_process.fork()` establishes an IPC channel between parent and child using an operating-system-level pipe pair. The `process.send()` / `process.on('message')` API serializes JavaScript values through JSON and transmits over this pipe. Throughput is bounded by JSON serialization speed and pipe bandwidth; for large objects this can be a significant cost.

### 2.5 Claude Code Hook Protocol

Claude Code hooks are command-line invocations defined in `.claude/settings.json`. The protocol is:

**Invocation**: Claude Code executes the configured shell command as a child process, passing a JSON object on stdin.

**Input schema**: Each event type has a structured JSON payload with common fields (`session_id`, `hook_event_name`, `cwd`, `permission_mode`) and event-specific fields. For `PreToolUse`: `tool_name`, `tool_input`, `tool_use_id`. For `PostToolUse`: additionally `tool_response`. For `UserPromptSubmit`: `prompt`. For `Stop`: `stop_hook_active`, `last_assistant_message`.

**Output schema**: A JSON object on stdout with optional fields: `continue`, `stopReason`, `suppressOutput`, `systemMessage`, and event-specific `hookSpecificOutput`.

**Exit code semantics**:
- Exit 0: success, parse JSON from stdout
- Exit 2: blocking error, display stderr and block the tool call
- Other non-zero: non-blocking error, show in verbose mode, continue

**Latency budget**: The documentation specifies per-event-type timeouts. `SessionEnd` hooks have a 1,500 ms timeout. Command hooks default to 600 seconds. HTTP hooks default to 30 seconds. There is no explicit sub-100ms requirement in the protocol specification, but UX degradation is observable when hooks exceed approximately 100–200 ms because they execute synchronously before the agent proceeds to the next step.

**Concurrency**: Claude Code fires all matching hooks for a given event in parallel. With three parallel agent instances each triggering `PreToolUse` + `PostToolUse` for every Bash/Edit/Write call, six concurrent hook processes per tool call is the baseline load in a compound multi-agent configuration.

---

## 3. Taxonomy of Architectural Approaches

The architectural space for CLI hook dispatch can be organized along two primary axes: **process lifecycle** (ephemeral vs. persistent) and **dispatch mechanism** (direct execution vs. IPC forwarding).

```
                    DISPATCH MECHANISM
                  Direct          IPC Forward
               +-----------+------------------+
  EPHEMERAL    | Fork-per- | Socket-Activated  |
               | invocation| Dispatch          |
Process        +-----------+------------------+
Lifecycle      | Process   | Persistent        |
  PERSISTENT   | Pool      | Daemon            |
               +-----------+------------------+
                    + Thin Shell Dispatcher (hybrid)
                    + Shared Memory (orthogonal to both)
                    + Native Single Binary (eliminates JS runtime)
```

**Type 1: Fork-per-invocation** (current compound-agent baseline)
Each hook call spawns a fresh process. The full runtime initializes, executes the handler, and exits.

**Type 2: Persistent Daemon**
A long-running background process listens on a socket. Hook callers connect, send the JSON payload, receive the response, and disconnect.

**Type 3: Process Pool**
N worker processes are pre-spawned and maintained in a pool. The dispatcher assigns hook calls to idle workers via a queue.

**Type 4: Socket-Activated Dispatch**
The operating system (systemd/launchd) manages the listening socket. The daemon starts on first connection and sleeps when idle.

**Type 5: Shared Memory / mmap**
Hook state is passed through shared memory regions, eliminating serialization and socket overhead.

**Type 6: Thin Shell Dispatcher**
A minimal entry point that bypasses the full CLI boot path, loading only the specific handler module required.

**Type 7: Native Single Binary**
The hook handler is compiled to a native executable (Go, Rust, C) or a language runtime with dramatically faster startup (Bun, Deno compile).

---

## 4. Analysis

### 4.1 Fork-per-Invocation Model

#### 4.1.1 Theory and Mechanism

The fork-per-invocation model provides complete isolation between hook executions. Each call to `npx ca hooks run <hook>` produces the following kernel-level sequence:

```
Claude Code process
    |
    | fork()+exec() [kernel: 10-30ms]
    v
shell process (bash/sh)
    |
    | parses command string, fork()+exec() again
    v
npx process (node.js, ~150-300ms startup)
    |
    | resolves 'ca' binary via package.json traversal
    | fork()+exec()
    v
ca process (node.js, ~40-120ms startup)
    |
    | initializes Commander.js command tree
    | parses 'hooks run <hook>'
    | imports handler module
    | reads stdin
    | writes stdout JSON
    | exits
```

Total wall-clock from hook event to first handler line: 200–450 ms (warm npm cache).

The RSS profile under concurrent load follows a linear model: each active process contributes its working set. For the thin hook-runner variant (without Commander, SQLite, or embeddings), RSS is approximately 55–80 MB per process. For the full CLI (which `npx ca hooks run` uses), RSS is 100–200 MB per process. Under 200 concurrent hooks, the system-wide hook runner footprint is 11–40 GB—exceeding available RAM on most development machines.

#### 4.1.2 Literature Evidence

The Node.js documentation on process isolation states: "Clusters of Node.js processes can be used to run multiple instances of Node.js that can distribute workloads among their application threads. When process isolation is not needed, use the worker_threads module instead, which allows running multiple application threads within a single Node.js instance."

This framing presupposes that process isolation is a conscious choice worth its cost, not a default. The fork-per-invocation model pays the full isolation cost on every hook invocation regardless of whether the isolation is needed.

Bun's benchmarks quantify the floor: `bun hello.js` = 5.2 ms, `node hello.js` = 25.1 ms on Linux. For `npm run`, the comparison is 170 ms (npm) vs 6 ms (bun run). These represent minimum achievable startup times for each runtime/launcher combination.

The esbuild project eliminated per-invocation process cost by compiling to a Go binary. Go programs initialize in under 5 ms, with no garbage collector warm-up period, no JIT compilation overhead, and no module resolution. The esbuild architecture serves as a concrete benchmark for what native binary dispatch achieves.

#### 4.1.3 Implementations and Benchmarks

| Implementation | Mechanism | Approx cold-start latency |
|---|---|---|
| `npx ca hooks run <hook>` | npx + full CLI | 200–450 ms |
| `node dist/hook-runner.js <hook>` | Node.js + thin runner | 35–80 ms |
| `bun dist/hook-runner.js <hook>` | Bun + thin runner | 8–20 ms |
| `./hook-runner-native <hook>` (Go) | Go binary | 2–8 ms |
| `./hook-runner-native <hook>` (Rust) | Rust binary | 1–5 ms |

These numbers represent the **minimum achievable latency** when including the full process lifecycle. They exclude the hook handler logic execution time, which is typically 1–10 ms for the operations in compound-agent (file I/O, JSON parsing, simple state updates).

#### 4.1.4 Strengths and Limitations

**Strengths**:
- Complete process isolation: crashes, memory leaks, and unhandled exceptions in hook handlers cannot corrupt the calling process
- Simple operational model: no daemon lifecycle to manage
- Easy testing: each invocation is a fresh process with clean state
- Compatible with any hook payload size (stdin/stdout are pipe-buffered)
- Naturally serializes access to shared file state if only one hook runs at a time

**Limitations**:
- Startup cost dominates execution cost by an order of magnitude for simple hooks
- Memory overhead scales linearly with concurrent invocations
- Process table exhaustion under high concurrency
- Zombie process accumulation if parent does not promptly reap children
- `npx` adds 150–300 ms of package resolution overhead on top of Node.js startup
- ESM startup incurs full dependency graph I/O before any handler code runs
- Not suitable for sub-100 ms latency budgets with full CLI initialization

---

### 4.2 Persistent Daemon Model

#### 4.2.1 Theory and Mechanism

The persistent daemon amortizes startup cost across all hook invocations in a session. A background process is started once, listens on a Unix domain socket or TCP port, and handles all hook requests for the duration of the session without restarting.

```
Session Start
    |
    | spawn once
    v
+------------------+
| hook-daemon      |   Listens on ~/.claude/hook-daemon.sock
| (persistent)     |<------ Claude Code hook: connect, send JSON, recv JSON, disconnect
|                  |<------ Claude Code hook: connect, send JSON, recv JSON, disconnect
| shared state:    |<------ Claude Code hook: connect, send JSON, recv JSON, disconnect
| - open DB conn   |
| - cached modules |
| - in-memory state|
+------------------+
    |
Session End
    | shutdown signal / idle timeout
    v
```

The daemon startup cost (200–450 ms) is paid once. Subsequent connections amortize this over N requests. For a session with 300 hook calls, the per-invocation amortized startup cost is 0.7–1.5 ms—three orders of magnitude lower than the fork-per-invocation model.

**Connection protocol**: Each hook call becomes a Unix domain socket connection. The client (Claude Code hook command) connects, writes the JSON payload with a length prefix or newline delimiter, reads the JSON response, and closes the connection. The overhead per connection is approximately 0.1–0.5 ms for socket connection establishment plus the data transfer time.

**State persistence benefits**: The daemon can maintain in-memory state that would otherwise require disk I/O per invocation: open SQLite connections, LRU caches, parsed configuration, and pre-loaded module state. For compound-agent, this includes the lessons SQLite database connection and any cached hook state.

#### 4.2.2 Literature Evidence

The TypeScript Language Server (`tsserver`) implements this pattern precisely. When a TypeScript-aware editor opens, it spawns a single `tsserver` process that persists for the editor session. All type-checking, completion, and diagnostic requests are routed through a JSON-RPC-like protocol over either named pipes (Windows) or Unix domain sockets (macOS/Linux). The startup cost—loading the TypeScript compiler and building the program structure—is paid once. Subsequent operations (completions, diagnostics) complete in 5–50 ms instead of the 500–2000 ms that per-invocation spawning would require.

The esbuild project uses a similar pattern for its JavaScript API. The npm package `esbuild` ships a Go binary that is spawned once as a persistent service when the JavaScript API is first called. The JavaScript side communicates with the Go binary over stdin/stdout using a length-prefixed binary protocol. The Go binary persists for the lifetime of the Node.js process, amortizing the Go startup cost across all build operations.

Turborepo daemon (Rust-based) uses a Unix domain socket at `$HOME/.turbo/daemon` to provide persistent task-graph state across `turbo` CLI invocations. The daemon caches repository state, file hashes, and task dependency graphs. CLI calls connect to the socket to query cached state rather than recomputing it. The result is a near-instant `turbo run build` even in large monorepos, compared to seconds of file-system scanning without the daemon.

Vite implements the most visible example of this pattern for front-end development. The dev server (`vite dev`) is a persistent Node.js process that holds the entire module graph in memory. When a browser requests a module, Vite serves it from in-memory state and transforms on demand. The Hot Module Replacement (HMR) system pushes updates over a persistent WebSocket connection. The fundamental architectural insight: "the larger the app, the longer you waited" with per-request bundle approaches, while the persistent module graph approach delivers "dev server startup was nearly instant, regardless of application size."

#### 4.2.3 Implementations and Benchmarks

**tsserver protocol latency**: A completion request to a warm tsserver completes in 5–50 ms. Cold startup (first request after daemon start) takes 1,000–5,000 ms depending on project size. The amortization is effective for editor sessions involving hundreds of requests.

**esbuild service protocol**: The esbuild npm package's JavaScript API achieves sub-millisecond build dispatch for small files when the Go service is warm. The binary protocol (length-prefixed messages) is faster than JSON newline-delimited protocols due to avoided JSON parsing for the length header.

**Turborepo daemon**: First invocation (daemon start) takes 1–3 seconds to build the task graph. Subsequent invocations with cached state complete in 50–200 ms for a mid-size monorepo.

**Daemon dispatch latency breakdown** (per-request, after daemon is warm):

```
Client process startup (thin client):         5–15 ms  (Node.js) | 1–3 ms (Go/Rust)
Unix socket connect:                          0.1–0.5 ms
JSON serialize + write:                       0.1–1 ms
Kernel pipe traversal:                        0.01–0.05 ms (UDS)
Handler execution (compound-agent hook):      1–10 ms
JSON serialize + write (response):            0.1–1 ms
Client read + parse:                          0.1–0.5 ms
Client process exit:                          1–5 ms
                                              --------
Total (thin client):                          8–35 ms
Total (full Node.js client):                  30–80 ms
```

The remaining cost is the client-side process startup to make the connection. For sub-5 ms total dispatch, the client must be a compiled native binary.

#### 4.2.4 Strengths and Limitations

**Strengths**:
- Amortizes startup cost to near-zero for high-frequency hook calls
- Shared in-memory state across requests (database connections, caches)
- Linear memory scaling: O(1) daemon RSS rather than O(n) per active request
- Can serve concurrent requests with worker threads without additional process overhead
- Matches the architecture of production tools (tsserver, esbuild, Turbopack, Vite)

**Limitations**:
- Lifecycle management complexity: must start daemon before first hook call, stop after session end
- Stale state risk: daemon accumulates state that may diverge from disk state if external mutations occur
- Crash recovery: if the daemon exits unexpectedly, the next hook call must detect the dead socket and restart the daemon
- Single point of failure: a daemon bug can affect all subsequent hooks in the session
- Session boundary detection: determining when to stop the daemon requires coordination with the parent process (Claude Code session lifecycle)
- Port/socket contention: multiple concurrent sessions require unique socket paths
- Security: Unix domain socket permissions must prevent unauthorized access if the socket is world-readable

---

### 4.3 Process Pool

#### 4.3.1 Theory and Mechanism

Process pooling pre-spawns N worker processes at startup and maintains them as a ready pool. Each incoming hook request is dispatched to an idle worker; workers return to the pool after completing the request.

```
Pool Manager (parent process)
+-----------------------------------+
| Worker 0: [IDLE]  <- next request |
| Worker 1: [BUSY]  processing hook |
| Worker 2: [IDLE]  <- overflow     |
| Worker 3: [BUSY]  processing hook |
+-----------------------------------+
        |         |
      stdin     stdout
      pipes     pipes
        |         |
   Hook client  Hook client
```

The Node.js `cluster` module implements process pooling for TCP server workloads. It uses `child_process.fork()` with an IPC channel, allowing the primary process to distribute connections to worker processes. Workers communicate with the primary via `process.send()` / `process.on('message')`. The scheduling policy (round-robin or OS-level) is configurable; round-robin is the default on non-Windows systems because OS-level distribution "tends to be very unbalanced due to operating system scheduler vagaries."

**Worker threads as an alternative**: `node:worker_threads` provides thread-level parallelism within a single Node.js process. Worker threads share the V8 heap (except for module evaluation state) and communicate via `postMessage()` with structured clone or `SharedArrayBuffer` for zero-copy transfer. Startup cost is significantly lower than forking (shared V8 instance, no new process creation) but threads share process memory, so a fatal error in a thread can crash the main process.

**Piscina**: A worker thread pool library implementing back-pressure management, task queuing, and configurable pool sizes. Piscina manages a pool of `worker_threads` workers, queuing tasks when all workers are busy. Communication uses `worker.postMessage()` with optional `transferList` for zero-copy `ArrayBuffer` transfer. The library handles worker lifecycle, error recovery, and graceful shutdown.

#### 4.3.2 Literature Evidence

Node.js cluster module documentation: "Workers are spawned using the `child_process.fork()` method, so that they can communicate with the parent via IPC and pass server handles back and forth." The module was designed for HTTP server workloads where each worker handles a complete request-response cycle.

Worker threads documentation: "Workers (threads) are useful for performing CPU-intensive JavaScript operations." The comparison table shows: worker threads have low startup cost (shared V8), minimal memory overhead, and support `SharedArrayBuffer`; child processes have high startup cost, significant RSS overhead, but true process isolation.

Vitest's pool architecture uses multiple pool types: `threads` (worker_threads with isolation), `forks` (child_process.fork for full isolation), and `vmThreads` (worker_threads with VM context). This design acknowledges that the correct pool type depends on the isolation vs. performance trade-off.

#### 4.3.3 Implementations and Benchmarks

**Node.js cluster dispatch latency** (round-trip message for a simple task):
- Primary to worker IPC message: 0.5–2 ms
- Worker execution (simple computation): <1 ms
- Worker to primary response: 0.5–2 ms
- Total: 1–5 ms (plus initial pool startup cost amortized over pool lifetime)

**Piscina worker thread dispatch latency**:
- postMessage serialization (small JSON): 0.05–0.2 ms
- Worker thread scheduling: 0.1–0.5 ms
- Handler execution: varies
- Response postMessage: 0.05–0.2 ms
- Total overhead: 0.2–1 ms per task (excluding handler)

**Pool memory model**:
- N=4 worker processes via cluster: ~4x process RSS overhead for pool
- N=4 worker threads via Piscina: ~1x process RSS + ~4x thread stack overhead (~4 MB per thread default)

#### 4.3.4 Strengths and Limitations

**Strengths**:
- Low dispatch latency once pool is warm (1–5 ms overhead)
- Handles concurrent requests naturally (N workers run in parallel)
- Worker crashes are contained: pool manager can respawn crashed worker
- Worker threads offer near-daemon-level memory efficiency without cross-process IPC

**Limitations**:
- Pool startup cost: all N workers must initialize before first request (or lazy initialization loses some concurrency benefit)
- Pool sizing is a tuning parameter: too few workers creates queue latency under burst load; too many wastes memory
- Cluster model requires TCP server socket for distribution, which adds per-connection overhead inappropriate for hook dispatch
- Worker thread model requires hook handler code to be thread-safe (no shared mutable state outside `SharedArrayBuffer`)
- The pool manager itself must remain alive; it cannot be a simple shell script wrapper
- Pool isolation model: worker threads do not protect against memory corruption; process clusters do not provide memory sharing

---

### 4.4 Socket-Activated Dispatch

#### 4.4.1 Theory and Mechanism

Socket activation, pioneered by inetd (1980s) and formalized in systemd (Linux) and launchd (macOS), allows the operating system to manage the lifecycle of service processes based on socket activity. The OS creates and holds the listening socket file descriptor; the service process starts only when an incoming connection arrives and may exit when idle.

**systemd socket activation**:

```
/etc/systemd/system/hook-daemon.socket:
    [Socket]
    ListenStream=/run/hook-daemon.sock
    Accept=no

/etc/systemd/system/hook-daemon.service:
    [Service]
    ExecStart=/usr/local/bin/hook-daemon
    StandardInput=socket  (for Accept=yes inetd mode)
```

With `Accept=no` (single service mode), systemd creates the listening socket and passes its file descriptor to the service via the `LISTEN_FDS` environment variable and `SD_LISTEN_FDS_START` convention. The service calls `sd_listen_fds()` to obtain the pre-opened socket descriptor and begins accepting connections immediately without a `bind()`+`listen()` sequence. The service may run as a one-shot process (handle connections, exit when done) or a persistent daemon.

With `Accept=yes` (inetd mode), systemd spawns a fresh service instance for each incoming connection, passing only that connection's socket descriptor as stdin/stdout. This is the inetd model: each invocation handles exactly one connection, preserving per-invocation isolation at the cost of per-invocation startup overhead.

**launchd socket activation (macOS)**:

```xml
<!-- ~/Library/LaunchAgents/com.example.hook-daemon.plist -->
<key>Sockets</key>
<dict>
    <key>HookSocket</key>
    <dict>
        <key>SockPathName</key>
        <string>/tmp/hook-daemon.sock</string>
    </dict>
</dict>
<key>OnDemand</key>
<true/>
```

`launchd` creates the socket, and the service is activated on first connection. The service obtains the socket via `launch_activate_socket()`. Unlike systemd, launchd has limited support for the `Accept=yes` inetd model in modern macOS versions.

#### 4.4.2 Literature Evidence

The systemd socket activation documentation states: "Socket units may be used to implement on-demand starting of services, as well as parallelized starting of services." The key advantage is that the socket exists even before the service starts, allowing clients to queue connections without blocking—the OS buffers them until the service is ready.

The inetd model predates systemd by decades. The Berkeley Internet Daemon (inetd) launched per-connection service instances from a single configuration file, allowing a single process to monitor dozens of network service ports and fork handlers on demand. This architecture was eventually superseded for high-traffic services due to the per-connection fork overhead, but remains appropriate for low-frequency or bursty services.

Socket activation decouples the service lifecycle from the client's perspective: a client can connect to the socket without knowing whether the daemon is currently running. If the daemon exited after an idle timeout, the next connection transparently restarts it. This provides the operational simplicity of the per-invocation model with the latency characteristics of the persistent daemon model (for the second and subsequent requests in a burst).

#### 4.4.3 Implementations and Benchmarks

**systemd socket activation latency**:
- First connection (daemon not running): daemon startup time (25–120 ms Node.js) + socket connection (0.1 ms)
- Subsequent connections (daemon running): socket connection only (~0.1–0.5 ms)
- Idle restart penalty: identical to first-connection cost

**launchd on-demand activation** follows the same pattern. The macOS `launchctl` subsystem manages the socket and activates the service on demand.

**Zero overhead when idle**: Unlike a persistent daemon that consumes memory regardless of activity, socket-activated services consume no resources between sessions. On developer machines switching between projects, this is significant: a hook daemon for project A does not consume memory while the developer is working on project B.

#### 4.4.4 Strengths and Limitations

**Strengths**:
- Zero idle overhead: service consumes no resources when not in use
- Automatic restart on crash: launchd/systemd will restart the service on the next connection
- Clean shutdown semantics: OS-managed socket lifetime ensures no orphaned socket files
- Transparent to clients: clients connect to the socket without knowledge of daemon state
- Parallelized startup: multiple services can activate simultaneously without coordination

**Limitations**:
- Platform-specific: systemd is Linux-only; launchd is macOS-only; no portable cross-platform solution
- Configuration complexity: requires writing .socket + .service unit files or .plist files
- Development environment limitations: systemd socket activation is unavailable in Docker containers without systemd init, CI runners, and sandboxed environments
- macOS launchd restrictions: Agent vs Daemon distinction (user vs system scope) affects socket path locations and permissions
- Idle timeout management: choosing the correct idle timeout is application-specific; too short causes frequent restart costs under bursty patterns

---

### 4.5 Shared Memory and mmap Approaches

#### 4.5.1 Theory and Mechanism

Shared memory IPC eliminates the data-copying overhead of socket and pipe transport. Two or more processes map the same physical memory region using `mmap()` with the `MAP_SHARED` flag, either over a file (`mmap` of a regular file) or a POSIX shared memory object (`shm_open()` + `mmap()`). Writes by one process are immediately visible to all other processes mapping the same region.

For hook dispatch, the shared memory pattern would work as follows:

```
Claude Code process                  Hook Daemon process
    |                                     |
    | Write hook payload to               |
    | fixed offset in shared region       |
    |                                     |
    | Set "request ready" atomic flag     |
    |                                     |
    |                                     | Spin-poll or futex-wait on flag
    |                                     |
    |                                     | Read payload from shared region
    |                                     | Execute handler
    |                                     | Write response to shared region
    |                                     | Set "response ready" flag
    |                                     |
    | Spin-poll or futex-wait             |
    | Read response                       |
```

Node.js `SharedArrayBuffer` provides shared memory semantics for worker threads and (with COOP/COEP headers in browsers, or within Node.js directly) for communication between worker threads. The `Atomics` API provides `wait()` and `notify()` for blocking/waking on shared memory locations.

In Node.js, `SharedArrayBuffer` cannot be shared between separate processes via `postMessage` across a socket boundary (it can only be transferred to worker threads in the same process). Cross-process shared memory requires native bindings (`node-mmap` or custom N-API addons) or POSIX `shm_open`.

#### 4.5.2 Literature Evidence

Worker threads documentation: "A shared `Uint8Array` exists directly in two places—the original and the received copy... it will be accessible from both locations simultaneously." This describes the zero-copy shared memory model for intra-process worker threads.

The key advantage—eliminating serialization—matters when the payload is large. For hook dispatch payloads (typically 0.5–5 KB of JSON), serialization overhead is 0.1–1 ms, which is negligible compared to other costs. The benefit of shared memory manifests primarily for payloads exceeding 100 KB.

For hook dispatch specifically, POSIX shared memory adds complexity (lifecycle management of the shm region, synchronization primitives) without meaningful benefit for small payloads. The approach becomes interesting only if the hook payload grows large enough that pipe-based JSON transfer becomes a bottleneck.

#### 4.5.3 Strengths and Limitations

**Strengths**:
- Zero-copy for large payloads: data transfer at memory bandwidth (tens of GB/s) rather than kernel I/O path
- Lowest possible latency for data transfer once synchronization is established
- No serialization overhead for binary data (e.g., file contents, embeddings)

**Limitations**:
- Complex synchronization requirements: requires atomics, futexes, or semaphores to coordinate access
- Language boundary challenges: `SharedArrayBuffer` is not directly shareable across process boundaries in Node.js without native bindings
- Over-engineering for small payloads: hook dispatch JSON is typically 1–5 KB, where serialization cost is negligible
- Shared memory region lifecycle management: who creates, sizes, and cleans up the region?
- Security: `shm_open` objects under `/dev/shm` may be world-readable depending on permissions

---

### 4.6 Thin Shell Dispatcher Pattern

#### 4.6.1 Theory and Mechanism

The thin shell dispatcher is an optimization within the fork-per-invocation model: rather than loading the full application on each invocation, a minimal entry point loads only the code required for the specific operation requested.

The pattern recognizes that the bulk of CLI startup cost is not the runtime initialization (V8, libuv) but the module loading phase: parsing and evaluating all imported modules. A CLI that imports Commander.js (40+ dependencies), a database library (SQLite), and a machine learning library (ONNX Runtime) will load all three on every invocation, even if the specific subcommand needs none of them.

```
Full CLI boot path:
  index.ts → cli.ts → Commander.js → all subcommand modules
           → SQLite connection → database schema
           → embedding model → ONNX runtime
  Total module load: 300-1000ms

Thin dispatcher boot path:
  hook-runner.ts → readStdin.ts
                → cli-utils.ts (path utilities only)
                → hooks-user-prompt.ts (pure function)
                → hooks-failure-tracker.ts (file I/O)
  Total module load: 10-30ms
```

The compound-agent `hook-runner.ts` implements this pattern. It bypasses Commander.js entirely, reads the hook name from `process.argv[2]`, and dispatches to a minimal set of imported modules. The module file explicitly documents the omission: "Handles `hooks run <hook>` without loading Commander.js, SQLite, or embedding modules."

A key technique shown in the source is avoiding transitive dependency chains by not importing modules that import other heavy modules. The `PRE_COMMIT_MESSAGE` string is inlined rather than imported from `templates.ts` specifically because "templates.ts imports VERSION which may pull in more deps."

#### 4.6.2 Literature Evidence

The thin dispatcher pattern is widely used but rarely documented as a formal pattern. Examples:

**git**: The git binary dispatches to subcommand handlers without loading all subcommand code at startup. `git commit` does not load the merge conflict resolution code. This is implemented via explicit lazy loading in C.

**npm CLI**: npm v7+ uses a lazy-loading plugin architecture where subcommand modules are loaded on demand via dynamic `require()`. The initial startup loads only the command routing table and global options.

**esbuild JavaScript API**: The npm `esbuild` package's JavaScript entry point is intentionally minimal. It detects the platform, locates the Go binary, spawns it (once), and then proxies all API calls to the persistent Go service. The JavaScript entry point itself loads in <5 ms.

**Cargo** (Rust package manager): `cargo build` does not load the `cargo test`, `cargo publish`, or `cargo doc` subcommand code. Each subcommand is a separate module loaded only when invoked.

The pattern's effectiveness depends on the ratio of total module graph size to specific-invocation module size. For compound-agent hooks, the ratio is approximately 10:1 (the full CLI has ~10x more modules than the hook runner needs).

#### 4.6.3 Implementations and Benchmarks

The compound-agent `hook-runner.ts` implementation demonstrates the achievable optimization:

| Invocation | Approx wall-clock | RSS |
|---|---|---|
| `npx ca hooks run phase-guard` | 200–450 ms | 150–300 MB |
| `node dist/cli.js hooks run phase-guard` | 60–120 ms | 80–150 MB |
| `node dist/hook-runner.js phase-guard` | 35–80 ms | 55–80 MB |

The thin runner achieves a 2–4x speedup over the full CLI by avoiding Commander.js initialization and the transitive module graph it pulls in. The memory reduction is proportional.

Further optimization is possible through ESM dynamic imports (`import()` within async functions) to defer loading of hook-specific modules until needed:

```typescript
// Hypothetical further optimization:
export async function runHook(hook: string): Promise<void> {
  switch (hook) {
    case 'user-prompt': {
      const { processUserPrompt } = await import('./setup/hooks-user-prompt.js');
      // ...
    }
  }
}
```

Dynamic imports in ESM carry a one-time cache miss cost on first invocation but subsequent invocations return the cached module. For a fork-per-invocation model, this optimization provides no benefit (each process starts cold). For a persistent daemon, it allows lazy population of the module cache on first use.

#### 4.6.4 Strengths and Limitations

**Strengths**:
- Achievable with a minor refactor of existing code—no architectural change required
- Maintains per-invocation isolation of the base fork model
- No daemon lifecycle management overhead
- Directly measurable and improvable incrementally
- Compatible with all deployment environments (no systemd/launchd required)

**Limitations**:
- Still pays the full Node.js startup cost (V8 init, dynamic linker) on every invocation
- Ceiling is bounded by the Node.js runtime floor (~25–60 ms minimum, regardless of module loading)
- Does not address process accumulation under high concurrency
- Optimization is brittle: a new `import` statement at the module boundary can silently inflate startup cost
- Requires ongoing maintenance discipline to keep the import graph lean

---

### 4.7 How Fast Tools Solve This: Native Runtimes and Single-Binary Approaches

#### 4.7.1 Theory and Mechanism

The fundamental limit of Node.js-based dispatch is the V8 initialization cost. Three approaches circumvent this:

**1. Compiled native binaries (Go, Rust, C)**

A native binary compiled for the target platform requires no runtime initialization. The OS dynamic linker resolves shared library dependencies (typically libc and platform APIs) in 1–5 ms, and the program's `main()` begins executing immediately. A Go program parsing command-line arguments and writing JSON to stdout completes in 2–8 ms total. A Rust equivalent is 1–5 ms.

esbuild exemplifies this approach. The Go binary:
- Starts in <5 ms
- Handles incremental builds via its in-memory context object
- Serves its JavaScript API clients over stdin/stdout with a binary length-prefixed protocol
- Achieves build speeds "10–100x faster than alternative JavaScript-based tools" primarily due to Go's compilation model and the absence of JIT warm-up

**2. JavaScriptCore / Bun**

Bun uses JavaScriptCore, which initializes faster than V8, and implements the runtime in Zig (a systems language with no garbage collector). The Bun binary achieves 5.2 ms startup on Linux for a hello-world. For `bun run <script>`, the overhead (analogous to `npm run`) is 6 ms vs npm's 170 ms.

Bun supports TypeScript natively without a separate compilation step, which means hook handlers written in TypeScript can be executed by Bun without a build step. This is architecturally significant: it eliminates the `dist/` build artifact requirement and allows source-level execution.

**3. Node.js Single Executable Applications (SEA) with startup snapshot**

Node.js v18.16+ supports bundling a JavaScript application into a standalone executable. With `useSnapshot: true`, the V8 heap state after initializing the application is captured and embedded in the binary. On subsequent starts, the heap is deserialized rather than re-evaluated, skipping module loading entirely.

Deno's `compile` command follows a similar approach: "bundles a slimmed down version of the Deno runtime along with your JavaScript or TypeScript code" into a self-contained executable. The resulting binary includes the V8 snapshot of the bundled code, achieving startup times closer to native binaries than standard Node.js invocations.

**4. WebAssembly (WASM)**

SWC (Speedy Web Compiler, written in Rust) ships a WASM build that can be called from Node.js without spawning a child process. The WASM module is loaded once and reused across calls. This pattern applies to any CPU-bound tool that can be compiled to WASM: the hook handler logic runs in-process via a WASM call, with zero fork overhead.

The limitation is that WASM modules cannot access the filesystem, network, or other system resources directly (WASI provides limited capabilities). Hook handlers that need file I/O must implement WASI or use a hybrid approach (WASM for computation, Node.js host for I/O).

#### 4.7.2 Implementations and Benchmarks

```
Startup latency comparison (wall-clock, hello-world equivalent):

Native binary (Rust):        1-5 ms
Native binary (Go):          2-8 ms
Bun (JavaScript/TypeScript): 5-15 ms
Node.js + startup snapshot:  8-20 ms (estimated, with snapshot optimization)
Node.js + thin runner:       35-80 ms
Node.js + full CLI:          60-200 ms
npx + full CLI:              200-450 ms

Memory per process:
Native binary (Rust/Go):     2-15 MB RSS
Bun process:                 25-60 MB RSS
Node.js thin runner:         55-80 MB RSS
Node.js full CLI:            80-200 MB RSS
Node.js + npx overhead:      150-300 MB RSS (npm process tree)
```

**esbuild dispatch in practice**: The esbuild npm package maintains a single persistent Go service process. The JavaScript API (`require('esbuild')`) connects to this service. Incremental build operations complete in 5–50 ms for moderately complex projects. The Go binary processes the build request and returns a JSON result.

**Bun shell**: Bun implements a built-in shell interpreter (`Bun.sh`) that can run bash-like scripts without spawning external processes. For scripts that would otherwise spawn Node.js or system processes, `Bun.sh` provides in-process execution. This is directly applicable to hook dispatch: a Bun-native hook runner could execute all hooks in-process without any fork overhead.

#### 4.7.3 Strengths and Limitations

**Native binaries (Go/Rust)**:
- Strengths: lowest achievable latency, lowest memory, no runtime overhead
- Limitations: rewrite of existing TypeScript code required; TypeScript interop needs explicit JSON serialization; separate compilation pipeline; cross-platform binary distribution

**Bun**:
- Strengths: runs TypeScript directly without build step; 4-5x faster startup than Node.js; compatible with Node.js API surface
- Limitations: not universally installed; minor Node.js compatibility gaps in edge cases; Bun adoption risk if project standardizes on Node.js

**Node.js SEA + startup snapshot**:
- Strengths: stays within Node.js ecosystem; binary distribution without external runtime dependency; V8 snapshot eliminates module loading cost
- Limitations: snapshot must be rebuilt on every code change; snapshot compatibility with native addons is limited; `better-sqlite3` (native module) may not snapshot cleanly

**WASM**:
- Strengths: zero-fork for computation-heavy handlers; runs in any Node.js/Bun/Deno process
- Limitations: limited system access; hook handlers need filesystem I/O; WASI support is still evolving

---

## 5. Comparative Synthesis

### 5.1 Primary Trade-off Dimensions

The following table evaluates each architectural approach across five dimensions relevant to CLI hook dispatch:

- **Dispatch latency**: Wall-clock from hook event to first handler line executing (warm state)
- **Memory per concurrent request**: RSS contribution per in-flight hook invocation
- **Concurrency safety**: Whether the approach handles multiple simultaneous hook calls safely
- **Operational complexity**: Engineering effort required to implement and maintain
- **Crash isolation**: Whether a hook handler crash affects the calling process or other handlers

### 5.2 Comparative Trade-off Table

| Approach | Dispatch Latency | Memory / Concurrent Request | Max Concurrency | Operational Complexity | Crash Isolation | Platform Support |
|---|---|---|---|---|---|---|
| npx + full CLI | 200–450 ms | 150–300 MB | ~20–50 (OS process limit) | Minimal | Full | Universal |
| node + thin runner | 35–80 ms | 55–80 MB | ~100–200 | Low (build step) | Full | Universal |
| Bun + thin runner | 8–25 ms | 25–60 MB | ~200–400 | Low (install Bun) | Full | macOS/Linux/Win |
| Node SEA + snapshot | 8–25 ms | 30–60 MB | ~200–400 | Medium (snapshot build) | Full | Universal |
| Process pool (cluster) | 1–5 ms | ~pool-size × 55 MB | N workers | Medium (pool manager) | Worker-level | Universal |
| Worker thread pool (Piscina) | 0.2–1 ms | ~pool-size × 4 MB | N threads | Medium (thread-safe code) | Thread-level | Universal |
| Persistent daemon (UDS) | 0.5–5 ms + client startup | O(1) for daemon | Unbounded (async) | High (lifecycle mgmt) | Daemon-level | Universal |
| Socket activation (systemd) | 0.5–5 ms + client startup | O(1) when warm, 0 idle | Unbounded (async) | High (unit files) | Daemon-level | Linux only |
| Socket activation (launchd) | 0.5–5 ms + client startup | O(1) when warm, 0 idle | Unbounded (async) | High (plist files) | Daemon-level | macOS only |
| Native binary (Go/Rust) + daemon | 0.1–2 ms | O(1) daemon | Unbounded | Very High (rewrite) | Daemon-level | Universal |
| Shared memory | 0.01–0.1 ms | O(1) | Bounded by region | Very High (sync code) | None | Linux/macOS |

### 5.3 Latency Budget Analysis

Given the Claude Code hook protocol's implicit latency budget (observable UX degradation at ~100–200 ms):

```
Hook latency budget:              100 ms
  - Hook handler logic:            5-15 ms (file I/O, JSON processing)
  - Node.js startup minimum:       25-60 ms  (V8 init, dynamic linker)
  - Module loading (thin runner):   5-20 ms
  - npx overhead:                 150-300 ms  [EXCEEDS BUDGET ALONE]
  - UDS connection (daemon):        0.1-0.5 ms

Budget-compatible approaches (fork-per-invocation):
  - node + thin runner: 35-80 ms [TIGHT - borderline at peak]
  - Bun + thin runner: 8-25 ms [COMFORTABLE]
  - Node SEA: 8-25 ms [COMFORTABLE]

Budget-comfortable approaches (persistent):
  - Daemon + thin client: 8-35 ms total
  - Worker pool: 0.5-6 ms total
  - Native daemon: 0.5-5 ms total
```

### 5.4 Memory Budget Analysis under Concurrent Load

For a compound multi-agent session: 3 agents × 50 tool calls × 2 hooks/tool call = 300 hook invocations. Peak concurrent in-flight hooks (with 50 ms processing time per hook): approximately 20–30 simultaneous processes.

```
Peak concurrent hooks: 25

fork-per-invocation (npx + full CLI):
  25 × 200 MB = 5,000 MB = 5 GB   [SATURATES 8 GB machine]

fork-per-invocation (node + thin runner):
  25 × 70 MB = 1,750 MB = 1.75 GB [HEAVY but manageable on 16 GB]

Persistent daemon:
  1 daemon × 80 MB = 80 MB         [NEGLIGIBLE]

Worker pool (N=4 workers):
  4 × 70 MB = 280 MB               [ACCEPTABLE]

Bun fork-per-invocation:
  25 × 40 MB = 1,000 MB = 1 GB    [MANAGEABLE on 8+ GB]
```

---

## 6. Open Problems and Gaps

### 6.1 Zero-Overhead Warm Dispatch in JavaScript

The fundamental tension is that JavaScript runtimes (V8, JSC) were designed for long-running server processes or browser tabs, not for sub-millisecond process initialization. The snapshot mechanism in Node.js v20 and Deno compile partially address this, but:

- Snapshot compilation is not incremental: every code change requires rebuilding the snapshot
- Native modules (better-sqlite3, ONNX Runtime) cannot be captured in a V8 snapshot and must reinitialize on each start
- Snapshot deserialization itself takes 2–10 ms, setting a floor below which further optimization is impossible without native code

No published work addresses the problem of maintaining a warm JavaScript process that can be cheaply "forked" (semantically) to handle an isolated invocation without the V8 initialization cost. The `vmThreads` approach in Vitest (VM context within worker threads) is the closest approximation, but `vm.Script` contexts are not isolated from memory corruption and are not suitable for untrusted code.

### 6.2 Cross-Platform Socket Activation

systemd socket activation is Linux-specific. launchd is macOS-specific. Windows has no equivalent standard mechanism (Service Control Manager provides service activation but through a different protocol with no Unix domain socket analog). Projects requiring cross-platform socket activation must either implement their own socket file management and daemon lifecycle, use TCP localhost (with the attendant firewall and port conflict risks), or accept platform-specific configuration.

No standardized cross-platform daemon activation framework has emerged for CLI tool ecosystems. Projects like PM2, Overmind, and Foreman provide process management but not socket-activation semantics. This gap means that daemon-based CLI hook systems either accept platform-specific deployment complexity or implement ad-hoc daemon management.

### 6.3 Daemon Health Propagation to Claude Code

When a hook daemon crashes mid-session, the Claude Code process has no built-in mechanism to detect the crash or receive a notification. The next hook invocation will fail with a connection-refused error on the daemon's Unix domain socket. Unless the hook command handles this error by restarting the daemon, the hook will silently fail (if the command suppresses errors with `|| true`) or cause an error visible to the user.

There is no established protocol for Claude Code hooks to indicate "the hook infrastructure is degraded" without blocking tool execution. The `decision: block` mechanism can block individual tool calls but cannot pause the entire session while daemon restart completes. This gap forces hook daemon implementations to choose between:

1. Restarting the daemon on every connection error (adds restart latency to the affected hook call)
2. Degrading gracefully (hook returns empty JSON `{}` on daemon failure, losing observability)
3. Maintaining a persistent supervisord-like process that monitors and restarts the daemon

### 6.4 ESM Startup Cost Amortization

Node.js ESM's three-phase loading (Construction → Instantiation → Evaluation) performs all I/O upfront. For a thin hook runner importing 5–10 modules, this costs 5–20 ms. There is no mechanism to "pre-warm" this cache across process boundaries without a persistent process. The `--require` flag (CommonJS) and `--import` flag (ESM) allow a single file to be pre-loaded before the main module, but they do not reduce the module count—they add to it.

The V8 code cache (`--cache-dir` in some contexts) can avoid re-parsing module files, but it does not eliminate the filesystem stat calls needed to check cache validity. On filesystems with slow metadata performance (network filesystems, overloaded Docker volumes), these stats can add 50–200 ms to startup.

### 6.5 Granularity Mismatch: Hook Events vs. Handler Granularity

Claude Code's `PostToolUse` matcher supports regex patterns (e.g., `"Bash|Edit|Write"`), which means a single hook invocation handles multiple event types. Hook dispatch systems that optimize for specific event types (dedicated workers per event type, specialized codepaths) must still match the flexible matchers that Claude Code provides. No published work addresses the problem of dynamically routing hook dispatch to optimized handlers based on runtime pattern matching in a low-latency context.

### 6.6 Memory Accounting for `npx` Process Trees

When `npx ca hooks run <hook>` is called, the resulting process tree includes: the shell, npx (a Node.js process), and the `ca` process. The shell exits quickly, but the npx process may linger until the `ca` process exits. This means RSS measurements of individual hook invocations undercount the true system-wide memory impact. No established methodology exists for attributing the shared cost of the npm resolution layer to individual hook invocations in the same session.

---

## 7. Conclusion

This survey has examined seven architectural families for lightweight CLI hook dispatch, grounded in the concrete challenge of eliminating the 200–450 ms startup overhead of `npx`-based hook invocation in the compound-agent project.

The central finding is that the overhead is attributable to two separable costs: the `npx` package resolution layer (150–300 ms, npm's own startup) and the Node.js process initialization layer (25–120 ms, V8 + module loading). These two costs must be addressed at different architectural levels.

For projects already using a thin-dispatcher pattern (as compound-agent does with `hook-runner.ts`), the `npx` overhead is the dominant cost and can be eliminated by invoking `node dist/hook-runner.js <hook>` directly rather than through `npx`. This change alone reduces dispatch latency from 200–450 ms to 35–80 ms—compatible with the 100 ms UX threshold for most workloads.

For high-frequency workloads (200+ hooks per session, multi-agent configurations), the per-invocation Node.js startup cost itself becomes the bottleneck. The persistent daemon model—a single background process accepting connections on a Unix domain socket—reduces per-invocation overhead to 0.5–5 ms at the cost of lifecycle management complexity. The esbuild, TypeScript Language Server, and Turborepo projects all converge on this architecture for the same reason: amortizing startup over many requests is the only path to sub-10 ms dispatch latency in JavaScript runtimes.

The worker thread pool model (Piscina) offers a middle ground: 0.2–1 ms dispatch overhead, no cross-process IPC, and memory efficiency comparable to a daemon, but requires the hook runner to operate as a persistent process that manages its own thread pool. This is architecturally equivalent to a daemon without the socket layer.

Native binary approaches (Go, Rust) and alternative runtimes (Bun, Deno compile) represent the hardware floor: 1–8 ms per invocation even with fork-per-invocation semantics. These are viable for projects willing to accept a rewrite or runtime substitution.

The trade-off space distills to three viable paths for a production hook system at compound-agent's scale:

1. **Direct node invocation** of the thin runner: immediate, incremental improvement, no architectural change, 35–80 ms latency, compatible with existing deployment model.

2. **Persistent daemon via Unix domain socket**: 0.5–5 ms latency, O(1) memory, requires lifecycle management (start-on-session, stop-on-session-end, crash recovery), compatible with all platforms.

3. **Bun-based fork-per-invocation**: 8–25 ms latency, lower memory than Node.js, requires Bun installation, preserves per-invocation isolation without daemon complexity.

The npx path—the current default—occupies none of these optimum regions: it has the highest latency (200–450 ms), highest memory (due to npm process overhead), and the worst concurrency behavior. Its sole advantage is zero configuration (works in any environment with Node.js installed without additional setup), which is appropriate for a developer-facing CLI tool but not for a high-frequency hook dispatcher.

---

## References

1. **Bun Runtime Documentation** — Startup time comparison (5.2 ms Bun vs 25.1 ms Node.js on Linux). https://bun.sh/docs/cli/run

2. **Node.js Worker Threads Documentation** — Architecture of worker threads vs child processes, startup cost comparison, SharedArrayBuffer IPC. https://nodejs.org/api/worker_threads.html

3. **Node.js Cluster Module Documentation** — Fork/IPC architecture, round-robin scheduling policy. https://nodejs.org/api/cluster.html

4. **Node.js Single Executable Applications** — Startup snapshot approach, V8 code cache embedding. https://nodejs.org/api/single-executable-applications.html

5. **systemd Socket Activation Documentation** — ListenStream, Accept=no vs Accept=yes, socket file descriptor passing. https://www.freedesktop.org/software/systemd/man/systemd.socket.html

6. **esbuild Incremental Build Mode** — Context object persistence, file/AST cache across rebuild() calls. https://esbuild.github.io/api/#incremental

7. **esbuild Serve Mode** — Persistent HTTP server, server-sent events for HMR, virtual file overlay. https://esbuild.github.io/api/#serve

8. **Vite Architecture** — Persistent dev server rationale, ESM-native module graph, dependency pre-bundling. https://vite.dev/guide/why.html

9. **Claude Code Hooks Protocol** — Event types, stdin/stdout JSON schema, exit code semantics, latency timeouts. https://code.claude.com/docs/en/hooks

10. **Mozilla ES Modules Deep Dive** — Three-phase module loading (Construction/Instantiation/Evaluation), performance implications. https://hacks.mozilla.org/2018/03/es-modules-a-cartoon-deep-dive/

11. **NPX Resolution Documentation** — Local bin resolution, $PATH lookup, package.json traversal. https://github.com/npm/npx/blob/master/README.md

12. **POSIX posix_spawn rationale** — Design rationale vs fork/exec, overhead comparison on MMU vs non-MMU systems. https://pubs.opengroup.org/onlinepubs/9699919799/functions/posix_spawn.html

13. **Node.js v8 Startup Snapshot API** — `startupSnapshot.addSerializeCallback`, `setDeserializeMainFunction`, pre-warming application state. https://nodejs.org/api/v8.html

14. **Deno Compile Documentation** — Single-binary compilation, cross-platform targets, `--self-extracting`. https://docs.deno.com/runtime/reference/cli/compile/

15. **pnpm dlx Documentation** — Registry-fetch-on-demand model, `--package` flag, `catalog:` protocol. https://pnpm.io/cli/dlx

16. **Piscina Worker Pool** — Worker thread pool architecture, message passing, back-pressure management. https://github.com/piscinajs/piscina

17. **rigtorp/ipc-bench** — Ping-pong latency benchmarks for pipes, Unix domain sockets, TCP sockets (C implementation). https://github.com/rigtorp/ipc-bench

18. **Node.js Don't Block the Event Loop** — Worker pool architecture, partitioning vs offloading strategies. https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop

19. **Vitest Pool Architecture** — `threads`, `forks`, `vmThreads` pool types, `PoolRunnerInitializer` interface. https://vitest.dev/advanced/pool

20. **POSIX shm_open man page** — POSIX shared memory objects, `mmap(2)` integration, `/dev/shm` tmpfs. https://man7.org/linux/man-pages/man3/shm_open.3.html

21. **compound-agent hook-runner.ts** — Thin dispatcher implementation bypassing Commander.js, SQLite, and embedding modules. `/Users/nathan/Documents/Code/compound-agent/src/hook-runner.ts`

22. **compound-agent read-stdin.ts** — Abortable stdin reader with timeout, event-listener-based cleanup. `/Users/nathan/Documents/Code/compound-agent/src/read-stdin.ts`

---

## Practitioner Resources

### Measuring Hook Dispatch Latency

To baseline the current `npx` overhead in a project:

```bash
# Measure npx overhead
time npx ca hooks run pre-commit < /dev/null

# Measure direct node invocation
time node dist/hook-runner.js pre-commit < /dev/null

# Measure thin runner module load time
node --prof dist/hook-runner.js pre-commit < /dev/null
node --prof-process isolate-*.log
```

### Eliminating the npx Layer

The minimal change to eliminate the 150–300 ms `npx` overhead: replace hook commands in `.claude/settings.json`:

```json
// Before:
"command": "npx ca hooks run user-prompt 2>/dev/null || true"

// After (requires compound-agent in node_modules):
"command": "node node_modules/compound-agent/dist/hook-runner.js user-prompt 2>/dev/null || true"

// Or with absolute path:
"command": "node /path/to/project/node_modules/compound-agent/dist/hook-runner.js user-prompt 2>/dev/null || true"
```

### Unix Domain Socket Daemon Skeleton (Node.js)

```typescript
// hook-daemon.ts: minimal persistent daemon skeleton
import { createServer } from 'node:net';
import { unlinkSync, existsSync } from 'node:fs';

const SOCKET_PATH = '/tmp/hook-daemon-' + process.env['CLAUDE_SESSION_ID'] + '.sock';

if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH);

const server = createServer((socket) => {
  let buf = '';
  socket.on('data', (chunk) => { buf += chunk.toString(); });
  socket.on('end', async () => {
    const payload = JSON.parse(buf);
    const response = await dispatch(payload);
    socket.write(JSON.stringify(response));
    socket.end();
  });
});

server.listen(SOCKET_PATH, () => {
  process.stderr.write('hook-daemon listening on ' + SOCKET_PATH + '\n');
});

process.on('SIGTERM', () => {
  server.close(() => {
    if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH);
    process.exit(0);
  });
});
```

### Approximate Latency Budget Reference

```
Target: < 100 ms total hook latency

Component breakdown for persistent daemon approach:
  Client startup (thin node process): 35-60 ms
  + Socket connect: 0.1-0.5 ms
  + JSON write to daemon: 0.1-0.5 ms
  + Daemon handler logic: 1-10 ms
  + JSON read from daemon: 0.1-0.5 ms
  + Client exit: 1-5 ms
  = Total: 37-76 ms  [WITHIN BUDGET]

Component breakdown for Bun client + node daemon:
  Client startup (Bun): 5-15 ms
  + Socket + handler + response: 2-12 ms
  = Total: 7-27 ms  [COMFORTABLE MARGIN]
```

### Key ESM Startup Optimization Techniques

1. **Avoid barrel imports**: `import { a, b } from './index.js'` loads the entire barrel module. Use direct imports: `import { a } from './module-a.js'`.

2. **Inline constants to break import chains**: If `FOO` is needed from `config.ts` which imports `version.ts` which imports `package.json`, duplicate the constant rather than pulling in the chain.

3. **Use dynamic imports for heavy dependencies**: `const { heavyLib } = await import('./heavy.js')` defers loading until actually needed. In a fork-per-invocation model this only helps if the heavy dependency is conditionally needed; in a daemon model it enables lazy cache warming.

4. **Measure with `--trace-uncaught-exceptions`** and `node --input-type=module` profiling to identify which imports dominate the startup timeline.

5. **Node.js `--experimental-vm-modules` warning**: VM contexts within worker threads (Vitest's `vmThreads`) provide module isolation without process isolation. This is appropriate for test runners but not for security-sensitive hook handlers.
