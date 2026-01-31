# ADR-001: JSONL as source of truth with SQLite index

**Status**: Accepted

**Date**: 2026-01-30

## Context

The Learning Agent needs persistent storage for lessons. Storage must support:

- Git-friendly version control (human-readable diffs)
- Fast full-text and vector search
- Offline capability
- Recovery from corruption

## Decision

Use JSONL files as the source of truth (git-tracked) with SQLite as a rebuildable index (gitignored).

- Lessons stored in `.claude/lessons/index.jsonl`
- SQLite index in `.claude/.cache/lessons.sqlite`
- Index can be rebuilt from JSONL at any time

## Consequences

### Positive

- Git diffs show exactly what changed in lessons
- No merge conflicts on binary database files
- Index corruption is recoverable (just rebuild)
- JSONL is portable and human-readable

### Negative

- Two storage systems to maintain
- Writes require updating both JSONL and SQLite
- Index rebuild adds startup latency if cache is missing

## Alternatives Considered

### SQLite Only

Fast queries but binary diffs are unreadable. Merge conflicts on database files. Rejected due to poor git compatibility.

### JSONL Only

Simple but full-text search requires loading all lessons into memory. No efficient vector similarity. Rejected due to performance concerns.
