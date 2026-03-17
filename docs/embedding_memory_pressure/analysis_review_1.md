# Analysis Review — Embedding & Test Memory Pressure

> **Date**: 2026-03-17
> **Reviewer**: Independent code review
> **Scope**: Verification of all claims in `measurements.md`, `root-causes.md`, and `proposals.md`
> **Method**: Direct source code inspection, grep-based dependency tracing, filesystem verification

---

## Verdict Summary

The analysis is broadly correct in its measurements and is directionally sound in its
proposals. However, it contains several inaccuracies, one significant misattribution, a
critical omission in Root Cause 1, and two proposals (I and J) that mischaracterize the
current architecture. These gaps could lead to solving the wrong thing first. This
document enumerates every issue found.

---

## Part 1 — What the Analysis Gets Right

### Measurement claims (confirmed)

| Claim | Verdict |
|-------|---------|
| Model file "~278 MB" | **Confirmed** — `~/.node-llama-cpp/models/hf_ggml-org_embeddinggemma-300M-qat-Q4_0.gguf` is exactly 277,852,192 bytes (265 MiB / 278 MB SI) |
| RSS delta "~340 MB" for loading | **Plausible** — a 278 MB model plus C++ runtime buffers accounts for ~340 MB RSS |
| `isModelUsable()` in `model.test.ts:24` | **Confirmed** — `const modelUsability = modelAvailable ? await isModelUsable() : ...` at module top-level |
| `isModelUsable()` in `nomic.test.ts:17` | **Confirmed** — same pattern, same line structure |
| `afterAll(() => { unloadEmbedding(); })` is fire-and-forget | **Confirmed** — `unloadEmbedding()` calls `void unloadEmbeddingResources()` synchronously |
| Unit test pool: `threads`, `minThreads: 2, maxThreads: 4` | **Confirmed** — `vitest.workspace.ts:26-29` |
| Embedding pool: `forks`, `singleFork: true` | **Confirmed** — `vitest.workspace.ts:58-59` |
| `better-sqlite3` binary is ~1.8 MB | **Confirmed** — `node_modules/better-sqlite3/build/Release/better_sqlite3.node` is 1,919,040 bytes |
| `nomic.ts` documents model as "~150 MB" | **Confirmed** — multiple docstrings use this figure |
| `model.ts:68-72` has a "NEVER call at module top-level" warning | **Confirmed** — the warning is present and explicit |
| The test suite has 116 unit files, 16 integration files, 6 embedding files | **Confirmed** |

---

## Part 2 — Issues Found

### Issue 1 (Critical) — Root Cause 1 misidentifies the memory amplifier

**The analysis says**: "better-sqlite3 is loaded in 8 source files, each thread gets its
own copy."

**What the code actually shows**: `better-sqlite3` is directly imported by **11** source
files (not 8), but this count is not what drives memory pressure. The real amplifier is
`src/test-utils.ts`.

`test-utils.ts` imports:
```typescript
import { closeDb } from './memory/storage/sqlite/index.js';
```

This pulls in the full SQLite module chain:
`test-utils.ts → sqlite/index.ts → connection.ts → availability.ts → require('better-sqlite3')`

And **52 out of ~116 unit test files** import from `test-utils.ts`. This means nearly
half the test suite carries `better-sqlite3` through a single shared import vector,
completely independent of whether the test itself touches a database.

The analysis describes the mechanism ("native module duplication per thread") correctly
but attributes it to 8 production source files. The actual root is a single test utility
module acting as a universal bridge. This distinction matters for the fix: **Proposal F
(lazy imports) should target `test-utils.ts` first**, not the production connection
modules.

Note: the `require('better-sqlite3')` call inside `availability.ts` is inside
`ensureSqliteAvailable()` (lazy, not at module load time), so simply importing the chain
does not eagerly load the native binary. But any test that calls `openDb()` or `closeDb()`
will trigger the load — which covers most of the 52 test files that import test-utils.ts.

---

### Issue 2 (Significant) — Root Cause 3 is scoped to the wrong pool

**The analysis says**: "During the collection phase, vitest imports these test files to
discover test cases. The module-level `await isModelUsable()` loads the full model (340
MB)..."

This is stated in a section discussing unit test memory pressure (572 MB peak), which
implies the embedding probe affects the unit pool. It does not.

