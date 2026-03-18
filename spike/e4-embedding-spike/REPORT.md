# E4: Go Embedding Spike — Decision Report

> **Date**: 2026-03-18
> **Epic**: learning_agent-6zbe
> **Platform**: darwin-arm64, Node.js v25.2.1, Apple M3

## Benchmark Results

| Candidate | RSS Delta (MB) | Cold Start (ms) | Avg Query (ms) | Dims | Cosine Sim vs Baseline |
|-----------|---------------|-----------------|----------------|------|----------------------|
| **node-llama-cpp (baseline)** | 431.4 | 440 | 9.0 | 768 | — |
| llama-embedding CLI | 0.0 (parent) | 7,828 | 571.6 | 768 | 1.000000 |
| **Transformers.js (nomic-embed-text-v1.5)** | **22.7** | **140*** | **5.9** | 768 | ~0.02 (different model, different vector space — expected) |
| llama-server (HTTP) | 230.4 | 643 | 10.6 | 768 | 1.000000 |
| Go + go-llama.cpp (CGo) | N/A | N/A | N/A | N/A | Build failed |

**Notes on RSS Delta:**
- RSS delta measures memory added to the Node.js parent process only
- For subprocess candidates (llama-cli, llama-server), the subprocess consumes its own memory (~300-430 MB) not reflected in these numbers
- Total system memory is NOT reduced by subprocess approaches — they shift memory, not eliminate it

### Benchmark Limitations

- **Sample size**: Only 5 queries per candidate, no variance/stddev reported. Results are indicative, not statistically rigorous.
- **Transformers.js cold-start**: The pre-flight model availability check warms the OS disk cache before the measured cold-start run. A true first-run (no disk cache) would be slower. The 140ms figure represents a warm-cache cold-start.
- **Query 0 double-embed**: The harness embeds TEST_QUERIES[0] during cold-start measurement, then re-embeds it in the warm loop. This gives query 0 a slight warm-cache advantage in the per-query average.
- **Different model comparison**: Transformers.js uses nomic-embed-text-v1.5 (137M params) vs EmbeddingGemma-300M (300M params). Some memory/speed advantage may reflect smaller model size, not just runtime differences.
- **No `--expose-gc`**: Benchmarks were run without `--expose-gc`, so RSS deltas may include uncollected garbage.

## Vector Compatibility

### Same-model candidates (cosine_sim = 1.000000)
- **llama-embedding CLI**: Identical vectors — same C++ runtime, same model file
- **llama-server HTTP**: Identical vectors — same C++ runtime, same model file

### Different-model candidate
- **Transformers.js (nomic-embed-text-v1.5)**: cosine_sim ≈ 0.02 — completely different vector space. Would require re-embedding all existing lessons (~50 lessons, one-time cost).

## Candidate Analysis

### 1. Transformers.js + onnxruntime-node (RECOMMENDED)

**Strengths:**
- 95% memory reduction (22.7 MB vs 431.4 MB)
- 34% faster queries (5.9ms vs 9.0ms)
- 68% faster cold start (140ms vs 440ms)
- No native C++ addon lifecycle issues (no SIGABRT, no dispose leaks)
- Clean resource management via GC
- 768 dimensions (same as current)
- Excellent API: `pipeline('feature-extraction', model)` handles tokenization

**Weaknesses:**
- Different model = different vector space. All existing embeddings must be re-computed
- Uses ONNX format, not GGUF (no model format compatibility)
- nomic-embed-text-v1.5 is a different model than EmbeddingGemma-300M (but well-regarded quality, 137M params)

**Migration cost:**
- Re-embed ~50 existing lessons (automated, one-time, < 1 minute)
- Change embedText() to use Transformers.js pipeline instead of node-llama-cpp
- Remove node-llama-cpp dependency (~150-200 MB npm savings)

### 2. llama-server (HTTP subprocess)

**Strengths:**
- Perfect vector compatibility (cosine_sim = 1.000000)
- 47% memory reduction in Node.js process (server manages its own memory)
- No re-embedding needed
- Same model, same quality

