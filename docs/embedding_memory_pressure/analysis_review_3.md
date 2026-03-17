# Analysis Review 3

## Verdict

The analysis in `docs/embedding_memory_pressure/` is directionally useful, but it is not decision-ready yet.

What I would keep:

- The embedding probe path is expensive and risky.
- The documented `~150 MB` figure is likely too low.
- Lowering Vitest parallelism will probably trade speed for memory.

What I would not treat as settled:

- The current top-ranked root cause ordering.
- The claim that `better-sqlite3` duplication is the dominant unit-test driver.
- The claim that proposal A is a safe drop-in fix.
- The collection/execution time interpretation.

The most important issue is that the current proposal set contains at least one unsafe recommendation and several conclusions that are stronger than the evidence supports.

## Findings

### 1. Critical: proposal A is not a safe drop-in change

The report recommends replacing top-level `isModelUsable()` skip-gating with `isModelAvailable()` in `src/memory/embeddings/model.test.ts` and `src/memory/embeddings/nomic.test.ts` (`docs/embedding_memory_pressure/proposals.md:10-30`, `docs/embedding_memory_pressure/root-causes.md:72-74`).

That recommendation is not behaviorally equivalent.

- `shouldSkipEmbeddingTests()` explicitly documents three skip conditions, including "model runtime is not usable on this machine" (`src/test-utils.ts:292-321`).
- The two cited embedding test files currently use both `modelAvailable` and `modelUsability.usable` (`src/memory/embeddings/model.test.ts:22-28`, `src/memory/embeddings/nomic.test.ts:15-18`).
- On this machine, the model file exists, but runtime initialization fails with Metal backend errors. `pnpm exec vitest run --project embedding src/memory/embeddings/model.test.ts` passed by skipping the runtime-dependent cases, and `pnpm exec vitest run --project embedding src/memory/embeddings/nomic.test.ts` skipped all 9 tests for the same reason.

Implication:

- Replacing the runtime probe with `isModelAvailable()` would make those tests run on machines where the file exists but the backend is unusable. That is already visible elsewhere in the codebase: `src/memory/retrieval/plan.test.ts` uses `shouldSkipEmbeddingTests(modelAvailable)` only (`src/memory/retrieval/plan.test.ts:13-16`), and the current unit suite fails there on this machine because vector search is attempted against an unusable embedding backend.

Decision impact:

- The "fix the violation" idea is valid.
- The proposed implementation is not.
- If you pursue this, preserve the runtime-compatibility semantics. Move the expensive probe out of module top-level, but do not silently weaken the skip condition.

### 2. Critical: root cause 1 over-attributes the problem to `better-sqlite3`

The report says most unit tests transitively import `src/memory/storage/sqlite/connection.ts`, which imports `better-sqlite3`, and that the addon is effectively loaded in eight source files (`docs/embedding_memory_pressure/root-causes.md:13-24`, `docs/embedding_memory_pressure/measurements.md:127-147`).

That framing is too strong.

- In the SQLite storage layer, the apparent `better-sqlite3` imports are mostly `import type`, which disappear at runtime (`src/memory/storage/sqlite/connection.ts:7`, `src/memory/storage/sqlite/schema.ts`, `src/memory/storage/sqlite/cache.ts`, `src/memory/storage/sqlite/sync.ts`).
- The only direct runtime load I found is `require('better-sqlite3')` in `src/memory/storage/sqlite/availability.ts:22-31`.

Independent probe:

- Bare `better-sqlite3` in 4 `worker_threads` raised process RSS from `41.3 MB` to `83.5 MB`.
- A more realistic worker that imported the built app bundle and executed `searchKeyword()` raised RSS from `41.3 MB` to `209.8 MB`.

Interpretation:

- The per-worker overhead is real.
- The evidence does not justify saying that native addon binary duplication is the main thing consuming the missing `200-300 MB`.
- The bigger effect appears to be "duplicated worker runtime + application graph + native state", not "`better-sqlite3` alone".

Decision impact:

- Keep "threaded workers duplicate expensive runtime state" as a valid concern.
- Downgrade "`better-sqlite3` loaded in 8 files is the primary cause" to a hypothesis that still needs isolation.