The unit project config is:
```typescript
exclude: ['src/memory/embeddings/**/*.test.ts', ...integrationFiles],
```

`model.test.ts` and `nomic.test.ts` are **explicitly excluded** from the unit pool. They
only run in the **embedding pool** (singleFork). These two issues — the 572 MB unit test
peak and the 110 MB embedding probe leak — are **caused by different mechanisms in
different processes**.

The analysis is not technically wrong (the leak happens; the probe is real) but the
presentation conflates two separate issues that affect two separate process groups. This
could cause someone to think fixing the embedding probe will reduce unit test RSS, which
it will not.

---

### Issue 3 (Significant) — The double-probe mechanism is misidentified

**The analysis says**: "Two cycles leave 110 MB that can never be reclaimed within the
process."

The analysis attributes this to both test files independently calling `isModelUsable()`.
The actual mechanism is more specific: `model.test.ts` calls `clearUsabilityCache()` **at
module top-level** (line 28), not inside a test:

```typescript
// model.test.ts
const modelAvailable = isModelAvailable();
const modelUsability = modelAvailable ? await isModelUsable() : { usable: false as const };
const skipEmbedding = shouldSkipEmbeddingTests(modelAvailable, modelUsability.usable);

// Keep tests isolated from module-level probe above.
clearUsabilityCache();   // <-- THIS IS THE PROBLEM
```

Without this `clearUsabilityCache()` call, `nomic.test.ts`'s module-level `isModelUsable()`
call would be a **cache hit** (zero native allocation) because both files share the same
`model.ts` module instance in the singleFork process. The double-load cycle happens
specifically because the cache-busting `clearUsabilityCache()` runs during module
evaluation, before `nomic.test.ts` is imported.

This means a **minimal fix** exists that the proposals don't mention: move
`clearUsabilityCache()` from module top-level to `afterEach()` (where it already runs
inside the `isModelUsable` describe block). This preserves test isolation while preventing
the double load. Removing the module-level `isModelUsable()` call entirely (Proposal A)
remains the right fix, but understanding the mechanism clarifies why the problem exists.

---

### Issue 4 (Significant) — Concurrent disposal is a bug, not noted in the analysis

Root Cause 4 correctly flags `unloadEmbedding()` as fire-and-forget. The proposed fix is
to `await unloadEmbeddingResources()`. However, the analysis does not examine how
`unloadEmbeddingResources()` itself performs disposal:

```typescript
// nomic.ts:110-124 — current implementation
const disposals: Promise<unknown>[] = [];
if (context) { disposals.push(context.dispose()); }
if (model)   { disposals.push(model.dispose()); }
if (llama)   { disposals.push(llama.dispose()); }
if (disposals.length > 0) { await Promise.allSettled(disposals); }
```

**Context, model, and llama are disposed concurrently**. These are inter-dependent C++
objects with reference semantics: the context has a pointer into the model, and the model
has a pointer into the llama instance. Disposing them out-of-order (or simultaneously)
is undefined behavior for the C++ backend.

Compare with `isModelUsable()` in `model.ts:125-135`, which disposes **sequentially**:

```typescript
// model.ts — sequential disposal (correct)
if (context) { try { await context.dispose(); } catch { } }
if (model)   { try { await model.dispose(); } catch { } }
if (llama)   { try { await llama.dispose(); } catch { } }
```

The `Promise.allSettled` pattern in `unloadEmbeddingResources()` is potentially the
source of the `SIGABRT` mentioned in the analysis. Proposal B proposes awaiting the
existing function — but the function itself has this ordering bug. Just awaiting it is
insufficient; the disposal order must also be fixed.

---

### Issue 5 (Moderate) — Proposal A has an unacknowledged semantic change

**The analysis says**: Proposal A has "Risk: None."

`isModelUsable()` goes beyond file existence: it attempts to load the llama runtime, load
the model, and create an embedding context. It is the only check that detects runtime
incompatibility (e.g., Metal backend failure, CUDA unavailable, incompatible hardware).

`isModelAvailable()` is purely `fs.existsSync`.

Replacing `isModelUsable()` with `isModelAvailable()` as the skip gate means that on a
machine where the model file exists but the native backend fails to initialize, tests that
currently skip will instead **run and fail**. For example, `model.test.ts:96-99`:

```typescript
it.skipIf(skipEmbedding)('returns usable=true when model can initialize', async () => {
  const result = await isModelUsable();
  expect(result.usable).toBe(true);  // Will fail on incompatible hardware
});
```

