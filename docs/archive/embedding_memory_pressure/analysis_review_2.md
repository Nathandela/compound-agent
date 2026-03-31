# Review of Embedding Memory Pressure Analysis

> **Reviewer**: Claude Opus 4.6 (independent investigation)
> **Date**: 2026-03-17
> **Scope**: Full re-verification of all claims in `root-causes.md`, `measurements.md`, and `proposals.md`
> **Node.js version**: v25.2.1 (analysis used v22.16.0)
> **node-llama-cpp version**: 3.15.1

---

## Verdict

The analysis correctly identifies three of five root causes and proposes reasonable solutions.
However, it **misidentifies the primary cause of unit test memory pressure** and
**understates all memory figures by 15–140%**. Two additional root causes are missed entirely.

---

## Root Cause #1: "Native module duplication across worker threads" — WRONG TARGET

**Claim**: `better-sqlite3` is loaded 4 times (once per worker thread), duplicating native
heap, and this is the primary cause of the 572 MB unit test peak.

**Reality**: `better-sqlite3` costs **~2 MB to load** and is **loaded lazily**, not at
import/collection time. The analysis's own cited evidence — "imported by 8 source files" —
is misleading: all 8 import sites use `import type` (TypeScript type-only imports, erased at
compile time). The only runtime load is `require('better-sqlite3')` inside
`ensureSqliteAvailable()` in `availability.ts:26`, which executes on-demand when a database
operation is performed, not during module evaluation.

### Empirical verification

| Operation | RSS delta |
|-----------|-----------|
| `require('better-sqlite3')` | **+2 MB** |
| `import('node-llama-cpp')` (no model) | **+55 MB** |

The analysis attributes ~200–300 MB to `better-sqlite3` duplication. The actual cost of 4
copies of `better-sqlite3` would be ~8 MB — negligible.

### The real #1: `node-llama-cpp` static import via barrel exports

The true primary cause of unit test memory pressure is **`node-llama-cpp` being transitively
loaded by unit tests** through the barrel export pattern:

```
model.ts    → static import { getLlama, LlamaLogLevel, resolveModelFile } from 'node-llama-cpp'
nomic.ts    → static import { getLlama, LlamaEmbeddingContext, LlamaLogLevel } from 'node-llama-cpp'
embeddings/index.ts → re-exports from both model.ts and nomic.ts
```

`isModelAvailable()` is a zero-cost `fs.existsSync()` call, but importing it from `model.js`,
`nomic.js`, or the barrel `embeddings/index.js` forces loading the entire `node-llama-cpp`
native module (+55 MB RSS).

**11 unit test files** transitively load `node-llama-cpp` (not `better-sqlite3`):

| Test file | Import path | Mocked? |
|-----------|-------------|---------|
| `src/index.test.ts` | barrel → nomic.js → node-llama-cpp | No |
| `src/commands/knowledge-index.test.ts` | barrel → nomic.js → node-llama-cpp | No |
| `src/memory/retrieval/plan.test.ts` | nomic.js → node-llama-cpp | No |
| `src/memory/knowledge/search.test.ts` | search.ts → nomic.js + model.js → node-llama-cpp | No (spyOn) |
| `src/memory/search/prewarm.test.ts` | prewarm.ts → model.js + barrel → node-llama-cpp | No |
| `src/memory/search/vector.test.ts` | vector.ts → model.js + barrel → node-llama-cpp | No |
| `src/memory/knowledge/indexing.test.ts` | indexing.ts → dynamic import (deferred) | N/A |
| `src/commands/capture-similarity.test.ts` | model.js + nomic.js | Yes (vi.mock) |
| `src/memory/capture/quality.test.ts` | model.js | Yes (vi.mock) |
| `src/memory/knowledge/embed-background.test.ts` | barrel | Yes (vi.mock) |
| `src/commands/clean-lessons.test.ts` | nomic.js + model.js | Yes (vi.mock) |

