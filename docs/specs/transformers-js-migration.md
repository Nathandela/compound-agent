# Transformers.js Embedding Migration — System Spec

> **Date**: 2026-03-18
> **Architect session**: E5 cancellation + decomposition into E5b/E5c
> **Input**: E4 spike findings (`spike/e4-embedding-spike/REPORT.md`)

## Context

E4 spike benchmarked 5 embedding runtime candidates. Gate B decision: switch to
Transformers.js + onnxruntime-node. Go path cancelled (CGo build failure, no benefit
over lighter TS runtime). See `spike/e4-embedding-spike/REPORT.md` for full data.

## System-Level EARS Requirements

| ID | Pattern | Requirement |
|----|---------|-------------|
| E1 | Ubiquitous | System SHALL use `@huggingface/transformers` with `onnxruntime-node` backend and `nomic-ai/nomic-embed-text-v1.5` model |
| E2 | Ubiquitous | `embedText`/`embedTexts` SHALL return 768-dim Float32Array (same public API) |
| E3 | Ubiquitous | RSS delta SHALL be < 50 MB when model loaded (vs current 431 MB) |
| S1 | State | When ONNX model not downloaded, system SHALL auto-download from HuggingFace Hub |
| S2 | State | When cached embeddings from old provider exist, system SHALL invalidate and re-embed |
| E4 | Event | When `download-model` CLI invoked, system SHALL pre-download ONNX model |
| E5 | Event | When `unloadEmbeddingResources()` called, system SHALL dispose pipeline and release memory |
| O1 | Optional | `isModelAvailable()` SHALL detect ONNX model without native imports (zero-native contract) |
| U1 | Unwanted | If model download fails, system SHALL report clear error (no silent fallback) |
| U2 | Unwanted | If embedding fails, system SHALL propagate error (no empty vectors) |

## Architecture

```
Consumers (vector.ts, embed-chunks.ts, prewarm.ts)
    │ embedText() / embedTexts()
    ▼
embeddings/index.ts (barrel)
    │
    ▼
embeddings/nomic.ts (singleton: pipeline init, embed, dispose)
    │ pipeline('feature-extraction', model, {dtype:'q8'})
    ▼
@huggingface/transformers + onnxruntime-node
    │
    ▼
~/.cache/huggingface/hub/ (ONNX model cache)
```

## Safety Constraints (STPA)

3 CRITICAL hazards identified — all relate to **vector space mixing**:

1. Old EmbeddingGemma vectors compared with new nomic-embed-text queries (cosine ~0.02 = garbage)
2. Content-hash cache reports stale vectors as fresh (hash is content-based, not model-based)
3. Background embed-worker could use old model during upgrade

**Defense-in-depth (3 layers)**:
- Layer 1: Schema version bump (SCHEMA_VERSION 5→6, KNOWLEDGE_SCHEMA_VERSION 2→3) — deletes DBs
- Layer 2: Model ID in contentHash() — future-proofs against model changes
- Layer 3: Runtime metadata check — embedding_model row in DB verified on open

## Epic Decomposition

| Epic | Title | Priority | Depends On |
|------|-------|----------|-----------|
| `learning_agent-vvs1` | E5b: Core Embedding Provider Swap | P1 | E4 spike (`learning_agent-6zbe`) |
| `learning_agent-rkmb` | E5c: node-llama-cpp Residue Cleanup | P2 | E5b (`learning_agent-vvs1`) |

**Processing order**: E5b first (core swap), then E5c (cleanup).

## Scenario Table

| ID | Source | Category | Precondition | Trigger | Expected |
|----|--------|----------|--------------|---------|----------|
| S1 | E1,E2 | Happy | Model downloaded | embedText("hello") | Float32Array[768] |
| S2 | E1,E2 | Happy | Model downloaded | embedTexts(["a","b"]) | Float32Array[][768] |
| S3 | S1 | Happy | Model NOT downloaded | embedText("hello") | Auto-downloads, returns vector |
| S4 | E4 | Happy | Network available | ca download-model | Pre-downloads ONNX model |
| S5 | E3 | Boundary | Model loaded | Measure RSS | < 50 MB delta |
| S6 | S2 | Happy | Old cached vectors | Search query | Invalidates, re-embeds |
| S7 | E5 | Happy | Pipeline loaded | unloadEmbeddingResources() | Disposed, memory freed |
| S8 | O1 | Boundary | ONNX model present | isModelAvailable() | true, zero native imports |
| S9 | O1 | Boundary | ONNX model absent | isModelAvailable() | false, zero native imports |
| S10 | U1 | Error | No network, no model | embedText("hello") | Clear error |
| S11 | U2 | Error | Corrupted model | embedText("hello") | Error propagated |
| S12 | E5 | Boundary | Not loaded | unloadEmbeddingResources() | No-op |
| S13 | E1 | Happy | Concurrent calls | Two embedText() | Single init (mutex) |

## Structural-Semantic Gaps (flagged)

1. `model.ts` is a semantic chimera (Provider + Model + Distribution) — will be rewritten
2. `embed-chunks.ts` and `knowledge/search.ts` bypass barrel — fix in E5b
3. Lessons DB lacks `model` column (knowledge DB has one) — schema bump handles it
4. `node-llama-cpp` string scattered across 12+ files — E5c handles cleanup
5. Tests encode provider-specific contracts (3-layer dispose, `.gguf` paths) — rewrite in E5b