This is not "no risk." It transforms skip into failure on any machine where the model
file exists but the native environment is broken. The risk is "flaky tests on certain CI
nodes or developer machines," not catastrophic — but it should be called out.

---

### Issue 6 (Moderate) — Proposals I and J mischaracterize the current architecture

**The analysis says**: Proposal J describes a "pre-computed + SQLite vector" approach
where "The model is only loaded during `ca learn`, never during `ca search`."

The **current architecture already stores embeddings** in SQLite:

```typescript
// schema.ts:36-38
embedding BLOB,
content_hash TEXT,
embedding_insight BLOB,
```

And `searchVector` in `vector.ts` already uses the bulk embedding cache:
```typescript
const cachedEmbeddings = getCachedEmbeddingsBulk(repoRoot);
// ... uses cached.vector for items, recomputes only on cache miss
```

Item embeddings are **already pre-computed and cached**. The model is loaded on every
`ca search` invocation not to embed items but to embed the **query itself**:

```typescript
// vector.ts:116
const queryVector = await embedText(query);  // Model load happens here
```

There is no way to avoid embedding the query at search time without one of:
1. A lighter runtime (Proposal I, relevant)
2. A sidecar HTTP service (Proposal H, relevant)
3. Dropping semantic search for pure FTS5 fallback (regression)
4. Pre-computing and storing query vectors (impractical for arbitrary queries)

Proposals I and J as framed in the document would not achieve the stated goal. The
"model only loaded during ca learn" description is simply wrong. Item-level pre-computation
is already in place. The proposals are valid suggestions but need to be reframed:
the goal is a **lighter embedding runtime**, not a different caching strategy.

---

### Issue 7 (Minor) — The "8 source files" count is wrong

**The analysis says**: "better-sqlite3 is loaded in 8 source files."

A direct grep of `import.*better-sqlite3|require.*better-sqlite3` across `src/` finds
**11 files** (including both `connection.ts` and `sqlite-knowledge/connection.ts`,
`availability.ts`, `schema.ts` in both SQLite modules, `sync.ts`, `cache.ts`, `index.ts`,
`doctor.ts`, `cli-preflight.ts`, and both knowledge cache files). The count is
consistently wrong throughout the analysis.

---

### Issue 8 (Minor) — Measurement environment mismatch not disclosed

The measurements header says: "Node.js v22.16.0."

The current development environment runs **Node.js v25.2.1** (verified via `node
--version`). That is a two-major-version gap. V8 garbage collector behavior, worker
thread module isolation implementation, and memory accounting details differ between
these versions. The measurements may not reproduce exactly in the current environment.
This does not invalidate the findings, but it should be noted before any benchmarks are
used to size proposed fixes.

---

### Issue 9 (Minor) — RSS measurement nuance for mmap'd model on Apple Silicon

The measurements are taken on macOS ARM64 (Apple Silicon). Two factors affect RSS
interpretation:

**Memory-mapped GGUF files.** node-llama-cpp loads GGUF model files via `mmap()` rather
than `read()`. macOS RSS includes mmap-resident pages. When `dispose()` is called and
the mmap region is un-mapped, the OS reclaims those pages — but only if the kernel evicts
them. Pages that remain in the page cache (not yet reclaimed) still appear in RSS as a
"leak." The ~96 MB "permanent leak" may actually be unreleased mmap pages that the OS
will reclaim under memory pressure. This is not measurable via `process.memoryUsage()`.

**Metal GPU acceleration.** `getLlama()` is called without `gpu: false`, so node-llama-cpp
auto-detects Metal on Apple Silicon. On Apple Silicon, GPU and CPU share the same physical
RAM (unified memory architecture). Metal-managed buffers appear in the process's RSS.
This adds an unknown amount to the 340 MB figure that would not appear on Intel/Linux
machines. The analysis makes no mention of GPU involvement in the measurements.

These do not invalidate the conclusion that the model is expensive — but the specific
numbers (340 MB, ~96 MB leak) should be treated as macOS ARM64 + Metal upper bounds, not
universal figures.

---

## Part 3 — Proposal Assessment

### Tier 1 Quick Fixes

**Proposal A (fix `isModelUsable()` violations)**