**Weaknesses:**
- 230 MB RSS still consumed (in subprocess)
- Need to manage server lifecycle (start, health check, stop)
- Network overhead for HTTP requests (minimal but present)
- Still depends on llama.cpp binary (platform-specific distribution)
- llama-server needs to be installed separately (brew install llama.cpp)

### 3. llama-embedding CLI (subprocess per query)

**Strengths:**
- Zero parent process memory (0.0 MB delta)
- Perfect vector compatibility
- Simplest implementation

**Weaknesses:**
- 571.6ms per query (63x slower due to cold start each call)
- Unacceptable for interactive use

### 4. Go + CGo (NOT VIABLE)

**Build failure:** `go-skynet/go-llama.cpp` requires vendored llama.cpp C/C++ headers that aren't included. Building requires:
- Cloning llama.cpp source at compatible version
- Setting up CGo include paths
- CGo cross-compilation toolchain for each platform

**Assessment:** Prohibitively complex for the marginal benefit over llama-server. The purego alternative (dianlight/gollama.cpp) exists but is immature and shifts complexity to runtime shared library management.

## Gate B Decision

**Recommendation: Switch to Transformers.js + onnxruntime-node (lighter TS runtime)**

Rationale:
1. **18x memory reduction** is the primary project goal (embedding memory pressure)
2. **Faster queries** — no regression
3. **Eliminates all native C++ addon issues** that caused E1 (dispose leaks, SIGABRT, import graph coupling)
4. **One-time re-embedding cost** is trivial (~50 lessons, < 1 minute)
5. **Removes node-llama-cpp dependency** — the root cause of all memory pressure issues
6. Go path is not viable without significant tooling investment

### What about vector compatibility?
The re-embedding requirement is acceptable because:
- Lesson count is small (~50)
- Re-embedding is automated (just clear the embedding cache, prewarm regenerates)
- The quality of nomic-embed-text-v1.5 is well-established (768 dims, strong benchmarks)
- No external consumers depend on our vector format

### Impact on E5 (Go Embedding Implementation)
**E5 should be CANCELLED.** Transformers.js achieves the memory reduction goal without any Go dependency. The Go path adds complexity (binary distribution, platform support) for inferior results.

## Validation Log

| ID | Phase | Hypothesis | Method | Result | Impact |
|----|-------|-----------|--------|--------|--------|
| V1 | Explore | node-llama-cpp uses ~400MB RSS | Benchmark | 431.4 MB — confirmed | Baseline established |
| V2 | Explore | Transformers.js can produce 768-dim embeddings | Benchmark | Yes, nomic-embed-text-v1.5 = 768 dims | Compatible dimensions |
| V3 | Work | Same-model alternatives have cosine_sim > 0.999 | Benchmark | 1.000000 for llama-cli and llama-server | Perfect compatibility |
| V4 | Work | Different-model has cosine_sim > 0.995 | Benchmark | ~0.02 — REJECTED | Requires re-embedding |
| V5 | Work | Go CGo bindings build on darwin-arm64 | Build attempt | FAILED — missing headers | Go path not viable |
| V6 | Work | Transformers.js RSS < 150 MB | Benchmark | 22.7 MB — far exceeds target | Clear winner |

## How to Reproduce

```bash
# Prerequisites
brew install llama.cpp          # for llama-embedding and llama-server benchmarks
pnpm add -D @huggingface/transformers  # for Transformers.js benchmark (temporary)

# Run all benchmarks
npx tsx spike/e4-embedding-spike/run-all.ts

# Run individual benchmarks
npx tsx spike/e4-embedding-spike/bench-node-llama.ts
npx tsx spike/e4-embedding-spike/bench-llama-cli.ts
npx tsx spike/e4-embedding-spike/bench-llama-server.ts
npx tsx spike/e4-embedding-spike/bench-transformers-js.ts

# For more accurate RSS measurements, use --expose-gc:
node --expose-gc node_modules/.bin/tsx spike/e4-embedding-spike/run-all.ts

# Clean up after running
pnpm remove @huggingface/transformers  # remove spike dependency
```

**Note:** The embedding model (~278 MB) must be downloaded first: `npx ca download-model`
