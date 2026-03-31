# Root Causes

Five distinct root causes contribute to the memory pressure. They are listed in
order of impact.

---

## 1. Native module duplication across worker threads

**Impact**: ~200-300 MB of unnecessary RSS
**Where**: `vitest.workspace.ts:26-29` (unit test pool config)

Vitest's `pool: 'threads'` uses Node.js `worker_threads`. Each thread loads its
own copy of native addon binaries. With `maxThreads: 4`:

- `better-sqlite3` is loaded 4 times (imported by 8 source files, transitively
  reached by most unit tests)
- Each copy allocates separate native heap
- The full application dependency graph is duplicated per thread

This is why unit tests alone (no embedding model) peak at **572 MB**.

**Code path**: Most unit tests import application modules that transitively
import `src/memory/storage/sqlite/connection.ts`, which imports `better-sqlite3`.

---

## 2. Embedding model is 2x larger than documented

**Impact**: 340 MB RSS per load (documented as 150 MB)
**Where**: Comments in `src/memory/embeddings/model.ts:68`, `nomic.ts:9`,
`test-utils.ts:311`

Every comment and doc in the codebase says the model costs ~150 MB. Empirical
measurement shows **340 MB RSS**. This means:

- Memory budgets are wrong by 2x
- The "safe" singleFork isolation for embedding tests still uses 2x expected memory
- Any process that loads the model (CLI commands, background workers) is heavier
  than assumed

---

## 3. Module-level `isModelUsable()` calls violate safety rules

**Impact**: 340 MB loaded + 110 MB leaked permanently
**Where**:
- `src/memory/embeddings/model.test.ts:24`
- `src/memory/embeddings/nomic.test.ts:17`

Both files call `isModelUsable()` at module top-level for test skip-gating:

```typescript
// model.test.ts:23-24
const modelAvailable = isModelAvailable();
const modelUsability = modelAvailable ? await isModelUsable() : { usable: false as const };
```

This directly violates the documented safety rules in:
- `model.ts:68-72`: "WARNING: This function allocates ~150MB of native C++
  memory for the probe. NEVER call at module top-level in test files."
- `test-utils.ts:311-312`: "NEVER call isModelUsable() at module top-level --
  it loads ~150MB of native memory that leaks when vitest workers SIGABRT
  during disposal."

**What happens**: During the collection phase, vitest imports these test files
to discover test cases. The module-level `await isModelUsable()` loads the full
model (340 MB), runs a probe, then disposes. But dispose leaks ~96 MB. When the
actual tests run and load the model again, another ~14 MB leaks. Total permanent
leak: ~110 MB.

**Fix**: Replace `isModelUsable()` with `isModelAvailable()` (zero native
allocation, `fs.existsSync` only). The `shouldSkipEmbeddingTests()` helper
already supports this -- its second parameter defaults to `modelAvailable`.

---

## 4. `unloadEmbedding()` is fire-and-forget (async not awaited)

**Impact**: Potential 340 MB leak on worker exit
**Where**: `src/memory/embeddings/nomic.ts:168-170`

```typescript
export function unloadEmbedding(): void {
  void unloadEmbeddingResources();  // async, not awaited
}
```

The `afterAll()` in `nomic.test.ts:21-23` calls this synchronous wrapper:

```typescript
afterAll(() => {
  unloadEmbedding();  // fires async dispose, doesn't wait
});
```

If the vitest worker exits before the async dispose completes, the native
resources (340 MB) are abandoned. The `dispose()` call in the C++ backend may
SIGABRT when the process is already tearing down, preventing any memory from
being reclaimed.

**Fix**: Use `afterAll(async () => { await unloadEmbeddingResources(); })`.

---

## 5. Integration tests spawn heavyweight Node processes

**Impact**: ~37 MB baseline + imports per test invocation
**Where**: `src/test-utils.ts:397-417` (`runCli()` function)

Each integration test calls `execFileSync('node', [cliPath, ...args])`, spawning
a full Node.js process. With 16 integration test files (running sequentially via
`maxForks: 1`), this creates and destroys 50+ Node processes over the test run.

Each spawned process:
- Boots Node.js (~37 MB baseline)
- Imports the full CLI application
- Loads `better-sqlite3` native addon
- Creates an in-memory SQLite database
- Runs the command
- Exits (releasing memory)

While sequential execution prevents concurrent memory spikes, the constant
process creation/destruction adds significant wall-clock time (~100s for
integration tests) and OS-level memory churn.

**This is the least impactful root cause** because processes run one at a time
and release memory on exit. It primarily affects test duration, not peak memory.