Files using `vi.mock` avoid loading `node-llama-cpp` (the mock factory replaces the module
before it's evaluated). Files without mocking (6 of 11) load the real native module at
collection time.

### Per-file memory verification

| Test file | Peak RSS | Collect time | Has node-llama-cpp? |
|-----------|----------|--------------|---------------------|
| `sqlite.test.ts` (no embeddings import) | **171 MB** | 67ms | No |
| `capture-similarity.test.ts` (mocked) | **163 MB** | 42ms | No (mocked) |
| `vector.test.ts` (real import) | **226 MB** | 423ms | **Yes** |
| `index.test.ts` (barrel import) | **216 MB** | 485ms | **Yes** |

The **+55 MB delta and +350ms collect time** precisely match the standalone `node-llama-cpp`
import cost. With 4 worker threads each likely processing at least one of the 6 un-mocked
files, the cost is ~4 × 55 = **220 MB** of avoidable RSS for unit tests.

---

## Root Cause #2: "Embedding model is 2x larger than documented" — CORRECT DIRECTION, WRONG NUMBERS

**Claim**: Model costs 340 MB RSS (documented as 150 MB).

**My measurement**: Model costs **397–412 MB RSS** (varies across runs). The analysis
corrects the 150 MB documentation but still **understates by ~18%**.

### Full load/dispose cycle (my measurements)

```
After importing node-llama-cpp (no model):
  RSS delta:      +53–57 MB          (analysis claims +30 MB)

After loading model + creating embedding context:
  RSS delta:      +397–412 MB        (analysis claims +340 MB)

After dispose:
  Leaked:         +138–157 MB        (analysis claims +96 MB)
```

### Double load/dispose cycle

```
1st load:    504 MB RSS              (analysis: 372 MB)
1st dispose: 248 MB RSS              (analysis: 132 MB)
2nd load:    590 MB RSS              (analysis: 373 MB)
2nd dispose: 312 MB RSS              (analysis: 147 MB)

Total leaked from baseline: +273 MB  (analysis: 110 MB)
```

**The analysis understates the total leak after 2 cycles by 2.5x** (273 MB vs 110 MB).

Possible explanations for the discrepancy:
- Different Node.js version (v25.2.1 vs v22.16.0) — V8 memory management changed
- Different node-llama-cpp prebuilt binary behavior
- Different measurement methodology (the analysis doesn't document exact script)

Regardless, **the corrected figures should be verified on the target Node.js version before
acting on them**.

---

## Root Cause #3: "Module-level `isModelUsable()` calls" — CORRECT

**Claim**: `model.test.ts:24` and `nomic.test.ts:17` call `isModelUsable()` at module
top-level, violating safety rules.

**Verified**: Both files contain:
```typescript
const modelUsability = modelAvailable ? await isModelUsable() : { usable: false as const };
```

This is indeed at module scope and runs during vitest collection. However, the analysis
overstates the blast radius:

- These files are in the **embedding** workspace (`singleFork` pool), NOT the unit workspace
- They affect embedding test memory, not unit test memory
- The proposed fix (switch to `isModelAvailable()`) is correct and trivial

### Additional nuance missed by the analysis

The `shouldSkipEmbeddingTests()` helper's second parameter (`runtimeUsable`) defaults to
`modelAvailable`. When the model file exists but the runtime is broken (incompatible native
backend), `isModelAvailable()` returns `true` but `isModelUsable()` returns `false`. The fix
loses this finer skip-gating. For the embedding workspace (where these tests live), this
means tests would attempt to run and fail at runtime instead of being skipped — a worse
developer experience on machines with broken native backends.

**Recommendation**: The fix is still worth doing for memory savings, but add a
`beforeAll` that calls `isModelUsable()` once (inside the test lifecycle, not at module scope)
and calls `describe.skip()` or returns early if the model is unusable.

---

## Root Cause #4: "`unloadEmbedding()` is fire-and-forget" — CORRECT, PLUS MISSED BUG

**Claim**: `unloadEmbedding()` calls `void unloadEmbeddingResources()` without awaiting.

**Verified**: `nomic.ts:168-170`:
```typescript
export function unloadEmbedding(): void {
  void unloadEmbeddingResources();
}
```

The proposed fix (await in `afterAll`) is correct.

### Missed bug: Concurrent disposal order

The analysis does not flag that `unloadEmbeddingResources()` disposes **all three native
resources concurrently**:

```typescript
// nomic.ts:110-124 (simplified)
const disposals: Promise<unknown>[] = [];
if (context) disposals.push(context.dispose());   // started
if (model)   disposals.push(model.dispose());      // started concurrently
if (llama)   disposals.push(llama.dispose());      // started concurrently
await Promise.allSettled(disposals);
```

Compare with `isModelUsable()` cleanup in `model.ts:126-135` which correctly disposes
**sequentially** (context → model → llama).

In node-llama-cpp, the model owns the context and llama owns the model. Disposing a parent
while a child is still being disposed can cause undefined behavior in the C++ backend.
My empirical test shows both approaches currently succeed without SIGABRT, but the concurrent
pattern is still incorrect by the library's lifecycle contract.

**Recommendation**: Fix `unloadEmbeddingResources()` to dispose sequentially:
```typescript
if (context) await context.dispose();
if (model)   await model.dispose();
if (llama)   await llama.dispose();
```

---

## Root Cause #5: "Integration tests spawn heavyweight processes" — CORRECT, LOW IMPACT

**Claim**: Each integration test spawns a full Node.js process via `execFileSync`.

**Verified**: `test-utils.ts:397-417` calls `execFileSync('node', [cliPath, ...args])`.
The analysis correctly notes this is the **least impactful** cause since processes run
sequentially and release memory on exit.

No issues with this section.

---

## Missing Root Cause #6: Barrel export couples zero-cost functions to heavy native modules

Not identified in the analysis.

`isModelAvailable()` is a pure `fs.existsSync()` check (zero cost), but it lives in
`model.ts` which has a static top-level `import { getLlama, ... } from 'node-llama-cpp'`.
The barrel `embeddings/index.ts` re-exports everything from both `nomic.ts` and `model.ts`.

Any module that needs `isModelAvailable()` — including 6+ production modules and their
associated unit tests — pays the ~55 MB `node-llama-cpp` import tax.

**Fix**: Extract `isModelAvailable()` and related constants (`MODEL_URI`, `MODEL_FILENAME`,
`DEFAULT_MODEL_DIR`) into a separate lightweight module (e.g., `model-info.ts`) with zero
native imports. The heavyweight `model.ts` would import from `model-info.ts` instead of
defining these itself.

---

## Missing Root Cause #7: Documentation propagates wrong memory figures

Not identified as a root cause (mentioned as proposal C but not as a cause).

Every reference to "~150 MB" in the codebase is wrong. The actual numbers are:

| What | Documented | Actual (v25.2.1) |
|------|-----------|-------------------|
| Import node-llama-cpp (no model) | Not documented | **+55 MB** |
| Load model + context | ~150 MB | **+400 MB** |
| After dispose (leak) | Not documented | **+140 MB** |
| Two load/dispose cycles leak | Not documented | **+273 MB** |

Files with wrong figures:
- `model.ts:68` ("~150MB of native C++ memory")
- `nomic.ts:5,10,128,177,192` (multiple "~150MB" references)
- `test-utils.ts:311` ("~150MB of native memory")
- `RESOURCE_LIFECYCLE.md:12,69,89,215,248` (multiple "~150MB" references)

---

## Measurement Discrepancies

The analysis claims measurements from "macOS (Darwin 25.3.0, ARM64), Node.js v22.16.0".
My measurements on Node.js v25.2.1 show consistently higher figures:

| Metric | Analysis | My measurement | Delta |
|--------|----------|----------------|-------|
| node-llama-cpp import | 30 MB | 55 MB | +83% |
| Model load | 340 MB | 400 MB | +18% |
| 1st dispose leak | 96 MB | 148 MB | +54% |
| 2 cycle total leak | 110 MB | 273 MB | +148% |
| Unit test peak RSS | 572 MB | 776 MB | +36% |
| Collection phase | 154s | 17s | -89% |
| Total test duration | 137s | 19s | -86% |

The memory figures are consistently higher; the timing figures are dramatically lower.
The timing discrepancy suggests the analysis was either run on a very different system
configuration or there were background processes competing for resources. **The analysis
should document the exact measurement scripts used** so results are reproducible.

---

## Proposals Review

### Tier 1: Quick Fixes

| Proposal | Verdict | Notes |
|----------|---------|-------|
| **A. Fix isModelUsable violations** | **Approve with caveat** | Correct fix. Add a `beforeAll` runtime check in embedding tests to preserve skip-gating for broken native backends. Impact: affects embedding workspace only, not unit tests. |
| **B. Await cleanup in afterAll** | **Approve, extend** | Also fix concurrent disposal order in `unloadEmbeddingResources()` (sequential, not `Promise.allSettled`). |
| **C. Update documented figures** | **Approve** | But use ~400 MB (not ~340 MB). Verify on target Node.js version. |
| **D. Reduce maxThreads 4→2** | **Approve** | Quick win. But note: the thread count multiplies node-llama-cpp imports (55 MB/thread), not better-sqlite3 (2 MB/thread). The impact is real but the analysis attributes it to the wrong module. |

### Tier 2: Architecture Changes

| Proposal | Verdict | Notes |
|----------|---------|-------|
| **E. Threads → forks** | **Neutral** | Forks have higher creation overhead but cleaner isolation. Only helps if OS reclaims between forks faster than threads accumulate. |
| **F. Lazy-import native modules** | **Re-target** | The analysis targets `better-sqlite3` (2 MB, already lazy). Should target `node-llama-cpp` (~55 MB, eagerly loaded via static import). Convert `model.ts` and `nomic.ts` to use dynamic `import('node-llama-cpp')` inside their async functions. |
| **G. Split pure/native suites** | **Approve** | Sound approach. But "native" means "imports node-llama-cpp", not "uses better-sqlite3". |

### New proposal: Extract `isModelAvailable` from native modules

| Aspect | Detail |
|--------|--------|
| **Effort** | 1–2 hours |
| **Impact** | Eliminates ~55 MB × 4 threads = **~220 MB** for unit tests |
| **Risk** | Low — internal module reorganization |
| **Approach** | Create `model-info.ts` with `isModelAvailable()`, `MODEL_URI`, `MODEL_FILENAME`, `DEFAULT_MODEL_DIR`. Zero native imports. `model.ts` imports from `model-info.ts`. Production modules that only need `isModelAvailable()` import from `model-info.ts` instead of the barrel. |

This is the **highest-impact low-effort change** for unit test memory. It directly eliminates
the root cause that the analysis misidentifies.

### Tier 3–4: Long-term

No disagreements. The pre-computed embedding approach (Proposal I/J) is particularly
well-suited to this use case. Language migration proposals are proportionate for a long-term
roadmap discussion.

---

## Recommended Action Sequence (Revised)

**Immediate (hours)**:
1. **A** — Fix `isModelUsable()` violations (add `beforeAll` runtime gate)
2. **B+** — Fix `unloadEmbedding` cleanup: await disposal AND fix sequential order
3. **NEW** — Extract `isModelAvailable()` into `model-info.ts` (eliminates ~220 MB for unit tests)
4. **C** — Update all "~150 MB" to "~400 MB" (verify on target Node version)

**Short-term (days)**:
5. **D** — Reduce maxThreads 4→2 (now with correct cost model: 55 MB/thread not 2 MB/thread)
6. **F (re-targeted)** — Dynamic `import('node-llama-cpp')` in `model.ts` and `nomic.ts`
7. **G** — Split pure/native test suites

**Medium-term (weeks)**:
8. **I/J** — Pre-computed embeddings with lazy model loading

---

## Open Questions for Decision-Makers

1. **Which Node.js version is the target?** Memory behavior differs significantly between
   v22 and v25. The team should verify measurements on the target version.

2. **Is the 273 MB cumulative leak per process acceptable?** If the CLI process loads/disposes
   the model twice (e.g., `isModelUsable()` probe + actual embedding), 273 MB of native
   memory is permanently leaked. For short-lived CLI commands this is tolerable (process exit
   reclaims). For long-running or repeated operations, this is a real concern.

3. **Does the embedding workspace's `singleFork` isolation actually protect against the
   `isModelUsable()` leak?** If vitest runs the embedding fork after unit tests complete,
   the fork gets its own address space and the leak is contained. But if there's process
   reuse, the leak compounds.
