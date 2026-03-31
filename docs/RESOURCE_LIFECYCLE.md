# Resource Lifecycle Management

This document describes the heavyweight resources managed by compound-agent and best practices for cleanup.

## Overview

Compound-agent manages two resources that persist in memory:

| Resource | When Loaded | Memory Usage | Cleanup |
|----------|-------------|--------------|---------|
| SQLite Database | First DB operation | ~few KB | `db.Close()` |
| Embedding Daemon | First embedding call | Separate process (~50MB) | Exits on parent close |

Both resources use **lazy loading** - they are only acquired when first needed, not on import.

## SQLite Database

### Lifecycle

```
First DB operation     --> Database file opened, WAL mode enabled
(SearchKeyword,
 RebuildIndex, etc.)
  |
Subsequent operations  --> Reuses existing connection (singleton)
  |
db.Close()             --> Connection closed
```

### Functions That Trigger Loading

- `storage.OpenDB(repoRoot)` - Direct open
- `storage.SearchKeyword(repoRoot, query, limit)` - FTS5 search
- `storage.RebuildIndex(repoRoot)` - Rebuild from JSONL
- `storage.SyncIfNeeded(repoRoot)` - Conditional rebuild
- `storage.GetCachedEmbedding(repoRoot, lessonID)` - Cache lookup
- `storage.SetCachedEmbedding(repoRoot, lessonID, embedding, hash)` - Cache write

### Cleanup Pattern

Always call `Close()` before process exit via `defer`:

```go
db, err := storage.OpenDB(repoRoot)
if err != nil {
    return err
}
defer db.Close()

results, err := db.SearchKeyword(query, 10)
// ... process results
```

The singleton pattern handles connection reuse between operations — do not close and reopen between calls.

## Embedding Daemon

### Lifecycle

```
First embedding call   --> ca-embed daemon spawned via IPC
  |
Subsequent calls       --> Reuses running daemon (milliseconds)
  |
Parent process exits   --> Daemon exits automatically
```

### When Embeddings Load

The `ca-embed` Rust daemon is spawned on demand when vector search is needed. It communicates via Unix socket IPC. The daemon exits when the parent process closes.

### Fallback Behavior

If the embedding daemon is unavailable (model not downloaded, binary missing), search gracefully falls back to keyword-only mode. Run `ca doctor` to diagnose issues.

## What Happens Without Cleanup?

Failing to clean up will **not corrupt data**, but may cause:

| Issue | Impact |
|-------|--------|
| Open file handles | SQLite WAL files may persist longer than needed |
| Orphan processes | Embedding daemon may linger briefly |

## Best Practices Summary

1. **Use `defer db.Close()`** — Always close the database before process exit
2. **Don't close between operations** — Let the singleton pattern handle connection reuse
3. **Download model proactively** — Run `ca download-model` during setup, not on first use
4. **Embedding fallback is safe** — Missing embeddings degrade to keyword search, not errors

## Related Documentation

- [ARCHITECTURE-V2.md](./ARCHITECTURE-V2.md) - Three-layer architecture design
