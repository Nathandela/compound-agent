# Solution Proposals

Proposals are organized in four tiers by effort and scope. Each includes impact
estimate, effort, trade-offs, and risk.

---

## Tier 1: Quick Fixes (hours-days, no architecture change)

### A. Fix `isModelUsable()` violations

| Aspect | Detail |
|--------|--------|
| **Effort** | 30 minutes |
| **Impact** | Eliminates 340 MB unnecessary load + 110 MB permanent leak |
| **Risk** | None -- uses the already-recommended `isModelAvailable()` |
| **Files** | `model.test.ts:24`, `nomic.test.ts:17` |

Replace:
```typescript
const modelUsability = modelAvailable ? await isModelUsable() : { usable: false as const };
```
With:
```typescript
// isModelAvailable() uses fs.existsSync -- zero native allocation
const skipEmbedding = shouldSkipEmbeddingTests(modelAvailable);
```

The `shouldSkipEmbeddingTests()` helper already defaults its second parameter
to `modelAvailable`, so this is a drop-in fix.

### B. Await cleanup in `afterAll`

| Aspect | Detail |
|--------|--------|
| **Effort** | 15 minutes |
| **Impact** | Prevents 340 MB leak on worker exit |
| **Risk** | None |
| **Files** | `nomic.test.ts:21-23` |

Change:
```typescript
afterAll(() => { unloadEmbedding(); })
```
To:
```typescript
afterAll(async () => { await unloadEmbeddingResources(); })
```

### C. Update documented memory figures

| Aspect | Detail |
|--------|--------|
| **Effort** | 30 minutes |
| **Impact** | Prevents future decisions based on wrong data |
| **Risk** | None |
| **Files** | `model.ts`, `nomic.ts`, `test-utils.ts`, `RESOURCE_LIFECYCLE.md` |

All references to "~150 MB" should be updated to "~340 MB RSS".

### D. Reduce `maxThreads` from 4 to 2

| Aspect | Detail |
|--------|--------|
| **Effort** | 5 minutes |
| **Impact** | ~40% peak memory reduction for unit tests |
| **Risk** | ~30-50% slower unit test execution (I/O bound, so not 2x) |
| **Files** | `vitest.workspace.ts:28` |

Halves the number of native module copies in memory. Since tests are mostly
I/O bound (SQLite, file system), the parallelism loss is smaller than the
thread count reduction.

---

## Tier 2: Architecture Changes (days-weeks)

### E. Switch unit tests from `threads` to `forks` with constrained workers

| Aspect | Detail |
|--------|--------|
| **Effort** | 1 day (config change + test validation) |
| **Impact** | Each fork gets independent RSS, OS can reclaim between batches |
| **Risk** | Slower (fork overhead > thread overhead); possible test pollution |
| **Trade-off** | With `threads`, all native memory accumulates in one process. With `forks`, each fork loads/unloads independently, and OS reclaims RSS when forks exit |

Options:
- `forks` + `maxForks: 2`: Two independent processes, lower peak per process
- `forks` + `singleFork: true`: One process, sequential, lowest peak but slowest

### F. Lazy-import native modules via dynamic `import()`

| Aspect | Detail |
|--------|--------|
| **Effort** | 1-2 weeks (refactor import graph) |
| **Impact** | Tests that don't need SQLite never load `better-sqlite3` |
| **Risk** | More complex import patterns; potential circular dependency issues |
| **Files** | `connection.ts`, `cache.ts`, `schema.ts`, and all consumers |

Currently, importing any module in `src/memory/storage/sqlite/` eagerly loads
`better-sqlite3`. If test files that don't directly use SQLite could avoid
this transitive import, thread-level memory drops significantly.

Pattern:
```typescript
// Before: eager (loaded during collection)
import Database from 'better-sqlite3';

// After: lazy (loaded only when first used)
let _Database: typeof import('better-sqlite3').default;
async function getDatabase() {
  if (!_Database) {
    _Database = (await import('better-sqlite3')).default;
  }
  return _Database;
}
```

### G. Split test suites into "pure" vs "native"

| Aspect | Detail |
|--------|--------|
| **Effort** | 2-3 days |
| **Impact** | Pure tests run in lightweight threads; native tests isolated |
| **Risk** | Maintenance overhead of a 4th vitest project |

Create a 4th vitest workspace project:
- **pure**: Tests that never touch SQLite or embeddings (validation, parsing,
  formatting, template rendering). Run in `threads` with high parallelism.
- **native**: Tests that use SQLite. Run in `forks` with constrained workers.

Based on the directory breakdown, candidates for "pure":
- `src/setup/templates/` (12 files)
- `src/rules/` and `src/rules/checks/` (5 files)
- `src/audit/checks/` (3 files)
- Various utility tests

Estimated 30-40% of unit tests could run without native modules.

---

## Tier 3: Embedding Architecture Alternatives (weeks-months)

### H. Replace in-process embedding with HTTP service

| Aspect | Detail |
|--------|--------|
| **Effort** | 2-3 weeks |
| **Impact** | Node process drops to ~0 MB for embeddings; service runs separately |
| **Risk** | Operational complexity (must run/manage a service); latency increase |
| **Trade-off** | Decouples embedding compute from the CLI tool entirely |

