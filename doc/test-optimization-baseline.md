# Test Optimization Baseline Metrics

**Captured**: 2026-02-01
**Branch**: test-optimization
**Commit**: c4c43c3

## Summary

| Metric | Value |
|--------|-------|
| Total Duration | **2m 2.2s** (122.2s) |
| Test Files | 17 |
| Test Cases | 648 |
| Vitest Duration | 120.70s |

## Critical Finding

**cli.test.ts accounts for 98% of test time** (118.6s out of 120.7s)

This is the primary optimization target.

## Per-File Breakdown

| File | Tests | Duration | % of Total |
|------|-------|----------|------------|
| cli.test.ts | 268 | 118,558ms | **98.2%** |
| retrieval/plan.test.ts | 9 | 2,705ms | 2.2% |
| embeddings/nomic.test.ts | 9 | 2,211ms | 1.8% |
| storage/sqlite.test.ts | 52 | 1,015ms | 0.8% |
| types.test.ts | 65 | 929ms | 0.8% |
| storage/compact.test.ts | 24 | 613ms | 0.5% |
| capture/quality.test.ts | 37 | 351ms | 0.3% |
| storage/jsonl.test.ts | 19 | 277ms | 0.2% |
| search/vector.test.ts | 14 | 219ms | 0.2% |
| capture/integration.test.ts | 15 | 173ms | 0.1% |
| retrieval/session.test.ts | 8 | 123ms | 0.1% |
| test-utils.test.ts | 40 | 23ms | <0.1% |
| capture/triggers.test.ts | 28 | 13ms | <0.1% |
| embeddings/model.test.ts | 7 | 13ms | <0.1% |
| search/ranking.test.ts | 15 | 9ms | <0.1% |
| index.test.ts | 26 | 6ms | <0.1% |
| cli-utils.test.ts | 12 | 4ms | <0.1% |

## Slow Individual Tests (>500ms)

From cli.test.ts:
- Multiple tests spawn Node.js processes via `execSync`
- Each process: tsx compilation + CLI execution
- Average per-test: ~442ms

From embedding tests:
- embedText vector generation: 1,946ms
- retrieveForPlan: 2,339ms

## Optimization Priorities

Based on this baseline:

1. **Split cli.test.ts** - Enable parallelization of the 98% bottleneck
2. **test:fast script** - Skip CLI integration for rapid feedback
3. **Parallelization** - Run split files concurrently
4. Other optimizations provide marginal gains (<2% combined)

## Expected Improvements

| Optimization | Expected Impact |
|--------------|-----------------|
| Split CLI (4 workers) | ~75% faster (30s vs 120s) |
| test:fast (skip CLI) | ~98% faster (~2s) |
| Fast-check reduction | ~0.5% faster |
| In-memory SQLite | ~0.5% faster |

## Comparison Target

After all optimizations:
- `pnpm test` should complete in <40s (vs 122s baseline)
- `pnpm test:fast` should complete in <5s
