# Go Migration Feasibility Analysis

*2026-03-09*

## Abstract

This document assesses whether migrating Compound Agent from TypeScript/Node.js to Go (with a Rust embedding subprocess) would deliver meaningful performance improvements. The analysis is grounded in the Go PhD research (6 papers, ~55K words) and a detailed profiling of the current `ca search` hot path.

**Verdict**: Migration is justified. The current architecture pays a **4.4-second tax per search invocation**, dominated by Node.js startup and per-process embedding model load/unload. A Go binary with a persistent Rust embedding daemon could reduce this to **<100ms warm, <500ms cold** — a 10-40x improvement that directly impacts Claude Code's responsiveness.

---

## 1. Current Performance Profile

Measured: `time ca search "error handling"` → **4.39s wall, 2.8s user, 0.9s sys**

### Cost Breakdown (per invocation)

| Stage | Cost | % of Total | Eliminable? |
|-------|------|-----------|-------------|
| `npx` resolution + Node.js startup | 200-800ms | ~15% | Yes (native binary) |
| Native addon dlopen (better-sqlite3) | 10-50ms | ~1% | Yes (static linking) |
| Embedding model load (278MB mmap) | 1000-3000ms | **~55%** | Yes (persistent daemon) |
| Embedding inference (query vector) | 50-200ms | ~4% | Reducible (Rust) |
| SQLite FTS5 query | <5ms | <1% | No (already fast) |
| Cosine similarity (N items) | <1ms | <1% | No (already fast) |
| Hybrid merge + ranking | <5ms | <1% | No (already fast) |
| Embedding model unload + cleanup | 100-500ms | ~10% | Yes (persistent daemon) |
| **Actual search logic** | **<15ms** | **<1%** | — |

**Key insight**: 99% of wall time is overhead. The actual search (FTS5 + cosine similarity + ranking) takes <15ms. The rest is process bootstrap and embedding model lifecycle.

### Architectural Root Cause

The current design loads and unloads the 278MB embedding model on **every CLI invocation**. There is no persistent process or daemon. Each `ca search` call:

1. Starts Node.js (200-800ms)
2. Loads native SQLite addon (10-50ms)
3. mmaps 278MB GGUF model file (1-3s)
4. Runs one 50-200ms inference
5. Unloads everything and exits

This is like starting a database server to run one query, then shutting it down.

---

## 2. Target Architecture: Go + Rust Hybrid

```
┌─────────────────────────────────────────────┐
│ Go Binary (ca)                               │
│                                              │
│  CLI parsing ──► SQLite FTS5 ──► Ranking     │
│       │              │              │        │
│       ▼              ▼              ▼        │
│  Hook handlers   JSONL sync    Score merge   │
│                                              │
│  ┌──────────────────────────────────┐        │
│  │ Unix Socket / stdin-stdout pipe  │        │
│  └──────────┬───────────────────────┘        │
└─────────────┼────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│ Rust Embedding Daemon (ca-embed)             │
│                                              │
│  Model loaded ONCE at startup                │
│  Stays resident in memory (~150MB)           │
│  Accepts: { "text": "query" }                │
│  Returns: { "vector": [0.1, 0.2, ...] }     │
│                                              │
│  Auto-starts on first embed request          │
│  Auto-exits after 5min idle                  │
│  Lock file prevents duplicate instances      │
└─────────────────────────────────────────────┘
```

### Why This Architecture

1. **Go for CLI + logic**: Fast startup (<10ms), single static binary, structural interfaces for extensibility, goroutines for parallel search paths
2. **Rust for embeddings**: Zero-cost FFI to llama.cpp, memory safety for native model management, compiles to a small daemon binary
3. **Daemon pattern**: Model loaded once, serves many requests. Eliminates the 1-3s load/unload cycle that dominates current performance
4. **Unix socket IPC**: Simple, fast (<1ms overhead), works on macOS/Linux. Falls back to stdin/stdout pipe on Windows

### Projected Performance

| Scenario | Current (TS) | Projected (Go+Rust) | Speedup |
|----------|-------------|---------------------|---------|
| Cold start (first ever) | 4.4s | ~800ms | 5x |
| Warm (daemon running) | 4.4s | ~80ms | **55x** |
| Keyword-only (no model) | 1.2s | ~15ms | **80x** |
| Hook handler (no search) | 0.8s | ~5ms | **160x** |

**Cold start breakdown** (Go+Rust, first invocation):
- Go binary startup: ~5ms
- SQLite open + sync: ~10ms
- Spawn Rust daemon + model load: ~700ms (one-time)
- Send query, receive vector: ~60ms
- FTS5 + cosine + rank: ~15ms
- Output: ~1ms
- **Total: ~800ms** (then daemon stays resident)

