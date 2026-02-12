# Invariant Documentation Framework

This directory documents invariants for core modules following Lamport's safety/liveness framework.

## Invariant Categories

### 1. Data Invariants

Properties that must ALWAYS be true about data structures at any observable point.

**Example format:**
```
D1: lesson.id matches pattern /^L[a-f0-9]{8}$/
D2: lesson.created is valid ISO8601 timestamp
```

### 2. Safety Properties

What must NEVER happen. Violations are bugs that could cause data corruption or incorrect behavior.

**Example format:**
```
S1: Lesson content must never be modified after creation
S2: Deleted lessons must never reappear in read results
```

### 3. Liveness Properties

What must EVENTUALLY happen. The system must make progress toward these states.

**Example format:**
```
L1: New lessons must eventually be indexed in SQLite
L2: Search results must eventually reflect all stored lessons
```

## Module Documentation

| Module | File | Description |
|--------|------|-------------|
| Storage (JSONL) | [storage.md](storage.md) | Append-only lesson storage |
| Storage (SQLite) | [storage.md](storage.md) | Rebuildable FTS index |
| Embeddings | [embeddings.md](embeddings.md) | Text embedding vectors |
| Search | [search.md](search.md) | Vector and ranked search |
| Capture | [capture.md](capture.md) | Quality filters and triggers |

## Testing Invariants

Each invariant should be:

1. **Testable** - Can be verified programmatically
2. **Specific** - Describes exact conditions, not vague requirements
3. **Minimal** - States one property, not compound conditions
4. **Independent** - Does not rely on implementation details

## References

- Lamport, L. "Specifying Concurrent Program Modules" (1983)
- Liskov, B. & Wing, J. "A Behavioral Notion of Subtyping" (1994)
- docs/verification/closed-loop-review-process.md