### 3. Critical: the Vitest timing interpretation is not decision-grade

The TL;DR and measurements state that collection took `154s` and was "nearly as expensive as execution" (`docs/embedding_memory_pressure/README.md:25-26`, `docs/embedding_memory_pressure/measurements.md:70-74`, `docs/embedding_memory_pressure/measurements.md:127-139`).

That conclusion is not reliable as written.

Independent run:

- `pnpm exec vitest run --project unit`
- Reported wall duration: `11.40s`
- Reported phase totals: `collect 9.50s`, `tests 22.83s`, `prepare 4.56s`

Those numbers already show the issue: Vitest's phase timings are accumulated worker time, not a simple sequential wall-clock breakdown. Comparing `collect` and `tests` as if they were elapsed wall time is misleading.

Decision impact:

- Do not use the current collection-phase narrative to prioritize large import-graph refactors.
- If collection cost matters, re-measure it with a methodology that distinguishes wall time from aggregate worker time.

### 4. High: the analysis says "unit tests never touch the embedding model", but that is false in the current codebase

The unit-suite section says unit tests peak at `572 MB` "for unit tests that never touch the embedding model" (`docs/embedding_memory_pressure/measurements.md:78-80`).

That is not true in the current repository state.

- `src/memory/retrieval/plan.test.ts` is part of the unit project (`vitest.workspace.ts:18-33`).
- It calls `retrieveForPlan()` in non-mocked tests (`src/memory/retrieval/plan.test.ts:30-95`).
- `retrieveForPlan()` directly calls `searchVector()` before falling back (`src/memory/retrieval/plan.ts:40-65`).
- `searchVector()` calls `embedText(query)` and may also embed uncached lessons (`src/memory/search/vector.ts:95-173`).

Observed behavior:

- The unit run emitted repeated `node-llama-cpp` backend initialization errors from `plan.test.ts`.
- The same unit run failed one plan-retrieval test because the runtime was unusable but the skip gate only checked file availability.

Decision impact:

- Any memory numbers for "unit only" must explicitly state whether the model file was present and whether the backend was usable.
- Right now the analysis mixes "unit tests only" with a repository that has unit tests capable of touching embeddings.

### 5. High: the probe hazard is real, but the exact leak numbers need environment scoping

The report's strongest and most credible claim is that repeated `isModelUsable()` probes are dangerous (`docs/embedding_memory_pressure/root-causes.md:44-75`, `docs/embedding_memory_pressure/measurements.md:45-60`).

My local probes support the direction of that claim.

Independent process probe on this machine:

- Baseline RSS: `129.6 MB`
- After `isModelUsable()` probe 1: `265.7 MB`
- After `isModelUsable()` probe 2: `331.2 MB`
- After `isModelUsable()` probe 3: `329.9 MB`

Important detail:

- All three probes returned `usable=false`.
- The backend failed during Metal initialization.
- Even failed probes left the process materially fatter.

What this means:

- The report is right that module-level `isModelUsable()` calls are risky and expensive.
- The report has not yet proved that the exact `340 MB load / 110 MB permanent leak` numbers are stable enough to use as universal constants.
- Those numbers should be labeled as machine-specific observations unless repeated under a controlled matrix.

Decision impact:

- The design lesson is valid.
- The exact sizing should be treated as "measured on machine X / Node version Y", not as a universal budget.

### 6. Medium: root cause 4 is a reasonable cleanup hardening item, but it is not proven as a top-tier cause

The report presents `unloadEmbedding()` being fire-and-forget as a major root cause (`docs/embedding_memory_pressure/root-causes.md:78-102`).

The code does justify concern:

- `unloadEmbedding()` simply starts `unloadEmbeddingResources()` and does not await it (`src/memory/embeddings/nomic.ts:168-170`).
- `nomic.test.ts` uses that synchronous wrapper in `afterAll()` (`src/memory/embeddings/nomic.test.ts:20-23`).

But the current write-up overstates the certainty:

- The document does not show an experiment proving that this specific path is responsible for the claimed leak.
- Production CLI cleanup already does the awaited version (`src/cli-app.ts:29-41`).

