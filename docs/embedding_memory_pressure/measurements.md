# Empirical Memory Measurements

> All measurements taken on macOS (Darwin 25.3.0, ARM64), Node.js v22.16.0

## Methodology

Measurements used three approaches:
1. **`process.memoryUsage()`** -- inline Node.js RSS tracking for model load/unload cycles
2. **`/usr/bin/time -l`** -- peak RSS of the parent vitest process
3. **`ps` polling** -- periodic sampling of all vitest-related processes

## Baseline

```
Node.js empty process:
  RSS:        37 MB
  Heap total:  5 MB
  Heap used:   3.5 MB
```

## Embedding Model (node-llama-cpp + EmbeddingGemma-300M)

### Single load/dispose cycle

```
After importing node-llama-cpp (no model):
  RSS delta:      +30 MB
  Heap delta:     +25 MB

After loading model + creating embedding context:
  RSS delta:      +340 MB  (total: 375 MB)
  Heap delta:     +46 MB
  External delta: +16 MB

After dispose (context + model + llama):
  RSS:            134 MB
  RSS reclaimed:  242 MB
  RSS leaked:     ~96 MB (permanent)
```

**Finding**: The model costs **340 MB RSS**, not 150 MB as documented in code
comments (`nomic.ts`, `model.ts`, `test-utils.ts`). After cleanup, ~96 MB of
native memory is never returned to the OS.

### Double load/dispose cycle (simulates test behavior)

This simulates what `model.test.ts` and `nomic.test.ts` actually do: load at
module level for skip-gating, dispose, then load again inside tests.

```
1st load:    372 MB RSS
1st dispose: 132 MB RSS
2nd load:    373 MB RSS
2nd dispose: 147 MB RSS

Leaked from baseline: 110 MB (permanent)
```

**Finding**: Each load/dispose cycle leaks incrementally. Two cycles leave
**110 MB** that can never be reclaimed within the process.

## Vitest Test Suite

### Unit tests only (`pnpm test:unit`)

```
Peak RSS (parent process):  572 MB
Test files:                 115 (116 matched, 1 failed)
Tests:                      2,270
Duration:                   137s
  - Transform:              28s
  - Collect:                154s  <-- nearly as long as execution
  - Tests:                  216s
  - Prepare:                79s
Pool:                       threads (minThreads: 2, maxThreads: 4)
```

**Finding**: 572 MB for unit tests that never touch the embedding model. The
culprit is native module duplication across worker threads (`better-sqlite3`
loaded in 8 source files, each thread gets its own copy).

### Unit + embedding (`pnpm test:fast`)

```
Peak RSS (parent process):  523 MB
Test files:                 121 (unit: 115, embedding: 6)
Tests:                      2,321
Duration:                   143s
  - Collect:                150s
  - Tests:                  312s
```

The parent process RSS appears lower because the embedding tests run in a
separate fork (measured by `/usr/bin/time` for the parent only). The actual
system-wide peak is higher.

## Test File Counts

| Project | Files | Pool | Workers | Isolation |
|---------|-------|------|---------|-----------|
| unit | 116 | threads | 2-4 | yes |
| integration | 16 | forks | 1 | yes |
| embedding | 6 | forks | 1 (singleFork) | yes |
| **Total** | **138** | | | |

### Unit tests by directory

```
28  src/commands
19  src/setup
12  src/setup/templates
 8  src/ (root)
 7  src/memory/knowledge
 6  src/memory/storage/sqlite
 5  src/memory/storage/sqlite-knowledge
 5  src/memory/search
 3  src/rules/checks
 3  src/memory/storage
 3  src/memory/retrieval
 3  src/memory/capture
 3  src/compound
 3  src/audit/checks
 2  src/rules
 1  misc (test-utils, memory, lint, config, audit, structural)
```

## Collection Phase Analysis

The collection phase (154s) imports every test file and its full dependency tree
to discover test cases. Each of the 116 unit test files transitively imports:

- `better-sqlite3` (via storage modules) -- native addon, ~1.8 MB compiled
- `zod` -- schema validation, significant parse tree
- `commander` -- CLI framework
- Various internal modules that import the above

With `pool: 'threads'` and 4 threads, the full dependency tree is loaded
**4 times** (once per thread). Native addons like `better-sqlite3` allocate
separate native heap per thread.

## Native Addon Inventory

| Addon | Disk Size | Per-process Cost | Files Importing |
|-------|-----------|------------------|-----------------|
| better-sqlite3 | 1.8 MB | ~10-50 MB (varies by DB size) | 8 source files |
| node-llama-cpp | 557 KB + 4.3 MB support libs | ~30 MB import + 340 MB model | 4 source files |
| fsevents | 160 KB | minimal | 0 (dev-only) |

## Summary

The memory pressure comes from three compounding factors:

1. **Native module duplication**: 4 worker threads x native addon copies
2. **Embedding model size**: 340 MB (2x documented), with 110 MB leak per cycle
3. **Collection overhead**: Full dependency graph loaded per thread before any test runs
