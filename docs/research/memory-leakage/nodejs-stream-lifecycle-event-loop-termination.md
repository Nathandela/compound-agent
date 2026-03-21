# Node.js Stream Lifecycle and Event Loop Termination Semantics

**A Technical Survey**

*Research area: Runtime systems, asynchronous I/O, process lifecycle*
*Date: March 2026*

---

## Abstract

Node.js processes frequently exhibit unexpected persistence — hanging for tens of seconds after apparently completing all user-visible work. This survey examines the precise mechanisms by which stream handles prevent event loop termination, with special attention to `process.stdin` and the semantic differences between the `for await...of` async iterator protocol and classical event-listener stream consumption. We trace the causal chain from libuv's C-level `uv__handle_start` / `uv__handle_stop` macros through V8-exposed JavaScript handles up to the high-level stream API, documenting at each layer exactly which operations increment and decrement the active-handle counter that governs process lifetime. We then survey five distinct stdin-consumption patterns (synchronous blocking, async iterator, event-listener, readline interface, and hybrid abort-controller), analyse their lifecycle semantics, and present a comparative synthesis of their trade-offs. The survey is grounded in libuv source code, Node.js internal commits, GitHub issue archives, and published benchmarks. An empirical vignette contextualises the analysis: in a production hook runner executing roughly 200 invocations per agent session, naive `for await` consumption produced hundreds of zombie-like Node.js processes and material memory overhead; the fix required switching to event-listener consumption paired with explicit `pause()` / `removeAllListeners()` / `destroy()` cleanup.

---

## 1. Introduction

### 1.1 The Practical Problem

Claude Code's hook protocol sends a JSON payload to every hook script on standard input and expects the script to exit promptly after processing it. A hook implemented as:

```javascript
let data = '';
for await (const chunk of process.stdin) {
  data += chunk;
}
const payload = JSON.parse(data);
// ... process payload ...
process.exit(0);
```

exits correctly in the common case, yet the same script invoked in rapid succession accumulates dozens of resident Node.js processes that linger for approximately 30 seconds each before the stream's internal timeout fires and the handle is finally released. With 200 hook invocations per agent session — a realistic figure for subagent-heavy workloads — this produces hundreds of concurrent processes, degrading the host machine's memory, scheduler, and file-descriptor budget.

Understanding why this happens requires traversing three layers of abstraction: the libuv event loop and its handle reference-counting machinery; the Node.js stream state machine and its relationship to underlying libuv handles; and the async iterator protocol and its interaction with stream lifecycle.

### 1.2 Scope and Structure

This survey covers:

1. **libuv internals**: handle flags, the active-handle counter, and the loop-alive predicate.
2. **`for await` vs event-based consumption**: how each approach interacts with handle lifecycle.
3. **`process.stdin` special cases**: lazy initialisation, TTY vs pipe vs file, the three-state flow machine.
4. **Process exit conditions**: the full exit algorithm, `beforeExit`, `process.exitCode` vs `process.exit()`.
5. **Real-world patterns**: five concrete stdin-consumption approaches with code and trade-off analysis.
6. **Edge cases**: heredoc EOF, orphaned child pipes, TTY cleanup constraints, `destroy()` vs `push(null)`.

The paper does not advocate for a single "correct" approach; it maps the design space so practitioners can make informed choices given their constraints.

### 1.3 Terminology

| Term | Definition |
|------|------------|
| **Handle** | A libuv `uv_handle_t` subtype representing a long-lived I/O object (socket, pipe, TTY, timer, etc.) |
| **Active handle** | A handle for which `uv__handle_start` has been called and `uv__handle_stop` has not yet been called |
| **Referenced handle** | An active handle that has the `UV_HANDLE_REF` flag set, contributing to the loop-alive count |
| **Loop-alive** | The condition `active_reqs > 0 \|\| active_handles > 0 \|\| closing_handles != NULL` |
| **`readableFlowing`** | Node.js stream property that is `null`, `false`, or `true`, encoding whether the stream is consuming from its underlying handle |
| **Async iterator** | An object implementing `[Symbol.asyncIterator]()` that returns `{ next(), return(), throw() }` |

---

## 2. Foundations

### 2.1 libuv Event Loop Architecture

libuv is the cross-platform I/O library that underpins Node.js. Its central abstraction is the `uv_loop_t`, which drives all I/O, timers, and process management in a single thread via `uv_run(loop, UV_RUN_DEFAULT)`.

#### 2.1.1 Loop Phases

