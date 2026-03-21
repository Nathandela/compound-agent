# E0 Spike Results: Go+Rust Migration Validation

**Date**: 2026-03-21
**Decision**: **GO** — All 6 assumptions validated. Proceed with migration.

---

## Assumption Results

| # | Assumption | Target | Result | Status |
|---|-----------|--------|--------|--------|
| A1 | go-sqlite3 FTS5 parity | Identical results | 22/22 queries match (IDs + BM25 rank) | **PASS** |
| A2 | Vector compatibility | cosine_sim > 0.999 | cosine_sim = 1.000000 (all 49 pairs) | **PASS** |
| A3 | IPC latency < 5ms | p95 < 5ms | IPC-only p95 = 0.014ms (13.75us) | **PASS** |
| A4 | npm binary distribution | Working postinstall | esbuild pattern works on macOS | **PASS** |
| A5 | CGo only for go-sqlite3 | No other native deps | Confirmed: go-sqlite3 is the only CGo dep | **PASS** |
| A6 | ort crate loads ONNX Q8 | Model loads and runs | ort 2.0.0-rc.12 loads model successfully | **PASS** |

## Supplementary Benchmarks

| Metric | Target | Result | Status |
|--------|--------|--------|--------|
| Go binary startup (p95) | < 50ms | 28ms | **PASS** |
| Go binary size | < 20MB | 2.7MB (cobra CLI) | **PASS** |
| Go vs npx speedup | Significant | 53-75x faster | **PASS** |
| Full embed round-trip (p95) | Reasonable | 7.9ms (6.5ms inference) | OK |

## Detailed Findings

### A1: FTS5 Parity (go-sqlite3 vs better-sqlite3)
- **Method**: Imported 57 lessons into both databases, ran 22 FTS5 queries
- **Queries tested**: Simple terms, multi-term, phrase, OR, NOT, prefix, column filter, BM25 ranking, edge cases
- **Result**: All query results identical (same IDs, same BM25 ranks within float tolerance)
- **Build tag**: Requires `-tags "sqlite_fts5"` for go-sqlite3
- **Code**: `spike/e0-migration/fts5-parity/`

### A2/A6: Vector Compatibility (Rust ort vs TS Transformers.js)
- **Method**: Generated 49 reference vectors from TS, compared against Rust ort output
- **Texts**: Short phrases, technical, natural language, code, Unicode, empty string, long paragraphs
- **Result**: All 49 pairs have cosine_sim = 1.000000 (bit-identical vectors)
- **Model**: nomic-embed-text-v1.5 ONNX Q8 quantized, 768 dimensions
- **Processing**: Identical tokenization + mean pooling + L2 normalization
- **Crate**: `ort = "2.0.0-rc.12"` (release candidate, stable enough for production)
- **Code**: `spike/e0-migration/vector-compat/`

### A3: IPC Latency (Unix Domain Socket)
- **Method**: Rust server (ort + UDS) + Go client, 100 requests measured
- **IPC-only (ping)**: p50=6.8us, p95=13.8us, p99=37.8us
- **Full embed**: p50=6.5ms, p95=7.9ms (inference dominates at ~6.5ms)
- **Conclusion**: IPC adds <0.02ms overhead — negligible
- **Code**: `spike/e0-migration/ipc-bench/`

### A4: npm Binary Distribution
- **Method**: esbuild-style postinstall pattern with platform detection
- **Platform detection**: `os.platform()` + `os.arch()` from Node.js
- **Binary size**: 2.43MB (stripped Go binary with cobra)
- **Caveat**: Apple Silicon may report `darwin/amd64` in Go but `arm64` in Node.js — build script must use Node.js platform, not Go env
- **Code**: `spike/e0-migration/npm-dist/`

### A5: CGo Dependencies
- **Method**: `go list -deps -tags sqlite_fts5` dependency analysis
- **Result**: `github.com/mattn/go-sqlite3` is the only external/CGo dependency
- **Implication**: Embedding daemon (Rust) is fully native, no CGo. Only the Go CLI uses CGo via go-sqlite3.

### Go Startup Time
- **Method**: 100 runs of a cobra CLI binary (fork+exec+run+exit)
- **Static binary (CGO=0)**: p50=23.6ms, p95=28.0ms
- **CGo binary (CGO=1)**: p50=25.3ms, p95=29.4ms (negligible difference without C deps)
- **vs npx ca**: 53-75x faster (npx p50=1.3s)
- **Code**: `spike/e0-migration/startup-bench/`

## Go/No-Go Decision

### GO Criteria (from spec):
- [x] Vectors match (>0.999) — Actually 1.000000
- [x] FTS5 parity confirmed — 22/22 queries identical
- [x] IPC < 5ms — IPC-only p95 = 0.014ms
- [x] Go startup < 50ms — p95 = 28ms

### NO-GO Criteria (none triggered):
- [ ] Vectors diverge — They don't
- [ ] FTS5 results differ — They don't
- [ ] CGo unavoidable — Not needed for daemon
- [ ] IPC > 50ms — IPC is 0.014ms

## Recommendation

**Proceed with E1: Foundation.** All technical risks are mitigated. Key architecture decisions confirmed:

1. **Go for CLI** with go-sqlite3 (CGo for SQLite only)
2. **Rust for embedding daemon** with ort crate (perfect vector compatibility)
3. **Unix domain socket IPC** (negligible overhead)
4. **npm postinstall** for binary distribution (esbuild pattern)

## Risks to Monitor in E1+
- `ort` crate is at 2.0.0-rc.12 (not stable release yet) — pin version, test on updates
- Apple Silicon platform detection caveat in npm distribution
- go-sqlite3 needs `sqlite_fts5` build tag — add to build scripts/Makefiles
