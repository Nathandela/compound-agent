# ADR-002: Local Embeddings

**Status**: Superseded (see ADR-002b below)

**Original Date**: 2026-01-30
**Superseded Date**: 2026-03-18

---

## ADR-002b: Transformers.js for Local Embeddings (Supersedes ADR-002a)

**Status**: Accepted

**Date**: 2026-03-18

### Context

The original node-llama-cpp implementation (ADR-002a below) caused critical memory pressure:
- ~400MB RSS per embedding operation
- dispose() leaked ~100-270MB per call
- Native ONNX bindings caused SIGABRT when workers were disposed concurrently

### Decision

Replace node-llama-cpp with `@huggingface/transformers` (Transformers.js) using the
nomic-embed-text-v1.5 model in 8-bit ONNX format.

- Model downloaded to `@huggingface/transformers` package-local `.cache/` on first use
- ~23MB RAM when loaded (95% reduction from previous ~400MB)
- Pure JavaScript ONNX runtime via onnxruntime-node (no native compilation required)
- Embeddings remain locally generated — no network requests after initial download

### Consequences

#### Positive

- ~95% memory reduction (400MB → 23MB)
- No native compilation during install
- Works offline after initial model download
- Privacy preserved (lessons never sent externally)
- singleFork vitest pool prevents SIGABRT on worker disposal

#### Negative

- Model stored in package-local directory (varies per pnpm installation)
- ~500MB model download on first use
- onnxruntime-node still requires postinstall step

---

## ADR-002a: node-llama-cpp for Local Embeddings (Original — Superseded)

**Status**: Superseded by ADR-002b

**Date**: 2026-01-30

### Context

Semantic search requires vector embeddings. The system should work offline without external API dependencies.

### Decision

Use node-llama-cpp with nomic-embed-text-v1.5 for local embedding generation.

- Model downloaded to `~/.cache/compound-agent/models/` on first use
- No online fallback; embedding failures cause hard errors
- Embeddings cached in SQLite by content hash

### Why Superseded

node-llama-cpp caused ~400MB RSS per embedding operation with significant dispose leaks.
See ADR-002b for the replacement decision.

### Alternatives Considered

#### Cloud Embedding APIs (OpenAI, Cohere)

Fast and high-quality but requires API keys and internet. Rejected for offline-first requirement.

#### Hybrid with API Fallback

More robust but adds complexity and external dependency. Rejected to keep system simple.