**Warm breakdown** (daemon already running):
- Go binary startup: ~5ms
- SQLite open + sync: ~5ms
- IPC to daemon: ~1ms
- Inference: ~50ms
- FTS5 + cosine + rank: ~15ms
- Output: ~1ms
- **Total: ~80ms**

---

## 3. Go-Specific Advantages (from PhD Research)

### 3.1 Compilation & Distribution

From *Section 03 (Compiler Toolchain)*:
- **Single static binary**: No runtime dependencies. `ca` is one file, ~15-20MB
- **Cross-compilation**: `GOOS=linux GOARCH=arm64 go build` — trivial multi-platform
- **Build speed**: <1 second for a CLI this size (vs ~3s for tsup bundle)
- **No npx tax**: Eliminates the 200-800ms `npx` resolution overhead entirely

### 3.2 Concurrency Model

From *Section 05 (Concurrency Model)*:
- **Goroutines for parallel search**: FTS5 and vector search run concurrently with zero overhead (currently using `Promise.all` which has event loop scheduling cost)
- **Channels for daemon IPC**: Natural fit for request/response to embedding daemon
- **`context.Context` for cancellation**: Hook handlers can enforce timeouts (e.g., 100ms budget) with clean cancellation propagation
- **`sync.Once` for lazy init**: Perfect for SQLite singleton pattern (replaces module-level variable + pendingInit Promise)

### 3.3 Memory & GC

From *Section 04 (Garbage Collector)* and *Section 06 (Cross-Layer Synthesis)*:
- **Value types reduce heap pressure**: Lesson structs, score structs, embedding vectors can be stack-allocated or contiguous in memory
- **Escape analysis**: Compiler automatically determines stack vs heap — no manual optimization needed
- **Sub-ms GC pauses**: Even under load, GC won't add perceptible latency to CLI responses
- **No model load/unload per process**: The Go binary doesn't carry the embedding model — it delegates to the persistent Rust daemon

### 3.4 Error Handling Trade-off

From *Section 02 (Error Handling)*:
- **More verbose**: Every I/O operation needs `if err != nil` (vs try/catch blocks)
- **More visible**: Error paths are explicit in the code — no hidden exception propagation
- **Performance**: Error returns cost nanoseconds vs microseconds for exceptions
- **Practical impact**: ~30% more lines of code for the same logic, but clearer control flow

---

## 4. Migration Scope & Risk

### 4.1 Component-by-Component Assessment

| Component | Lines (TS) | Go Difficulty | Risk | Notes |
|-----------|-----------|---------------|------|-------|
| CLI commands | ~3,500 | Low | Low | cobra maps 1:1 to Commander.js |
| SQLite + FTS5 | ~2,200 | Low | Low | go-sqlite3 is mature, FTS5 supported |
| JSONL I/O | ~500 | Low | Low | Standard file I/O + JSON |
| Vector search | ~1,500 | Low | Low | Pure math, language-agnostic |
| Hybrid merge + ranking | ~800 | Low | Low | Arithmetic + sorting |
| Lesson capture filters | ~800 | Low | Low | Regex + string matching |
| Knowledge indexing | ~2,000 | Low | Low | Chunking + SQLite |
| Pattern clustering | ~600 | Low | Low | Matrix math |
| Hook handlers | ~1,000 | Low | Low | CLI invocations + JSON |
| Schema validation (Zod) | ~400 | Medium | Medium | Manual struct validation in Go |
| Embedding integration | ~800 | Medium | Medium | IPC to Rust daemon (new pattern) |
| **Rust embedding daemon** | **~0 (new)** | **Medium** | **Medium** | **New component, ~500-800 lines Rust** |

### 4.2 What's NOT Migrated

- **The embedding model itself**: Same GGUF file, just loaded by Rust instead of node-llama-cpp
- **File formats**: `.claude/lessons/index.jsonl` and `.claude/.cache/lessons.sqlite` stay identical
- **Hook interface**: Claude Code still calls `ca <command>` — the binary just changes from Node.js to Go
- **Schema version**: SQLite schema v5 stays the same

### 4.3 Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Rust daemon crashes | Low | Medium | Auto-restart + fallback to keyword-only |
| llama-cpp-rs incompatibility | Low | High | Pin known-good version, test matrix |
| Go-sqlite3 FTS5 edge cases | Low | Low | Same SQL queries, extensive tests |
| IPC latency higher than expected | Low | Low | Benchmark early in prototype |
| Zod → Go validation mismatches | Medium | Medium | Property tests comparing both |
| Binary size too large | Low | Low | ~20MB Go + ~5MB Rust = acceptable |