Correct direction. The minimal fix is actually to remove only the
module-level `await isModelUsable()` from both files and rely solely on `isModelAvailable()`
for skip-gating, which is what `shouldSkipEmbeddingTests` is designed to accept as its
only argument. The semantic change (Issue 5 above) is real but tolerable — developers
on incompatible hardware would see test failures rather than skips, which is visible
and fixable. Acknowledge the trade-off rather than labeling it "no risk."

Also: `clearUsabilityCache()` in `model.test.ts` must be kept or moved to `beforeEach`
(not removed) to preserve test isolation inside the `isModelUsable` describe block.

**Proposal B (await cleanup)**

Correct direction, but **incomplete as stated**. Awaiting `unloadEmbeddingResources()`
is necessary but not sufficient. The concurrent disposal ordering bug (Issue 4) must
also be addressed. The actual fix requires both:
1. `afterAll(async () => { await unloadEmbeddingResources(); })`
2. Changing `unloadEmbeddingResources()` to dispose sequentially (context → model → llama)

**Proposal C (update docs)**

Straightforward and valuable. Note: `model.ts` already has a correct file size comment
("Size: ~278MB") — only the runtime RAM comments ("~150MB") are wrong.

**Proposal D (reduce maxThreads 4 → 2)**

Valid. Note that with vitest's `isolate: true`, each test file creates its own module
context within a thread, so the per-thread cost is the cost of running all the test files
scheduled to that thread. Reducing threads from 4 to 2 should roughly halve the peak
RSS, at the cost of longer test runs. The I/O-bound caveat in the analysis is correct
(SQLite is heavily I/O-bound, so 2 threads at 70% efficiency ≈ 4 threads at 35%
efficiency in terms of wall time).

---

### Tier 2 Architecture Changes

**Proposal E (threads → forks for unit tests)**

Valid. With `forks`, each file runs in an independent OS process, and the OS reclaims
RSS when the fork exits. The peak at any one moment is a single fork's cost, not all
forks combined. The main risk is throughput: fork startup is ~50-100ms per file vs
thread startup of ~10ms. For 116 files this adds 4-8s wall time at `maxForks: 2`.

**Proposal F (lazy imports)**

Correct direction but target is wrong. Given that `test-utils.ts` is the key vector
(Issue 1), the most impactful change is to **split test-utils.ts**:
- Pure utilities (`createLesson`, `shouldSkipEmbeddingTests`) → `test-utils-pure.ts`
- SQLite-dependent utilities (`cleanupCliTestDir`, `runCli`, etc.) → remain in `test-utils.ts`

Tests that only use pure fixtures would import `test-utils-pure.ts` and never touch
better-sqlite3. This is a smaller change than refactoring the full production import
graph and targets the actual bottleneck.

The production import lazification (converting `import Database from 'better-sqlite3'`
to dynamic `import()`) is a 1-2 week effort as estimated, and worthwhile, but the
test-utils.ts split delivers similar benefit in the test context in under a day.

**Proposal G (pure/native test suite split)**

Valid but estimates are optimistic ("30-40% of tests could run pure"). The estimate does
not account for the test-utils.ts amplification: even tests in "pure" directories
(`src/setup/templates/`, `src/rules/`) import from test-utils.ts, which carries the
SQLite chain. The percentage of truly-pure tests depends on whether they use any
test-utils.ts imports that trigger better-sqlite3 loading. A quick audit is needed before
committing to this effort.

---

### Tier 3 Embedding Architecture

**Proposal H (HTTP embedding service)**

Valid and architecturally clean. The main risk is not latency but operational complexity:
a CLI tool that requires a background service running is a non-trivial developer
experience change. The test mocking story is correct (mock the HTTP client, no native
modules in tests). This is the right option if Tier 1/2 don't reduce memory
sufficiently.

**Proposal I (lighter runtime)**

The Transformers.js ("~100-150 MB, pure WASM") estimate is optimistic. A 278 MB model
file in any format will not become 100 MB at runtime. The memory saving with Transformers.js
comes from avoiding the llama.cpp C++ runtime overhead (~30 MB) and potentially from
better mmap/WASM page management, not from compressing the model weights. Expect 200-250
MB for an equivalent-quality WASM-based model.

The pre-computed embedding angle in this proposal needs to be reframed: the model is
still needed at `ca search` time to embed the **query** (Issue 6). A lighter runtime
reduces the cost of that query embedding, not eliminates it.