Each iteration of the loop traverses thirteen sequential phases (documented in libuv's design overview):

1. Update loop time concept.
2. Execute timers whose threshold has passed.
3. **Check liveliness — exit if not alive.**
4. Execute pending callbacks (deferred I/O from prior iteration).
5. Run idle handles.
6. Run prepare handles (before I/O blocking).
7. Calculate poll timeout.
8. **Block on I/O** (epoll/kqueue/IOCP) for up to the calculated timeout.
9. Run check handles (after I/O).
10. Execute close callbacks for handles that were `uv_close()`'d.
11. Update loop time.
12. Execute remaining due timers.
13. If `UV_RUN_ONCE` or `UV_RUN_NOWAIT`: return; otherwise continue.

Phase 3 is the critical gate. The predicate tested there is:

```c
static int uv__loop_alive(const uv_loop_t* loop) {
  return uv__has_active_handles(loop) ||
         uv__has_active_reqs(loop) ||
         loop->closing_handles != NULL;
}
```

where `uv__has_active_handles` reduces to `loop->active_handles > 0`. If this predicate is false, the loop exits and the process proceeds toward termination.

#### 2.1.2 Handle Flags and the Active-Handle Counter

All libuv handles share the base `uv_handle_t` type, which contains a private `flags` field with the following bits (from `src/uv-common.h` in libuv v1.x):

| Flag constant | Hex value | Meaning |
|---|---|---|
| `UV_HANDLE_CLOSING` | `0x00000001` | `uv_close()` has been called; close callback pending |
| `UV_HANDLE_CLOSED` | `0x00000002` | Close callback has fired; handle is dead |
| `UV_HANDLE_ACTIVE` | `0x00000004` | Handle is participating in I/O |
| `UV_HANDLE_REF` | `0x00000008` | Handle is referenced — contributes to loop-alive count |

The macros that manipulate the active-handle counter are:

```c
#define uv__handle_start(h) \
  do { \
    if (((h)->flags & UV_HANDLE_ACTIVE) != 0) break; \
    (h)->flags |= UV_HANDLE_ACTIVE; \
    if (((h)->flags & UV_HANDLE_REF) != 0) uv__active_handle_add(h); \
  } while (0)

#define uv__handle_stop(h) \
  do { \
    if (((h)->flags & UV_HANDLE_ACTIVE) == 0) break; \
    (h)->flags &= ~UV_HANDLE_ACTIVE; \
    if (((h)->flags & UV_HANDLE_REF) != 0) uv__active_handle_rm(h); \
  } while (0)
```

`uv__active_handle_add` and `uv__active_handle_rm` are simple increments and decrements on `loop->active_handles`. The loop-alive check is therefore an integer comparison, not a set membership test.

The idempotency rule for `ref`/`unref` is by design: `uv_ref()` sets `UV_HANDLE_REF`; `uv_unref()` clears it. Both operations are idempotent bit-set operations — calling `uv_ref()` twice is equivalent to calling it once. This is unlike a traditional reference-count integer where two `ref` calls require two `unref` calls to balance.

#### 2.1.3 Stream Handles and `uv_read_start` / `uv_read_stop`

All stream handle types — `uv_tcp_t`, `uv_pipe_t`, `uv_tty_t` — inherit the stream machinery in `src/unix/stream.c`. The key implementations are:

```c
int uv__read_start(uv_stream_t* stream,
                   uv_alloc_cb alloc_cb,
                   uv_read_cb read_cb) {
  stream->flags |= UV_HANDLE_READING;
  stream->read_cb = read_cb;
  stream->alloc_cb = alloc_cb;
  uv__io_start(stream->loop, &stream->io_watcher, POLLIN);
  uv__handle_start(stream);  /* increments active_handles */
  return 0;
}

int uv_read_stop(uv_stream_t* stream) {
  if (!(stream->flags & UV_HANDLE_READING))
    return 0;
  stream->flags &= ~UV_HANDLE_READING;
  uv__io_stop(stream->loop, &stream->io_watcher, POLLIN);
  uv__handle_stop(stream);   /* decrements active_handles */
  stream->read_cb = NULL;
  stream->alloc_cb = NULL;
  return 0;
}
```

The consequence is precise: **a stream handle holds the event loop open for exactly the duration between `uv_read_start` and `uv_read_stop` (or `uv_close`)**. A stream that has never had `uv_read_start` called, or has had `uv_read_stop` called, is inactive and does not contribute to loop-alive.

#### 2.1.4 Poll Timeout Calculation

Phase 7 computes how long to block in the I/O poll. The timeout is zero (non-blocking) if:

- `UV_RUN_NOWAIT` was passed to `uv_run`.
- `uv_stop()` was called.
- There are no active handles or requests.
- Any idle handle is active.
- Any handle is in the closing list.

Otherwise the timeout equals the interval until the nearest active timer, or infinity if no timers are scheduled. A process with only an open stdin handle and no timers will block in the poll phase **indefinitely** — until data arrives or the handle is closed. This is the fundamental mechanism behind a "hanging" process.

### 2.2 Node.js Layer: Handles, Streams, and JavaScript

Node.js bridges libuv handles to JavaScript through C++ wrappers in `src/` (e.g., `stream_wrap.cc`, `pipe_wrap.cc`, `tty_wrap.cc`). These expose `ref()` / `unref()` methods that delegate directly to `uv_ref()` / `uv_unref()` on the underlying libuv handle.

`process._getActiveHandles()` is an undocumented but stable internal API that returns the JavaScript wrappers of all currently active handles, enabling runtime introspection of what is keeping the event loop alive. Tools such as `why-is-node-running` and `wtfnode` use this API (along with the `async_hooks` module for timer tracking) to produce human-readable diagnostics.

#### 2.2.1 `net.Socket._read` and Handle Activation

`process.stdin` in non-TTY contexts is an instance of `net.Socket`. The `_read` implementation that Node.js calls when a consumer requests data is approximately:

```javascript
Socket.prototype._read = function(n) {
  if (this.connecting || !this._handle) {
    this.once('connect', () => this._read(n));
  } else if (!this._handle.reading) {
    tryReadStart(this);  // calls this._handle.readStart() -> uv_read_start()
  }
};
```

`tryReadStart` invokes the C++ binding's `readStart()`, which calls `uv_read_start()` on the underlying libuv handle. The complementary `ref()` and `unref()` on `net.Socket` delegate to the native handle's `uv_ref()` / `uv_unref()`:

```javascript
Socket.prototype.ref = function() {
  if (this._handle) this._handle.ref();
  return this;
};

Socket.prototype.unref = function() {
  if (this._handle) this._handle.unref();
  return this;
};
```

### 2.3 Node.js Readable Stream State Machine

Node.js Readable streams maintain a three-valued `readableFlowing` property:

| Value | Meaning | Underlying handle state |
|---|---|---|
| `null` | No consumer mechanism attached; stream initialised but not started | Handle inactive; `uv_read_start` not called |
| `false` | Consumer mechanism existed but is paused | Handle may still be active if `uv_read_stop` was not called |
| `true` | Stream is flowing; actively emitting `data` events | Handle active; `uv_read_start` has been called |

**State transitions:**

- `null -> true`: Attaching a `data` listener, calling `resume()`, or calling `pipe()`.
- `true -> false`: Calling `pause()`, calling `unpipe()` with no remaining destinations, or backpressure from a downstream writable.
- `false -> true`: Calling `resume()` again.

A critical subtlety: **removing a `data` listener does not automatically pause the stream**. The Node.js documentation is explicit: "Removing `'data'` event handlers will not automatically pause the stream." The stream remains flowing and `uv_read_start` remains active unless `pause()` is explicitly called. Calling `removeAllListeners()` alone, without calling `pause()`, leaves the handle active and the loop alive.

### 2.4 `process.stdin` Initialisation

`process.stdin` is initialised lazily (only when first accessed) inside `lib/internal/process/stdio.js`. The type of the resulting stream object depends on the file descriptor:

- **TTY** (`isatty(0) === true`): `process.stdin` is an instance of `tty.ReadStream`, which extends `net.Socket`. The `isTTY` property is `true`.
- **Pipe** (stdin is a named or anonymous pipe): `process.stdin` is an instance of `net.Socket`. The `isTTY` property is `undefined` (falsy).
- **Regular file** (stdin redirected from a file): `process.stdin` is an instance of `fs.ReadStream` (a plain Readable, not a Socket). The `isTTY` property is `undefined`.

Since 2018, `process.stdin` is created with `manualStart: true` (commit `c8fe8e8f5d`), which suppresses the automatic call to `_read()` that would otherwise trigger `uv_read_start`. This prevents conflicts when Node.js is already consuming the same file descriptor through an IPC channel on a child process. The practical consequence is that `process.stdin` **starts with `readableFlowing === null`** and does not hold the event loop open until a consumer explicitly attaches.

The activation sequence is:

1. User code calls `process.stdin.on('data', handler)` or `process.stdin.resume()` or begins `for await...of` iteration.
2. The stream transitions `readableFlowing` to `true`.
3. `_read()` is called, which calls `tryReadStart()`, which calls `uv_read_start()`.
4. The libuv handle becomes active (`UV_HANDLE_ACTIVE` set, `active_handles` incremented).
5. The loop-alive predicate becomes true; the loop will not exit naturally.

### 2.5 The Process Exit Algorithm

A Node.js process exits naturally when the event loop's liveliness check (libuv phase 3) fails: `active_handles == 0 && active_reqs == 0 && closing_handles == NULL`.

Immediately before exiting, Node.js emits `beforeExit` if the loop became empty without an explicit `process.exit()` call. A `beforeExit` listener may schedule new async work, which reschedules the loop. `process.exit()` bypasses this mechanism entirely — it terminates the process synchronously without waiting for pending I/O.

The distinction between `process.exit(code)` and `process.exitCode = code` is material for graceful shutdown:

- `process.exit(code)`: Immediate termination. All pending I/O, including buffered `process.stdout` writes, may be truncated.
- `process.exitCode = code`: Sets the exit code to be used when the event loop drains naturally. Pending I/O completes.

The `exit` event fires in both cases, but only synchronous operations within `exit` handlers are guaranteed to execute.

---

## 3. Taxonomy of Approaches

Five qualitatively distinct approaches to reading `process.stdin` appear in production codebases. They are categorised along two axes: (1) whether they activate the underlying libuv handle, and (2) how that activation is terminated.

| # | Approach | Activates handle? | Termination mechanism |
|---|---|---|---|
| A | Synchronous (`fs.readSync`) | No — bypasses stream | Implicit: blocking syscall returns |
| B | Async iterator (`for await`) | Yes — via stream's `_read` | Generator finally-block on stream end |
| C | Event listeners (`on('data')`) | Yes — via `resume()` | Explicit: `pause()` + `destroy()` |
| D | `readline.Interface` | Yes — wraps stream | `rl.close()` (calls pause only) |
| E | Hybrid (AbortController + events) | Yes | `abort()` + `destroy()` |

---

## 4. Analysis

### 4.1 Approach A: Synchronous Blocking Read (`fs.readSync`)

#### 4.1.1 Theory and Mechanism

The synchronous approach reads from file descriptor 0 directly, bypassing the stream API and libuv's I/O watcher machinery:

```javascript
import { readSync } from 'node:fs';

function readStdinSync(maxBytes = 1_048_576) {
  const chunks = [];
  const buf = Buffer.allocUnsafe(65536);
  let totalBytes = 0;
  let bytesRead;
  while ((bytesRead = readSync(0, buf, 0, buf.length, null)) > 0) {
    chunks.push(Buffer.from(buf.subarray(0, bytesRead)));
    totalBytes += bytesRead;
    if (totalBytes > maxBytes) throw new Error('stdin too large');
  }
  return Buffer.concat(chunks).toString('utf-8');
}
```

`readSync(fd, buf, offset, length, null)` issues a blocking `read(2)` syscall. libuv's `active_handles` counter is not touched. The call blocks the Node.js thread until bytes are available or EOF is reached.

Because the process is blocked in a syscall, the event loop is not running — no timers fire, no promises resolve, no IPC messages are processed. After `readSync` returns, the event loop continues with `active_handles` still at whatever value it had before the call. If no other handles are active, the process exits immediately after the synchronous code completes.

#### 4.1.2 Literature Evidence

The Node.js documentation on blocking vs. non-blocking notes that synchronous file operations block the entire event loop thread. For stdin specifically, this is sometimes acceptable in CLI tools that read configuration before starting any server. The Claude Code hooks documentation examples include `fs.readFileSync('/dev/stdin', 'utf8')` as a common pattern for hook scripts that do not need concurrency.

Practical complications arise on Windows: `fs.readSync` on `STDIN` when stdin is a pipe can return `EAGAIN` in some versions (Node.js issue #35997), requiring retry loops that are not needed on POSIX.

#### 4.1.3 Implementations and Benchmarks

The synchronous approach performs well for small payloads because it avoids all Promise overhead, microtask scheduling, and event-loop overhead. There are no `setImmediate` boundaries between chunks. For the hook-runner use case (typical payloads 1–50 KB), this is the lowest-latency approach.

The performance of `for await...of` on streams involves `setImmediate` between chunks (present in some Node.js versions), creating roughly 1.5–2x overhead vs. event-listener iteration on the same data (Node.js issue #31979, benchmarked at 48–68ms vs. 32–35ms for event-listener approach, with memory usage 3–3.5x higher for async iteration).

#### 4.1.4 Strengths and Limitations

**Strengths:**
- Zero interaction with the event loop handle machinery; the process exits as soon as the synchronous code path finishes.
- Simplest possible lifecycle: no cleanup required.
- No risk of handle leaks.
- Lowest latency for small payloads.

**Limitations:**
- Blocks the event loop thread entirely while waiting for data.
- Cannot implement timeouts without signal tricks or `setRawMode`.
- Behaviour is undefined or buggy on Windows when stdin is a pipe in some Node.js versions.
- Not applicable when the process needs to do other work (respond to signals, run timers) while waiting for stdin.
- `fs.readFileSync('/dev/stdin', 'utf8')` is a common shorthand but silently fails on Windows (no `/dev/stdin` device).

---

### 4.2 Approach B: Async Iterator (`for await...of`)

#### 4.2.1 Theory and Mechanism

Readable streams expose `[Symbol.asyncIterator]()` since Node.js 10.0.0. The original implementation lived in `lib/internal/streams/async_iterator.js`; it was later replaced with an async generator inside `lib/_stream_readable.js` (commit `4bb40078da`). The generator form is approximately:

```javascript
async function* createAsyncIterator(stream) {
  let callback = nop;
  function next(resolve) {
    if (this === stream) { callback(); callback = nop; }
    else { callback = resolve; }
  }
  stream
    .on('readable', next)
    .on('error', next)
    .on('end', next)
    .on('close', next);
  try {
    const state = stream._readableState;
    while (true) {
      const chunk = stream.read();
      if (chunk !== null) {
        yield chunk;
      } else if (state.errored) {
        throw state.errored;
      } else if (state.ended) {
        break;
      } else {
        await new Promise(next);
      }
    }
  } catch (err) {
    destroyImpl.destroyer(stream, err);
    throw err;
  } finally {
    destroyImpl.destroyer(stream, null);  // destroys even on normal exit
  }
}
```

The `finally` block destroys the stream unconditionally — whether iteration ended naturally (`state.ended`), was interrupted by `break`, `return`, or an exception. This means: **using `for await` over a stream that never ends (like `process.stdin` waiting for input that never comes) will hold the handle active indefinitely, because the `finally` block never executes until the loop exits or the stream ends.**

The common pattern:

```javascript
let data = '';
for await (const chunk of process.stdin) {
  data += chunk;
}
```

works correctly when stdin closes (EOF from a pipe) because the loop exits when `state.ended` is true, the `finally` block calls `destroyImpl.destroyer`, `uv_read_stop` is called, `active_handles` decrements, and the loop exits. However, if stdin is not closed — which is the case when the hook runner still holds stdin open — the loop blocks waiting for data that will never arrive.

Since Node.js 16.x, the `readable.iterator({ destroyOnReturn: false })` option allows breaking from a loop without destroying the stream:

```javascript
for await (const chunk of process.stdin.iterator({ destroyOnReturn: false })) {
  data += chunk;
  if (isComplete(data)) break;
}
// stream not destroyed; must clean up manually
```

Breaking from a standard `for await` (without `destroyOnReturn: false`) invokes the async iterator's `return()` method, which calls `destroyImpl.destroyer(stream, null)`. Per Node.js issue #46717, this destruction emits an `AbortError` on the stream — a semantically misleading signal for an intentional early exit.

#### 4.2.2 Literature Evidence

Node.js issue #22044 (filed September 2018) documented the first widely-noticed case of `process.stdin` async iteration hanging on interactive TTYs. The root cause was a state inconsistency in the readable event emission logic. The pattern of processes lingering after `for await` on stdin reappears repeatedly in the Node.js issue tracker under different guises (issues #20503, #33463, #46717).

The performance benchmarks in Node.js issue #31979 demonstrated that `for await` is approximately 50% slower than event-listener consumption for high-volume streaming workloads, with significantly higher memory usage (8.86–10.17 MB vs ~3 MB), attributed to the `setImmediate` boundary inserted between each event in the async iterator's event-to-promise translation layer.

#### 4.2.3 Implementations and Benchmarks

Baseline async iterator pattern (does not handle timeout; hangs on open pipe):

```javascript
async function readStdinForAwait() {
  let data = '';
  for await (const chunk of process.stdin) {
    data += chunk;
  }
  return data;
}
```

With explicit cleanup to prevent hanging on an open pipe:

```javascript
async function readStdinForAwaitWithTimeout(timeoutMs = 30_000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let data = '';
  try {
    for await (const chunk of process.stdin) {
      data += chunk;
    }
  } catch (err) {
    if (err.name !== 'AbortError') throw err;
  } finally {
    clearTimeout(timer);
    // The generator's finally block fires here and calls destroy().
    // On an open pipe that never sent EOF, we need to destroy explicitly
    // if the AbortController fired before the loop exited naturally:
    if (!process.stdin.destroyed) process.stdin.destroy();
  }
  return data;
}
```

#### 4.2.4 Strengths and Limitations

**Strengths:**
- Idiomatic modern JavaScript; clean, readable syntax.
- Backpressure is managed automatically through the iterator protocol.
- Error handling integrates naturally with `try/catch`.
- When stdin cleanly sends EOF (pipe closed), the iterator terminates and cleanup is automatic.

**Limitations:**
- Does not exit cleanly when stdin is open but no more data is expected (the common case for hook runners on a non-closed pipe).
- ~50% throughput penalty and ~3x memory overhead vs. event-listener approach for high-frequency chunk delivery (Node.js issue #31979).
- `destroyOnReturn: true` (default) emits `AbortError` on the stream when breaking early, which can confuse downstream error handlers (issue #46717).
- Requires explicit destroy on timeout; the generator's `finally` block does not fire until the loop exits.
- `setImmediate`-between-chunks behaviour (in some versions) creates observable latency spikes under load.

---

### 4.3 Approach C: Event Listeners (`on('data')` + `on('end')`)

#### 4.3.1 Theory and Mechanism

The classical event-driven approach attaches `data`, `end`, and `error` listeners, calls `resume()` to activate the stream, and performs explicit cleanup after resolution:

```javascript
function readStdin(options = {}) {
  const { timeoutMs = 30_000, maxBytes = 1_048_576 } = options;
  const { stdin } = process;

  if (stdin.readableEnded || stdin.destroyed) return Promise.resolve('');

  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    function cleanup() {
      clearTimeout(timerId);
      stdin.removeListener('data', onData);
      stdin.removeListener('end', onEnd);
      stdin.removeListener('error', onError);
      // pause() transitions readableFlowing from true to false.
      // On its own it does not guarantee uv_read_stop is called,
      // but it prevents further data events from delivering buffered chunks.
      stdin.pause();
      // destroy() calls uv_close() on the handle, which fires the close
      // callback and decrements active_handles. This is the reliable path
      // to event loop drain.
      // Skip destroy on TTY: destroying a TTY stdin closes fd 0 and
      // kills the terminal for the parent process.
      if (!stdin.isTTY && !stdin.destroyed) {
        stdin.destroy();
      }
    }

    function settle(fn) {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    }

    function onData(chunk) {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        settle(() => reject(new Error(`stdin exceeds ${maxBytes} byte limit`)));
        return;
      }
      chunks.push(chunk);
    }

    function onEnd() {
      settle(() => resolve(Buffer.concat(chunks).toString('utf-8')));
    }

    function onError(err) {
      settle(() => reject(err));
    }

    const timerId = setTimeout(() => {
      settle(() => reject(new Error('stdin read timed out')));
    }, timeoutMs);

    stdin.on('data', onData);
    stdin.on('end', onEnd);
    stdin.on('error', onError);
    stdin.resume();  // activates stream: readableFlowing -> true, uv_read_start called
  });
}
```

The lifecycle of the underlying libuv handle through this sequence:

1. `stdin.resume()` calls `_read()` calls `tryReadStart()` calls `uv_read_start()`. `UV_HANDLE_ACTIVE` is set; `active_handles` incremented.
2. Data arrives; `onData` accumulates chunks.
3. EOF or timeout fires; `settle` is called.
4. `stdin.pause()` sets `readableFlowing = false`. This does NOT reliably call `uv_read_stop` across all Node.js versions. The handle may remain active.
5. `stdin.destroy()` calls `_destroy()` which calls `closeSocketHandle()` which calls `uv_close()`. `UV_HANDLE_CLOSING` is set. Eventually the close callback fires: `UV_HANDLE_CLOSED` is set, `active_handles` decremented.
6. Event loop liveliness check fails; process exits.

#### 4.3.2 The `removeAllListeners` Trap

A common misconception is that `removeAllListeners()` is sufficient cleanup:

```javascript
// INCORRECT: process will still hang
stdin.removeAllListeners();
```

Removing listeners does not pause the stream and does not call `uv_read_stop`. The stream's `readableFlowing` remains `true`, `uv_read_start` remains in effect, and `active_handles` remains elevated. The process continues to block in the poll phase waiting for data.

The minimum viable cleanup sequence for a non-TTY stdin is:

```
removeListeners -> pause() -> destroy()
```

`pause()` is included as a defensive measure before `destroy()` to halt the emission of buffered data events that may have been queued but not yet delivered. `destroy()` is the operation that actually closes the handle and guarantees `active_handles` decrements.

#### 4.3.3 TTY vs Pipe Distinction

The cleanup sequence diverges depending on the stream type:

- **Pipe / socket** (`isTTY === undefined`): Safe to call `destroy()`. Destroying the socket closes the file descriptor without affecting the parent process.
- **TTY** (`isTTY === true`): Calling `destroy()` closes file descriptor 0. In a terminal session, this destroys the terminal for the parent process (shell), which continues to hold fd 0 open. The safe cleanup for TTY stdin is `pause()` only, accepting that the handle may remain open. On TTY, the process typically exits for other reasons (explicit `process.exit()`, signal handling) rather than natural event loop drain.

#### 4.3.4 Literature Evidence

Node.js issue #32291 ("Piping process.stdin to child.stdin leaves behind an open handle") confirmed that `unpipe()` alone is insufficient — even after unpiping, the stdin handle remains active. The issue's resolution noted that `destroy()` is required, and that `stream.pipeline()` handles this automatically.

The Inquirer.js issue #1358 documented the complementary problem: after Inquirer closes its readline interface (which calls `stdin.pause()` internally), subsequent `stdin.on('data', ...)` calls fail to fire because the stream is paused and no one calls `resume()`. The maintainer noted that calling `resume()` inside a library is undesirable because it prevents scripts from exiting — illustrating the two-sided nature of the resume/pause lifecycle.

#### 4.3.5 Implementations and Benchmarks

Event-listener consumption benchmarked at 32–35ms and ~3MB memory in the Node.js issue #31979 workloads, compared to 48–68ms and 8.86–10.17MB for async iterator. The event-listener code "runs through emitted chunks/events mostly synchronously," avoiding the `setImmediate` boundaries inherent in the Promise-based iterator protocol.

#### 4.3.6 Strengths and Limitations

**Strengths:**
- Most direct mapping to the underlying libuv callback mechanism; no async overhead between events.
- Full control over cleanup timing.
- Cleanest process exit semantics when paired with `destroy()`.
- Best throughput for high-frequency chunk delivery.
- Supports timeout via `setTimeout` with explicit cleanup on both success and timeout paths.

**Limitations:**
- More verbose than `for await`; requires careful listener bookkeeping to avoid leaks.
- Calling `destroy()` is irreversible — the stream cannot be re-read.
- The TTY vs non-TTY distinction requires conditional cleanup logic.
- `pause()` alone is insufficient; must be paired with `destroy()` for non-TTY to guarantee handle closure.
- If the `data` or `end` listener throws synchronously, the `settle` wrapper may not fire cleanly without additional guarding.

---

### 4.4 Approach D: `readline.Interface`

#### 4.4.1 Theory and Mechanism

`readline.createInterface` wraps a readable stream and provides line-by-line reading. When `input: process.stdin` is provided, the interface calls `stdin.resume()` internally, activating the underlying handle:

```javascript
import { createInterface } from 'node:readline';

function readStdinLines() {
  return new Promise((resolve) => {
    const lines = [];
    const rl = createInterface({ input: process.stdin });
    rl.on('line', (line) => lines.push(line));
    rl.on('close', () => resolve(lines));
  });
}
```

Cleanup is via `rl.close()`, which calls `stdin.pause()` but — crucially — **does not call `stdin.destroy()`**. The readline module's design philosophy is that it borrows the stream rather than owning it; therefore it does not destroy the stream on close.

This means that after `rl.close()`, `process.stdin` remains in the paused state with `readableFlowing === false`, and the underlying handle may or may not be active depending on the Node.js version and stream state. In most cases `pause()` alone is sufficient to allow the process to exit because Node.js internally calls `uv_read_stop` when the stream transitions to paused with no consumers, but this behaviour is not guaranteed across all versions.

The readline module also supports an async iterator for line-by-line consumption (since Node.js 11.4.0):

```javascript
const rl = createInterface({ input: process.stdin });
for await (const line of rl) {
  // process line
}
```

This inherits the same async iterator lifecycle semantics as direct stream iteration: the underlying stream is destroyed when the loop exits.

#### 4.4.2 Literature Evidence

Node.js documentation notes that `process.stdin.unref()` can be called to prevent the readline interface from keeping the process alive, suggesting that readline-mediated stdin consumption does hold the event loop by default. GitHub issue discussions around readline behaviour consistently identify `rl.close()` followed by `stdin.pause()` as the canonical cleanup sequence, without requiring `destroy()`.

#### 4.4.3 Strengths and Limitations

**Strengths:**
- Natural API for line-oriented protocols (shell-like input, CSV, NDJSON).
- Higher-level abstraction than raw stream events.
- `close` event provides a clean async signal for completion.

**Limitations:**
- Line-buffering is not appropriate for binary or JSON-blob stdin consumption.
- Does not provide a built-in timeout mechanism.
- `rl.close()` does not destroy the underlying stream; additional cleanup may be needed for reliable process exit.
- Async iterator on readline interface inherits the same potential hanging behaviour as direct stream `for await`.
- Cross-version behaviour of `rl.close()` + event loop exit is less predictable than explicit `destroy()`.

---

### 4.5 Approach E: Hybrid (AbortController + Event Listeners)

#### 4.5.1 Theory and Mechanism

A hybrid approach combines the explicit timeout control of Approach C with the AbortController API (introduced in Node.js 15, stabilised in Node.js 16):

```javascript
async function readStdinAbortable(timeoutMs = 30_000, maxBytes = 1_048_576) {
  const ac = new AbortController();
  const { signal } = ac;
  const timerId = setTimeout(
    () => ac.abort(new Error('stdin timed out')),
    timeoutMs
  );

  const { stdin } = process;
  if (stdin.readableEnded || stdin.destroyed) {
    clearTimeout(timerId);
    return '';
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    const abortHandler = () => settle(() => reject(signal.reason));
    signal.addEventListener('abort', abortHandler, { once: true });

    function cleanup() {
      clearTimeout(timerId);
      signal.removeEventListener('abort', abortHandler);
      stdin.removeListener('data', onData);
      stdin.removeListener('end', onEnd);
      stdin.removeListener('error', onError);
      stdin.pause();
      if (!stdin.isTTY && !stdin.destroyed) stdin.destroy();
    }

    function settle(fn) {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    }

    function onData(chunk) {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes)
        return settle(() => reject(new Error('stdin exceeds size limit')));
      chunks.push(chunk);
    }
    function onEnd() {
      settle(() => resolve(Buffer.concat(chunks).toString('utf-8')));
    }
    function onError(err) { settle(() => reject(err)); }

    stdin.on('data', onData);
    stdin.on('end', onEnd);
    stdin.on('error', onError);
    stdin.resume();
  });
}
```

The AbortController separates the timeout signalling concern from the stream-lifecycle concern. The cleanup path is identical to Approach C; the AbortController merely provides a composable cancellation token that other parts of the codebase can observe.

#### 4.5.2 Literature Evidence

AbortController-based cancellation is the direction Node.js has been moving since Node.js 15. The `stream.pipeline()` function accepts an AbortSignal for coordinated teardown, and `stream/promises` APIs expose signal-based cancellation. However, for short-lived CLI tools, the overhead of an AbortController is modest and the benefit — composable cancellation — is often not needed.

#### 4.5.3 Strengths and Limitations

**Strengths:**
- Composable cancellation: the same AbortSignal can be used to cancel other pending operations (HTTP requests, file I/O) in concert with the stdin timeout.
- Aligns with Node.js's evolving API conventions for async cancellation.
- Explicit cleanup path is identical to Approach C, providing the same lifecycle guarantees.

**Limitations:**
- Higher syntactic complexity than Approach C for the common single-consumer case.
- AbortController was not available before Node.js 15; requires a polyfill or version guard for older targets.
- The AbortError thrown by `ac.abort()` must be distinguished from genuine stream errors in catch handlers.

---

## 5. Comparative Synthesis

### 5.1 Lifecycle Trade-off Table

| Criterion | A: Sync | B: `for await` | C: Events | D: readline | E: AbortController |
|---|---|---|---|---|---|
| Activates libuv handle? | No | Yes | Yes | Yes | Yes |
| Auto-cleanup on natural EOF? | N/A | Yes (finally block) | No — explicit required | Partial (pause only) | No — explicit required |
| Handles open-pipe no-EOF? | Yes | No — hangs | Yes, with timeout + destroy | Unreliable | Yes, with abort + destroy |
| TTY-safe cleanup? | N/A | Destroys stream (unsafe for TTY) | Conditional: pause only for TTY | Yes (close only) | Conditional: pause only for TTY |
| Timeout support? | External only | Awkward (AbortController + catch) | Native (setTimeout + cleanup) | Not built-in | Native (AbortController) |
| Throughput (relative) | Highest | ~50% of C | Baseline (1x) | ~1x | ~1x |
| Memory (relative) | Lowest | ~3x higher | 1x | 1x | 1x |
| Code verbosity | Low | Low | High | Medium | High |
| Composable cancellation? | No | Via AbortController (bolted on) | No | No | Yes |
| Min Node.js version | Any | 10+ (stable: 12+) | Any | Any | 15+ |
| Risk of handle leak | None | High if stdin never closes | Low with explicit cleanup | Medium | Low with explicit cleanup |
| Binary / multi-chunk support | Yes (manual loop) | Yes | Yes | No (line-buffered) | Yes |

### 5.2 The `readableFlowing` State vs Handle State Relationship

A persistent source of confusion is that `pause()` and `readableFlowing = false` do not necessarily correspond to `uv_read_stop`:

```
readableFlowing = null   ->  uv_read_start NOT called   ->  active_handles unchanged
readableFlowing = true   ->  uv_read_start HAS been called ->  active_handles++
readableFlowing = false  ->  uv_read_stop MAY have been called (version-dependent)
stdin.destroyed = true   ->  uv_close() called; active_handles-- after close callback
```

The only reliable guarantee is: `destroy()` calls `uv_close()`, which guarantees the handle exits the active state after the close callback fires. All other mechanisms (`pause()`, `removeAllListeners()`) operate at the Node.js stream layer and do not guarantee libuv handle deactivation across all versions.

### 5.3 When `for await` is Safe vs Unsafe

`for await` over stdin is **safe** when:
- stdin is a pipe and the writer (parent process, heredoc, shell pipeline) will close stdin before the reader times out.
- The script does not need to exit until all of stdin is consumed.
- EOF is the natural termination signal.

`for await` over stdin is **unsafe** (risks process hanging) when:
- stdin is open but the writer will not close it (e.g., a parent process that keeps stdin open for a long-lived session).
- The script needs to read only a portion of stdin and then exit.
- Multiple invocations of the same script share a parent process that holds stdin open.
- The process needs to exit promptly after reading, not wait for a 30-second stream timeout.

The compound-agent hook runner falls squarely in the unsafe category: Claude Code keeps stdin open for the session; each hook invocation is a new Node.js process that reads one JSON blob from stdin and must exit immediately.

### 5.4 Cleanup Correctness Matrix

| Operation alone | Pauses stream? | Stops uv_read? | Closes handle? | Sufficient for natural exit? |
|---|---|---|---|---|
| `removeAllListeners()` | No | No | No | No |
| `pause()` | Yes | Sometimes (version-dependent) | No | Sometimes |
| `destroy()` | Yes | Yes | Yes (async via uv_close) | Yes |
| `pause()` + `destroy()` | Yes | Yes | Yes | Yes |
| `push(null)` | No | No | No | No — signals EOF to consumer only |
| `unref()` | No | No | No | Yes — but data may be lost after exit |

`unref()` deserves special mention: calling `process.stdin.unref()` sets the `UV_HANDLE_REF` bit to zero, removing the handle from the loop-alive count. The process will exit even with an active (reading) stdin handle. This is different from `destroy()`: with `unref()`, the handle is still reading — it just no longer prevents exit. Incoming data after exit would be lost. `destroy()` closes the handle; `unref()` merely removes its vote in the exit decision.

---

## 6. Open Problems and Gaps

### 6.1 The `pause()` / `uv_read_stop` Gap

There is no Node.js public API that guarantees `uv_read_stop` is called without also destroying the stream. `pause()` transitions `readableFlowing` to `false` and internally calls `readStop()` on the handle, but this behaviour is conditional and has changed across Node.js versions (issues #8351, #24474, #56677). The only reliable way to guarantee handle deactivation without destroying the stream is to call `stream.unref()`, which removes the handle from loop-alive accounting without halting the read.

This gap means that code relying on `pause()` for process exit may work in some Node.js versions and silently hang in others.

### 6.2 `for await` / `destroyOnReturn: false` Cleanup Contract

When `for await` is used with `destroyOnReturn: false`, the stream is not destroyed on loop exit, but there is no automatic mechanism to call `uv_read_stop`. Callers must manually call `destroy()` or `pause()` after the loop, but the stream's state at that point depends on whether it ended naturally (in which case `readableEnded` is true and the handle is already inactive) or was broken out of early. The Node.js documentation does not specify the handle state after a `break` with `destroyOnReturn: false`.

### 6.3 AbortError Semantics on Early Break

Node.js issue #46717 documents that breaking from a `for await` loop over a stream emits an `AbortError` on the stream. This is semantically incorrect for an intentional early exit, but fixing it risks breaking code that expects the error. As of early 2026, the issue remains open. The workaround of `destroyOnReturn: false` plus manual cleanup avoids the error but requires additional code.

### 6.4 Windows Pipe vs POSIX Pipe Asymmetry

The Windows implementation of pipe-based stdin in libuv uses IOCP rather than epoll/kqueue. The blocking behaviour of `fs.readSync` on a Windows pipe returns `EAGAIN` in some Node.js versions (issue #35997), requiring retry loops. The `for await` and event-listener approaches are not affected because they use the IOCP-based read callbacks. However, synchronous stdin reading (Approach A) is less portable.

### 6.5 Process Introspection API Stability

`process._getActiveHandles()` is the only runtime API for inspecting what is keeping the event loop alive. It is prefixed with `_` indicating internal/unstable status. Tools like `why-is-node-running` and `wtfnode` depend on it. There is no stable public equivalent, and no accepted Node.js enhancement proposal for stabilising it as of this writing. Diagnostic capabilities for production environments therefore rely on an unsupported internal.

### 6.6 The Heredoc Edge Case

When stdin is a heredoc (e.g., `node script.js <<EOF\n...\nEOF`), the shell creates a temporary file and presents it as a regular file on file descriptor 0. In this case `process.stdin` is an `fs.ReadStream` (not a `net.Socket`), `isTTY` is undefined (falsy, same as a pipe), and EOF is delivered cleanly when the file ends. All approaches behave correctly for heredoc stdin; the hanging problem is specific to anonymous pipe stdin where the writing end is not closed.

### 6.7 Worker Thread stdin Cleanup

Worker threads in Node.js have their own stdin, which may share the underlying file descriptor with the parent. The `kStartedReading` flag discussed in PR #28153 addresses the ref/unref asymmetry for worker stdin, but the interaction between worker thread stdin cleanup and the worker's event loop exit remains underspecified. Calling `destroy()` on worker stdin when the worker is still running may prematurely close the shared file descriptor.

---

## 7. Conclusion

The hanging-process problem encountered in the compound-agent hook runner is a precise consequence of three interacting mechanisms:

1. **libuv's active-handle counter**: `uv_read_start` increments `active_handles`; the event loop does not exit while this counter is positive.

2. **`for await` lifecycle**: The async generator implementing the readable iterator holds the stream alive until the generator's `finally` block executes, which does not happen until the loop exits or the stream emits `end`. An open pipe where the writer holds the writing end open satisfies neither condition.

3. **`process.stdin` pipe semantics**: Claude Code holds stdin open for the session. Each hook invocation is a short-lived Node.js process reading one JSON blob, but the parent-held writing end prevents the stream from emitting `end`, so the iterator never terminates.

The fix — switching to event listeners with explicit `pause()` / `removeAllListeners()` / conditional `destroy()` — correctly terminates the libuv handle because `destroy()` calls `uv_close()` regardless of whether the writing end of the pipe is open.

The broader design landscape reveals no single universally correct approach. Synchronous reading (Approach A) offers the simplest lifecycle but cannot implement timeouts or support concurrent work. Event listeners (Approach C) offer the most control but require careful cleanup. The async iterator (Approach B) is ergonomically appealing and safe for fully-closed pipes, but dangerous for long-lived session contexts. readline (Approach D) is appropriate for line-oriented protocols but insufficient for JSON blob consumption. AbortController (Approach E) is the most future-proof and composable but the most verbose.

Practitioners choosing among these approaches should centre the decision on two questions: (1) will stdin EOF arrive before any relevant timeout? and (2) is this a TTY context where `destroy()` is unsafe? The answers partition the design space into the cleanup strategies documented in the Comparative Synthesis section.

---

## References

1. libuv project. *Design overview — libuv documentation*. <https://docs.libuv.org/en/v1.x/design.html>

2. libuv project. *Basics of libuv — libuv documentation*. <https://docs.libuv.org/en/v1.x/guide/basics.html>

3. libuv project. *uv_handle_t — Base handle*. <https://docs.libuv.org/en/v1.x/handle.html>

4. libuv project. *uv_stream_t — Stream handle*. <https://docs.libuv.org/en/v1.x/stream.html>

5. libuv project. *Source: `src/uv-common.h`* (handle flag definitions, `uv__handle_start`, `uv__handle_stop` macros). <https://github.com/libuv/libuv/blob/v1.x/src/uv-common.h>

6. libuv project. *Source: `src/unix/stream.c`* (`uv_read_start`, `uv_read_stop` implementations). <https://github.com/libuv/libuv/blob/v1.x/src/unix/stream.c>

7. libuv project. *Source: `include/uv.h`* (public API declarations). <https://github.com/libuv/libuv/blob/v1.x/include/uv.h>

8. Node.js project. *The Node.js Event Loop, Timers, and process.nextTick()*. <https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick>

9. Node.js project. *Stream API documentation — Node.js v25.8.1*. <https://nodejs.org/api/stream.html>

10. Node.js project. *Process API documentation — Node.js v25.8.1*. <https://nodejs.org/api/process.html>

11. Node.js project. *TTY API documentation — Node.js v25.8.1*. <https://nodejs.org/api/tty.html>

12. Node.js issue #22044. *Async iterator on process.stdin not working correctly*. Anna Henningsen. 2018. <https://github.com/nodejs/node/issues/22044>

13. Node.js issue #20503. *process.stdin example from docs no longer works in node 10*. 2018. <https://github.com/nodejs/node/issues/20503>

14. Node.js issue #31979. *Performance of for await of (async iteration)*. 2020. <https://github.com/nodejs/node/issues/31979>

15. Node.js issue #32291. *Piping process.stdin to child.stdin leaves behind an open handle*. 2020. <https://github.com/nodejs/node/issues/32291>

16. Node.js issue #46717. *Using for await...of with break to read from a stream*. 2023. <https://github.com/nodejs/node/issues/46717>

17. Node.js issue #8373. *PipeWrap-s do not ref correctly and are never "truely" unrefed*. 2016. <https://github.com/nodejs/node/issues/8373>

18. Node.js PR #28153. *worker: only unref port for stdin if we ref'ed it before* (addaleax). 2019. <https://github.com/nodejs/node/pull/28153>

19. Node.js PR #7360. *tty: add ref() so process.stdin.ref() etc. work* (insightfuls). 2016. <https://github.com/nodejs/node/pull/7360>

20. Node.js commit `c8fe8e8f5d`. *process: create stdin with `manualStart: true`* (addaleax). 2018. <https://github.com/nodejs/node/commit/c8fe8e8f5d>

21. Node.js commit `4bb40078da`. *stream: simpler and faster Readable async iterator*. <https://github.com/nodejs/node/commit/4bb40078da>

22. Node.js commit `61415dccc4`. *lib: defer pausing stdin to the next tick*. <https://github.com/nodejs/node/commit/61415dccc4>

23. Inquirer.js issue #1358. *'process.stdin' in nodejs is not working properly*. <https://github.com/SBoudrias/Inquirer.js/issues/1358>

24. Inquirer.js issue #753. *When calling a node script with inquirer from bash, process immediately exits*. <https://github.com/SBoudrias/Inquirer.js/issues/753>

25. sindresorhus/get-stdin issue #13. *When executable is spawned from node if there is no stdin getStdin() never resolves*. <https://github.com/sindresorhus/get-stdin/issues/13>

26. mafintosh/why-is-node-running. *Node is running but you don't know why?* <https://github.com/mafintosh/why-is-node-running>

27. alessioalex/wtfnode. *Utility to help find out why Node isn't exiting*. <https://github.com/alessioalex/wtfnode>

28. Coedo, Roman. *Detecting Node.js active handles with wtfnode*. Trabe / Medium. 2019. <https://medium.com/trabe/detecting-node-js-active-handles-with-wtfnode-704e91f2b120>

29. Rauschmayer, Axel. *Easier Node.js streams via async iteration*. 2ality. 2019. <https://2ality.com/2019/11/nodejs-streams-async-iteration.html>

30. Rauschmayer, Axel. *Reading streams via async iteration in Node.js*. 2ality. 2018. <https://2ality.com/2018/04/async-iter-nodejs.html>

31. RisingStack. *About Async Iterators in Node.js*. <https://blog.risingstack.com/async-iterators-in-node-js/>

32. iximiuz. *Node.js Readable streams distilled*. <https://iximiuz.com/en/posts/nodejs-readable-streams-distilled/>

33. Node.js issue #47303. *No example of how to use tty when process.stdin.isTTY is false*. 2023. <https://github.com/nodejs/node/issues/47303>

34. Node.js issue #24474. *stream: adding new 'data' handler doesn't resume stream after removing 'readable' handler*. 2018. <https://github.com/nodejs/node/issues/24474>

35. Anthropic. *Hooks reference — Claude Code documentation*. 2026. <https://code.claude.com/docs/en/hooks>

36. Node.js project. *Overview of Blocking vs Non-Blocking*. <https://nodejs.org/en/docs/guides/blocking-vs-non-blocking>

37. LogRocket. *Using stdout, stdin, and stderr in Node.js*. <https://blog.logrocket.com/using-stdout-stdin-stderr-node-js/>

38. Linnell, Jon. *How to pipe data into a Node.js script*. <https://jonlinnell.co.uk/articles/node-stdin>

---

## Practitioner Resources

### Diagnostic Snippet: Identifying Open Handles

```javascript
// Run at the point where you suspect hanging:
console.error('Active handles:',
  process._getActiveHandles().map(h => h.constructor.name));
console.error('Active requests:',
  process._getActiveRequests().map(r => r.constructor.name));
```

Or install `why-is-node-running` and add at entry point:

```javascript
import whyIsNodeRunning from 'why-is-node-running';
// Dump after 5s if still running:
setTimeout(whyIsNodeRunning, 5000).unref();
```

### Decision Tree for stdin Cleanup

```
Is stdin a TTY (isTTY === true)?
  YES -> call pause() only. Do NOT call destroy().
         Process exits via process.exit() or signal.
  NO  (pipe, file, non-TTY):
    Did stdin reach natural EOF?
      YES -> stream may already be inactive. Verify with readableEnded.
      NO  (open pipe, no EOF received):
        Call: removeListeners() -> pause() -> destroy()
        (pause first to drain any buffered events before destroy)

    Need to re-use stdin after partial read?
      Consider unref() instead of destroy() to allow exit
      without closing the file descriptor.
      WARNING: any data arriving after process exit is lost.
```

### Minimal Correct Hook-Runner Pattern (Production Implementation)

```typescript
// The compound-agent production implementation.
// Uses event listeners (NOT for await) so the stream can be properly
// cleaned up on timeout, size-limit breach, or completion. This prevents
// the Node event loop from being held open by a dangling async iterator.

export async function readStdin(
  options: { timeoutMs?: number; maxBytes?: number } = {}
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxBytes  = options.maxBytes  ?? 1_048_576;
  const { stdin }  = process;

  // Fast path: if stdin is already closed/destroyed, return empty immediately.
  if (stdin.readableEnded || stdin.destroyed) return '';

  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled    = false;

    function cleanup(): void {
      clearTimeout(timerId);
      stdin.removeListener('data',  onData);
      stdin.removeListener('end',   onEnd);
      stdin.removeListener('error', onError);
      // pause() stops further data events from delivering buffered chunks.
      stdin.pause();
      // destroy() closes the underlying libuv handle (uv_close), allowing
      // the event loop to drain. Skip on TTY: destroying a TTY stdin would
      // close fd 0 and kill the terminal in the parent process.
      if (!stdin.isTTY && !stdin.destroyed) stdin.destroy();
    }

    function settle(fn: () => void): void {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    }

    function onData(chunk: Buffer): void {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        settle(() => reject(new Error(`stdin exceeds ${maxBytes} byte limit`)));
        return;
      }
      chunks.push(chunk);
    }
    function onEnd():             { settle(() => resolve(Buffer.concat(chunks).toString('utf-8'))); }
    function onError(err: Error): { settle(() => reject(err)); }

    const timerId = setTimeout(
      () => settle(() => reject(new Error('stdin read timed out'))),
      timeoutMs
    );

    stdin.on('data',  onData);
    stdin.on('end',   onEnd);
    stdin.on('error', onError);
    stdin.resume();  // uv_read_start -> active_handles++
  });
}
```

### Key libuv Invariants

1. `uv_read_start` sets `UV_HANDLE_ACTIVE` and increments `active_handles`. The loop is alive.
2. `uv_read_stop` (called by `pause()` in some versions) clears `UV_HANDLE_ACTIVE` and decrements `active_handles`.
3. `uv_close` (called by `destroy()`) sets `UV_HANDLE_CLOSING`. After the close callback: `UV_HANDLE_CLOSED` is set and `active_handles` is decremented. This is the guaranteed path.
4. `uv_unref` clears `UV_HANDLE_REF`. The handle no longer contributes to loop-alive even if still active. The process can exit while the handle is still reading.
5. `uv_ref` / `uv_unref` are **idempotent bit-set operations**, not reference counters. Two `ref` calls are balanced by one `unref`.
6. A loop exits when: `active_handles == 0 && active_reqs == 0 && closing_handles == NULL`.
7. `for await` over an open-ended readable stream holds `active_handles` elevated until the stream emits `end` or an explicit `destroy()` is called.
8. `removeAllListeners()` does not pause the stream and does not call `uv_read_stop`. It is insufficient for process exit.
