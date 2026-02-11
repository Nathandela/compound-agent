# ADR-002: node-llama-cpp for local embeddings

**Status**: Accepted

**Date**: 2026-01-30

## Context

Semantic search requires vector embeddings. The system should work offline without external API dependencies. Options include cloud APIs, local models, or both.

## Decision

Use node-llama-cpp with nomic-embed-text-v1.5 for local embedding generation.

- Model downloaded to `~/.cache/compound-agent/models/` on first use
- No online fallback; embedding failures cause hard errors
- Embeddings cached in SQLite by content hash

## Consequences

### Positive

- Works offline, no API keys required
- No per-request costs
- Privacy preserved (lessons never sent externally)
- Consistent embedding quality across environments

### Negative

- ~500MB model download on first use
- Native compilation may have platform issues
- Slower than API calls on underpowered machines
- No automatic model updates

## Alternatives Considered

### Cloud Embedding APIs (OpenAI, Cohere)

Fast and high-quality but requires API keys and internet. Creates external dependency. Rejected for offline-first requirement.

### Hybrid with API Fallback

More robust but adds complexity and external dependency. Rejected to keep system simple and self-contained.
