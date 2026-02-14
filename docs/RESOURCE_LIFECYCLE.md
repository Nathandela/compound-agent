# Resource Lifecycle Management

This document describes the heavyweight resources managed by compound-agent and best practices for cleanup.

## Overview

Compound-agent manages two resources that persist in memory:

| Resource | When Loaded | Memory Usage | Cleanup Function |
|----------|-------------|--------------|------------------|
| SQLite Database | First DB operation | ~few KB | `closeDb()` |
| Embedding Model | First embedding call | ~150MB RAM (~278MB on disk) | `unloadEmbedding()` |

Both resources use **lazy loading** - they are only acquired when first needed, not on import.

## SQLite Database

### Lifecycle

```
Import module          --> No database opened
  |
First DB operation     --> Database file opened, WAL mode enabled
(searchKeyword,
 rebuildIndex, etc.)
  |
Subsequent operations  --> Reuses existing connection
  |
closeDb()              --> Connection closed, ready for reopening
  |
Next DB operation      --> Reopens connection (if needed)
```

### Functions That Trigger Loading

- `openDb(repoRoot)` - Direct open (rarely needed)
- `searchKeyword(repoRoot, query, limit)` - FTS5 search
- `rebuildIndex(repoRoot)` - Rebuild from JSONL
- `syncIfNeeded(repoRoot)` - Conditional rebuild
- `getCachedEmbedding(repoRoot, lessonId)` - Cache lookup
- `setCachedEmbedding(repoRoot, lessonId, embedding, hash)` - Cache write

### When to Call closeDb()

**Always call before process exit** to ensure clean shutdown:

```typescript
import { searchKeyword, closeDb } from 'compound-agent';

async function main() {
  try {
    const results = await searchKeyword(repoRoot, 'typescript', 10);
    // ... process results
  } finally {
    closeDb();
  }
}
```

**Not necessary between operations** in the same repository - the singleton pattern handles this efficiently.

## Embedding Model

### Lifecycle

```
Import module          --> No model loaded
  |
First embedding call   --> Model loaded (~1-3 seconds, ~150MB RAM)
(embedText, embedTexts,
 searchVector, etc.)
  |
Subsequent calls       --> Reuses loaded model (milliseconds)
  |
unloadEmbedding()      --> Model disposed, memory freed
  |
Next embedding call    --> Reloads model (~2-5 seconds)
```

### Functions That Trigger Loading

- `getEmbedding()` - Direct context access
- `embedText(text)` - Single text embedding
- `embedTexts(texts)` - Batch embedding
- `searchVector(repoRoot, query, limit)` - Vector similarity search

### Memory Impact

The EmbeddingGemma-300M model requires approximately **150MB of RAM** when loaded (~278MB on disk). This is significant for:

- Memory-constrained environments
- Containers with low memory limits
- Systems running many concurrent processes

### When to Call unloadEmbedding()

**Always call before process exit** to free memory:

```typescript
import { embedText, unloadEmbedding } from 'compound-agent';

async function main() {
  try {
    const vector = await embedText('some text');
    // ... use vector
  } finally {
    unloadEmbedding();
  }
}
```

**After batch processing** in memory-constrained environments:

```typescript
// Process a batch, then free memory
const vectors = await embedTexts(batch);
// ... use vectors
unloadEmbedding(); // Free ~150MB RAM before next operation
```

## Complete Cleanup Pattern

### CLI Commands

```typescript
import {
  searchKeyword,
  closeDb,
  unloadEmbedding
} from 'compound-agent';

async function main() {
  try {
    // Your code that uses compound-agent
    const results = await searchKeyword(repoRoot, query, 10);
    // ...
  } finally {
    // Always clean up both resources
    unloadEmbedding();
    closeDb();
  }
}

main().catch(console.error);
```

### Long-Running Processes

```typescript
import { closeDb, unloadEmbedding } from 'compound-agent';

// Register shutdown handlers
function cleanup() {
  unloadEmbedding();
  closeDb();
}

process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

// Optional: cleanup on uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  cleanup();
  process.exit(1);
});
```

### Server/Daemon Pattern

```typescript
import { closeDb, unloadEmbedding } from 'compound-agent';

class CompoundAgentService {
  async start() {
    // Resources loaded lazily as needed
  }

  async stop() {
    unloadEmbedding();
    closeDb();
  }
}

// In your server shutdown logic
const service = new CompoundAgentService();

process.on('SIGTERM', async () => {
  await service.stop();
  process.exit(0);
});
```

## What Happens Without Cleanup?

Failing to clean up will **not corrupt data**, but may cause:

| Issue | Impact |
|-------|--------|
| Memory leaks | ~150MB not freed in long-running processes |
| Unclean exit | Some environments warn about open handles |
| File locks | SQLite WAL files may persist longer than needed |

## Prerequisites

### Model Download

Before first embedding call, the model must be downloaded:

```bash
# Via CLI
npx compound-agent download-model

# Or programmatically
import { resolveModel } from 'compound-agent';
await resolveModel();
```

Without the model, embedding functions will throw an error directing you to download it.

### Database Directory

The SQLite database is stored at `.claude/.cache/lessons.sqlite`. The directory is created automatically on first `openDb()` call.

## Best Practices Summary

1. **Always clean up before exit** - Call both `unloadEmbedding()` and `closeDb()` in finally blocks or shutdown handlers

2. **Don't call between operations** - Let the singleton pattern handle connection reuse

3. **Download model proactively** - Run `download-model` during setup, not on first use

4. **Monitor memory in production** - The ~150MB embedding model is significant

5. **Order matters** - Unload embedding before closing database (though either order works)

## Related Documentation

- [ARCHITECTURE-V2.md](./ARCHITECTURE-V2.md) - Three-layer architecture design
- [API documentation](../src/index.ts) - Module-level JSDoc