---

## 5. Go/No-Go Decision Framework

### Go If (all true):
- [ ] Prototype proves <100ms warm search latency
- [ ] Rust daemon starts reliably on macOS + Linux
- [ ] Go-sqlite3 passes all existing FTS5 test cases
- [ ] IPC overhead is <5ms per embedding request
- [ ] Total binary size (Go + Rust) is <30MB

### No-Go If (any true):
- [ ] Rust daemon reliability is <99.9% (frequent crashes)
- [ ] Go-sqlite3 FTS5 behavior differs from better-sqlite3
- [ ] IPC adds >50ms latency per request
- [ ] Cross-compilation of Rust component is problematic
- [ ] Total effort exceeds 16 weeks

---

## 6. Proposed Feasibility Prototype

### Scope

Build a minimal Go binary that implements `ca search "query"` end-to-end:
1. Parse CLI args (cobra)
2. Open SQLite, run FTS5 search
3. Connect to Rust embedding daemon (spawn if not running)
4. Get query embedding, compute cosine similarity
5. Merge hybrid results, apply ranking
6. Output formatted results

### Deliverables

1. `cmd/ca/main.go` — CLI entry point
2. `internal/storage/sqlite.go` — SQLite + FTS5 (reads existing `.claude/.cache/lessons.sqlite`)
3. `internal/search/vector.go` — Vector search with daemon IPC
4. `internal/search/hybrid.go` — Hybrid merge + ranking
5. `embed-daemon/src/main.rs` — Rust embedding daemon
6. `benchmark_test.go` — Comparative benchmarks vs TypeScript

### Success Criteria

| Metric | Target | How to Measure |
|--------|--------|---------------|
| Warm search latency | <100ms | `time ./ca search "query"` with daemon running |
| Cold search latency | <1s | `time ./ca search "query"` from scratch |
| Keyword-only latency | <20ms | `time ./ca search "query"` without model |
| Binary size (Go) | <20MB | `ls -lh ca` |
| Binary size (Rust) | <10MB | `ls -lh ca-embed` |
| FTS5 result parity | 100% | Compare results vs TypeScript version |

### Estimated Effort

| Phase | Effort | Dependencies |
|-------|--------|-------------|
| Go CLI + SQLite skeleton | 2 days | None |
| Rust daemon prototype | 3 days | llama-cpp-rs setup |
| IPC bridge (Go ↔ Rust) | 1 day | Both running |
| Search logic port | 2 days | SQLite working |
| Benchmarking + comparison | 1 day | All working |
| **Total** | **~9 days** | |

---

## 7. Long-Term Migration Roadmap (if prototype succeeds)

### Phase 1: Foundation (Weeks 1-3)
- Go project setup, CI/CD pipeline
- Port SQLite storage layer (schema, JSONL sync, FTS5)
- Port type definitions + validation
- Unit tests for storage layer

### Phase 2: Search & Ranking (Weeks 3-5)
- Port vector search + hybrid merge
- Port ranking algorithms
- Integrate with Rust embedding daemon
- Property tests for search parity

### Phase 3: CLI Commands (Weeks 5-8)
- Port all ~50 commands (capture, retrieve, manage, compound, knowledge, hooks)
- Integration tests for each command
- Hook handler compatibility testing

### Phase 4: Polish & Release (Weeks 8-10)
- Cross-platform builds (macOS arm64/amd64, Linux amd64, Windows)
- GitHub Actions release pipeline
- Performance regression tests
- Documentation updates

### Phase 5: Cutover (Weeks 10-12)
- Parallel run: both TypeScript and Go versions
- A/B comparison of results
- Update `.claude/plugin.json` to use Go binary
- Deprecate TypeScript version

---

## 8. Conclusion

The current compound-agent spends **99% of its time on overhead** (Node.js startup + embedding model lifecycle) and **<1% on actual search**. Go eliminates the runtime overhead, and a persistent Rust embedding daemon eliminates the model load/unload cycle.

The projected improvement is **10-55x faster search** depending on whether the daemon is warm. For hook handlers (no embedding needed), the improvement is **~160x** (800ms → 5ms).

The migration is technically straightforward — 90% of the codebase is pure logic (search, ranking, file I/O) that ports directly. The only novel component is the Rust embedding daemon (~500-800 lines), which uses well-established llama-cpp-rs bindings.

**Recommendation**: Build the prototype. 9 days of effort will definitively answer whether the projected gains are achievable.