Decision impact:

- Proposal B is still sensible.
- I would classify it as test hygiene / cleanup hardening, not as a demonstrated primary root cause.

### 7. Medium: proposals I and J partially describe the architecture that already exists

The proposal document presents "pre-computed vectors" as a future alternative (`docs/embedding_memory_pressure/proposals.md:163-199`).

The code already does a large part of that:

- `searchVector()` bulk-reads cached lesson embeddings from SQLite (`src/memory/search/vector.ts:118-141`).
- On cache miss, it computes and stores the embedding back into SQLite (`src/memory/search/vector.ts:137-140`).
- Separate insight-only embeddings are also cached (`src/memory/search/vector.ts:221-230`).

So the real remaining problem is narrower than the proposal implies:

- Query-time embedding still requires a live model.
- Cache misses still require a live model.
- CCT pattern vectors are cached only in memory, not in SQLite.

Decision impact:

- Do not evaluate I/J as a greenfield architecture change.
- Evaluate them as an incremental change to remove or externalize query-time model dependency.

### 8. Medium: lowering thread count looks plausible, but the current document should present it as a measured trade-off, not a settled recommendation

The report recommends reducing `maxThreads` from 4 to 2 with "~40% peak memory reduction" and "~30-50% slower" execution (`docs/embedding_memory_pressure/proposals.md:61-72`).

I only verified the speed side:

- `pnpm exec vitest run --project unit`: `11.40s`
- `pnpm exec vitest run --project unit --poolOptions.threads.minThreads=2 --poolOptions.threads.maxThreads=2`: `14.91s`

That is about a `31%` slowdown on this machine, so the speed estimate is plausible.

What I did not verify:

- The actual RSS change between 4 threads and 2 threads under the current codebase.

Decision impact:

- Proposal D is still a strong candidate.
- The document should say "speed estimate validated locally, memory impact still to be re-measured under a reproducible harness."

## What I would change before making a decision

### No-regret items

1. Keep the finding that top-level `isModelUsable()` probes are hazardous.
2. Update the docs/comments that still hardcode `~150 MB` as if it were authoritative.
3. Await cleanup in `nomic.test.ts` and any other test-only teardown paths that use `unloadEmbedding()`.
4. Fix the broader skip-gating inconsistency first, because the repository already has availability-only sites that misbehave on machines with a present-but-unusable model.

### Re-measure before approving architectural work

1. Measure unit suite with model absent.
2. Measure unit suite with model present but runtime unusable.
3. Measure unit suite with model present and runtime usable.
4. Measure embedding project separately.
5. Record both wall time and RSS scope explicitly:
   `process RSS`, `parent-only RSS`, and `system-wide total RSS` are not interchangeable.

### Reframe the decision tree

- If the goal is "stop the obvious waste quickly", focus on test gating and awaited cleanup first.
- If the goal is "reduce worker-process memory", validate whether thread duplication is really dominated by native addons or by the broader app graph.
- If the goal is "remove local embedding footprint from search", evaluate externalized query embeddings or a lighter runtime, because corpus-side precompute already exists in part.

## Commands I ran

These were the most decision-relevant probes:

```bash
pnpm exec vitest run --project embedding src/memory/embeddings/model.test.ts
pnpm exec vitest run --project embedding src/memory/embeddings/nomic.test.ts
pnpm exec vitest run --project unit
pnpm exec vitest run --project unit --poolOptions.threads.minThreads=2 --poolOptions.threads.maxThreads=2
```

I also ran process-local probes with `node --import tsx` to measure:

- repeated `isModelUsable()` calls,
- bare `better-sqlite3` inside `worker_threads`,
- worker imports of the built bundle executing `searchKeyword()`.

## Bottom line

The current analysis is good enough to justify follow-up work, but not good enough to justify a final solution choice.

The immediate blockers are:

- proposal A is unsafe as written,
- the unit-suite memory story is over-attributed,
- the timing interpretation is not robust,
- and the measurement scopes are mixed.

If you correct those four things, the document becomes much more reliable as a basis for deciding between "small test fixes", "Vitest topology changes", and "embedding architecture changes".