Options:
1. **llama.cpp server mode**: Run `llama-server` as a sidecar, call via HTTP.
   Same model, same quality, but memory is isolated in a separate process.
2. **FastAPI + sentence-transformers**: Python service, well-tested ecosystem.
   Different model but potentially better quality.
3. **Cloud API** (OpenAI embeddings, Voyage, etc.): Zero local memory, but
   requires network and has per-call cost.

Tests would mock the HTTP client. No native modules needed in the Node process.

### I. Switch to lighter embedding runtime

| Aspect | Detail |
|--------|--------|
| **Effort** | 1-2 weeks |
| **Impact** | 50-70% memory reduction for embeddings |
| **Risk** | Different model quality; migration effort |

Alternatives to node-llama-cpp:

| Runtime | Memory | Native? | Notes |
|---------|--------|---------|-------|
| **ONNX Runtime** (`onnxruntime-node`) | ~80-120 MB | Yes (lighter) | Well-maintained, good perf |
| **Transformers.js** (`@huggingface/transformers`) | ~100-150 MB | No (WASM) | Pure JS, no native leak issues |
| **Pre-computed vectors** | 0 MB at query time | No | Compute at `ca learn` time, store in SQLite |

The **pre-computed** approach is particularly attractive for this use case:
embeddings are generated when lessons are captured (`ca learn`) and stored
alongside the lesson. Search computes the query embedding once, then does
vector math against stored vectors. The model is only loaded during `ca learn`,
never during `ca search`.

### J. Replace node-llama-cpp with native SQLite vector search

| Aspect | Detail |
|--------|--------|
| **Effort** | 1-2 weeks |
| **Impact** | Eliminates embedding runtime entirely for search |
| **Risk** | Requires SQLite extension (sqlite-vec or sqlite-vss) |

SQLite has vector search extensions that can store and query pre-computed
embeddings. Combined with pre-computed vectors (proposal I), this eliminates
the embedding model from search entirely:

1. At `ca learn` time: load model, embed, store vector in SQLite, unload model
2. At `ca search` time: load model for query vector only (or use keyword search
   as fallback when model unavailable)

---

## Tier 4: Language Migration (months)

### K. Rewrite in Rust

| Aspect | Detail |
|--------|--------|
| **Effort** | 2-4 months |
| **Impact** | Eliminates entire class of memory problems |
| **Risk** | Major investment; different ecosystem; team skill requirements |

A Rust implementation would use:
- `rusqlite` for SQLite (single binary, no addon duplication)
- `candle` or `burn` for embeddings (native, deterministic memory)
- `clap` for CLI
- Predictable ~50-80 MB total footprint for equivalent functionality

**Advantages**:
- No garbage collector, no native addon boundary issues
- Single statically-linked binary (no node_modules)
- Deterministic memory management (no leaks from dispose/GC races)
- Faster startup (no V8 JIT warmup)

**Disadvantages**:
- Major rewrite effort (~15K LoC TypeScript)
- Team needs Rust expertise
- Slower iteration during development
- Loss of JavaScript ecosystem tooling

### L. Rewrite in Go

| Aspect | Detail |
|--------|--------|
| **Effort** | 1-3 months |
| **Impact** | Similar to Rust but easier to hire/learn |
| **Risk** | CGo complications for SQLite; embedding support less mature |

Similar benefits to Rust with lower learning curve. Go's garbage collector
is simpler than Node's but still present. CGo boundary for SQLite adds some
complexity but less than Node.js native addons.

---

## Decision Matrix

| Proposal | Effort | Memory Impact | Speed Impact | Risk | Recommended? |
|----------|--------|---------------|--------------|------|:---:|
| **A** Fix isModelUsable | 30 min | -340 MB peak, -110 MB leak | None | None | Yes |
| **B** Await cleanup | 15 min | -340 MB potential leak | None | None | Yes |
| **C** Update docs | 30 min | (correctness) | None | None | Yes |
| **D** maxThreads 2 | 5 min | ~-40% unit peak | ~-30% slower | Low | Yes |
| **E** Forks for unit | 1 day | Variable | Slower | Low | Maybe |
| **F** Lazy imports | 1-2 wk | Significant | Faster collect | Medium | Maybe |
| **G** Pure/native split | 2-3 days | Moderate | Faster pure | Low | Maybe |
| **H** HTTP embedding | 2-3 wk | -340 MB in Node | +latency | Medium | Consider |
| **I** Lighter runtime | 1-2 wk | -50-70% embed | Variable | Medium | Consider |
| **J** Pre-computed + SQLite vec | 1-2 wk | -340 MB search | Faster search | Medium | Consider |
| **K** Rust rewrite | 2-4 mo | -90% total | Much faster | High | Long-term |
| **L** Go rewrite | 1-3 mo | -80% total | Faster | High | Long-term |

## Recommended Sequence

**Immediate** (this week):
1. A + B + C -- fix violations, fix cleanup, fix docs

**Short-term** (this month):
2. D -- reduce maxThreads
3. G -- split pure/native test suites

**Medium-term** (evaluate after short-term):
4. I or J -- pre-computed embeddings with lazy model loading
5. F -- lazy imports (if G doesn't sufficiently reduce pressure)

**Long-term** (only if the project is growing):
6. K or L -- language migration (evaluate based on team skills and growth trajectory)