**Proposal J (pre-computed + SQLite-vec)**

Needs significant reframing (Issue 6). Item embeddings are already stored in SQLite.
`sqlite-vec` would enable SQL-side vector arithmetic (ANN search), which avoids the full
cosine similarity loop in JavaScript. This is a legitimate performance win for large
lesson sets but is **not about eliminating model loading**. The model still loads to
embed the query. Reframe as: "use sqlite-vec for faster item-side vector matching" rather
than "eliminate embedding at search time."

---

### Tier 4 (Language migration)

The analysis here is accurate in trade-offs. No new issues to raise. These are long-term
options, not a near-term fix.

---

## Part 4 — Recommended Priorities (Revised)

The analysis's recommended sequence is reasonable. With the corrections above, the
revised priority order is:

### Immediate (hours)

1. **Fix Proposal B first**, not A. The `afterAll` async issue is pure upside with no
   semantic change and directly prevents 340 MB from being permanently abandoned on
   worker exit. Also fix the concurrent disposal ordering in `unloadEmbeddingResources()`
   while touching that code.

2. **Fix Proposal A** (remove module-level `isModelUsable()` from model.test.ts and
   nomic.test.ts). Document the semantic change (runtime-fail machines will get test
   failures, not skips). Verify that `clearUsabilityCache()` remains in `afterEach`.

3. **Fix Proposal C** (update "~150MB" to "~340MB" in nomic.ts, the `unloadEmbedding`
   docstring, and test-utils.ts). Keep the existing "~278MB disk size" in model.ts
   (already correct).

### Short-term (days)

4. **Proposal D** (maxThreads 4 → 2) if memory pressure is critical and test time
   regression is acceptable.

5. **Split test-utils.ts** into a pure/SQLite variant pair (faster and more targeted than
   the full Proposal F). This addresses the actual amplifier for unit test memory.

### Medium-term (weeks)

6. **Proposal I** with realistic expectations: a lighter runtime (Transformers.js or
   ONNX) reduces the per-query load cost, not eliminates model loading. Benchmark actual
   memory with the real model size, not the optimistic 80-120 MB estimate.

7. **Proposal J** reframed as "sqlite-vec for item-side ANN search" once item counts
   grow large enough to make the JS cosine loop a bottleneck.

### Before any measurement-driven decision

Re-run the measurements on the current Node.js version (v25.2.1) to get accurate baseline
numbers. The measurements in `measurements.md` were taken on v22.16.0.

---

## Appendix — Code Locations Verified

| Claim | File:Line | Status |
|-------|-----------|--------|
| `isModelUsable()` at module top-level | `model.test.ts:24` | ✓ Confirmed |
| `isModelUsable()` at module top-level | `nomic.test.ts:17` | ✓ Confirmed |
| `clearUsabilityCache()` at module top-level | `model.test.ts:28` | ✓ Confirmed (not noted in analysis) |
| `afterAll(() => { unloadEmbedding(); })` | `nomic.test.ts:21-23` | ✓ Confirmed |
| `void unloadEmbeddingResources()` | `nomic.ts:169` | ✓ Confirmed |
| Concurrent `Promise.allSettled` disposal | `nomic.ts:110-124` | ✓ Confirmed (not in analysis) |
| Sequential disposal in `isModelUsable` | `model.ts:125-135` | ✓ Confirmed (inconsistency noted) |
| `embedding BLOB` column in schema | `schema.ts:36` | ✓ Confirmed (contradicts I/J framing) |
| `getCachedEmbeddingsBulk` in search path | `vector.ts:119` | ✓ Confirmed |
| `embedText(query)` always called in search | `vector.ts:116` | ✓ Confirmed |
| test-utils.ts imports `closeDb` | `test-utils.ts:17` | ✓ Confirmed |
| 52 test files import from test-utils.ts | grep count | ✓ Confirmed |
| `maxThreads: 4` in vitest workspace | `vitest.workspace.ts:28` | ✓ Confirmed |
| embedding pool excluded from unit pool | `vitest.workspace.ts:25` | ✓ Confirmed (analysis conflates pools) |
| Model file size: 277,852,192 bytes | filesystem | ✓ Confirmed |
| better-sqlite3 binary: 1,919,040 bytes | filesystem | ✓ Confirmed |
| Node.js version mismatch (v22 vs v25) | `node --version` | ✓ Confirmed |
