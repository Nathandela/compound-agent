# ADR-004: Hybrid search (keyword + vector)

**Status**: Accepted

**Date**: 2026-01-30

## Context

Lesson retrieval needs to find semantically similar content while also catching exact matches. Pure vector search can miss specific terms. Pure keyword search misses semantic relationships.

## Decision

Implement hybrid search combining SQLite FTS5 (keyword) and vector similarity.

- FTS5 for keyword/phrase matching
- Vector cosine similarity for semantic matching
- Apply ranking boosts: severity (high=1.5x), recency (30d=1.2x), confirmation (1.3x)
- Hard fail if vector search unavailable (no silent fallback)

## Consequences

### Positive

- Catches both exact terms and semantic matches
- Ranking boosts surface high-value lessons
- FTS5 provides fast keyword baseline
- Hard fail prevents silent search degradation

### Negative

- More complex than single search method
- Two search indexes to maintain
- Tuning boost weights requires experimentation

## Alternatives Considered

### Vector Only

Semantic matching is powerful but misses exact project-specific terms (API names, error codes). Rejected for missing precision.

### Keyword Only (FTS5)

Critic recommended starting here. Fast and simple but cannot find "use Polars" when searching "data processing library". Rejected because semantic search is core value.
