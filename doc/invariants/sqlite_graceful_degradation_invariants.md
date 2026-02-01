# Invariants for SQLite Graceful Degradation

## Problem Statement

When learning-agent is installed as a dependency in another project, better-sqlite3 may fail to load due to native binding compilation issues. This failure currently crashes the application.

**Proposed Solution**: Graceful degradation to JSONL-only mode when SQLite is unavailable.

## Module Scope

**Affected files:**
- `src/storage/sqlite.ts` - All SQLite operations (must detect and handle unavailability)
- `src/storage/index.ts` - Public API exports (may need mode detection)
- `src/search/vector.ts` - Embedding cache (uses `getCachedEmbedding`, `setCachedEmbedding`)
- `src/commands/retrieval.ts` - Search commands (uses `searchKeyword`, `syncIfNeeded`)
- `src/commands/management.ts` - Stats/rebuild commands (uses `rebuildIndex`, `getRetrievalStats`)

---

## Data Invariants

### 1. JSONL as Source of Truth
- **Invariant**: JSONL file (`.claude/lessons/index.jsonl`) is ALWAYS the authoritative data store
- **Type**: `Lesson[]` (after deduplication)
- **Constraints**:
  - Never null or corrupted
  - Must be readable even when SQLite unavailable
  - Append-only write pattern preserved
- **Rationale**: SQLite is a cache/index only; JSONL loss = data loss, SQLite loss = performance loss only

### 2. SQLite Availability State
- **Invariant**: System state is EITHER `sqlite_available` OR `jsonl_only`
- **Type**: Boolean (implicit, not stored)
- **Constraints**:
  - Determined at module initialization time (first `require('better-sqlite3')`)
  - Does NOT change during process lifetime
  - Graceful detection (try/catch on require)
- **Rationale**: Native modules either load or don't; no runtime state changes

### 3. Embedding Cache Coherence
- **Invariant**: Embeddings cached in SQLite are ALWAYS tied to content hash
- **Type**: `{ lessonId: string, embedding: Float32Array, hash: string }`
- **Constraints**:
  - If SQLite unavailable: embedding cache = empty (recompute every time)
  - If SQLite available but embedding missing: compute and cache
  - Cache misses never cause failures (degrade to computation)
- **Rationale**: Embeddings are expensive but deterministic; cache is performance optimization only

### 4. Retrieval Statistics Persistence
- **Invariant**: Retrieval counts (`retrievalCount`, `lastRetrieved`) are optional metadata
- **Type**: `number | undefined` and `string (ISO 8601) | undefined`
- **Constraints**:
  - If SQLite unavailable: statistics NOT tracked (acceptable loss)
  - If SQLite available: statistics tracked and persisted
  - Statistics absence never prevents lesson retrieval
- **Rationale**: Statistics are analytical data, not functional requirements

---

## Safety Properties (Must NEVER Happen)

### 1. No Data Loss on SQLite Failure
- **Property**: better-sqlite3 failure NEVER causes lesson data to be lost or inaccessible
- **Why**: Users may record critical lessons; losing them due to native module issues is unacceptable
- **Test Strategy**:
  - Property test: Mock `require('better-sqlite3')` to throw error
  - Verify `readLessons(repoRoot)` still returns all lessons from JSONL
  - Verify `appendLesson(repoRoot, lesson)` still writes to JSONL

### 2. No Silent Failures
- **Property**: SQLite unavailability is NEVER silently ignored without user awareness
- **Why**: Users should know they're in degraded mode (no caching, no stats)
- **Test Strategy**:
  - Verify warning logged exactly once on first SQLite operation attempt
  - Verify `stats` command explicitly states "SQLite unavailable" if in JSONL-only mode
  - Property test: Mock require failure, check stderr/console.warn output

### 3. No Partial Write to SQLite
- **Property**: SQLite write operations are NEVER partially successful (transaction atomicity)
- **Why**: Partial writes corrupt the index; must be all-or-nothing
- **Test Strategy**:
  - If SQLite available: Use transactions for multi-row inserts (already implemented)
  - If SQLite unavailable: No SQLite writes attempted (bypass entirely)
  - Property test: Simulate crash during `rebuildIndex`, verify index is empty or complete (not partial)

### 4. No False Positive on Search
- **Property**: Search/retrieval NEVER returns lessons that don't match the query
- **Why**: Wrong lessons in context waste tokens and mislead Claude
- **Test Strategy**:
  - When SQLite available: `searchKeyword` uses FTS5 (tested separately)
  - When SQLite unavailable: `searchKeyword` either:
    - Falls back to JSONL linear scan with simple string matching, OR
    - Returns empty array with clear "SQLite required for search" message
  - Property test: Verify no lesson returned has relevance score < threshold

### 5. No Crash on Module Load Failure
- **Property**: `require('better-sqlite3')` failure NEVER crashes the application
- **Why**: Learning agent should degrade gracefully, not break the entire CLI
- **Test Strategy**:
  - Mock `require('better-sqlite3')` to throw various errors (MODULE_NOT_FOUND, native binding error)
  - Verify all public API functions still work (may return degraded results)
  - Integration test: Install in fresh project without native build tools, verify CLI starts

---

## Liveness Properties (Must EVENTUALLY Happen)

### 1. Lesson Retrieval Completes (Always)
- **Property**: Any call to `readLessons(repoRoot)` MUST complete successfully within reasonable time
- **Timeline**: < 100ms for <1000 lessons, < 1s for <10,000 lessons
- **Monitoring Strategy**:
  - Log slow reads (>1s) as warnings
  - Property test: Verify `readLessons` completes for files up to 10MB
- **Degraded Mode**: Same guarantee applies; JSONL read is synchronous and fast

### 2. Search Returns Results (If SQLite Available)
- **Property**: `searchKeyword(repoRoot, query, limit)` MUST return results within reasonable time if SQLite operational
- **Timeline**: < 500ms for <1000 lessons (FTS5 is fast)
- **Monitoring Strategy**: Log slow searches (>1s) as warnings
- **Degraded Mode**:
  - If SQLite unavailable: Either return empty array quickly with warning, OR
  - Fall back to slower JSONL linear scan (< 5s for <10,000 lessons)

### 3. Embedding Cache Rebuild Completes (If SQLite Available)
- **Property**: `rebuildIndex(repoRoot)` MUST complete successfully if SQLite operational
- **Timeline**: < 10s for <1000 lessons (depends on embedding computation)
- **Monitoring Strategy**: Progress logging for large rebuilds
- **Degraded Mode**: If SQLite unavailable, function should no-op immediately (nothing to rebuild)

### 4. Stats Report Available (Best Effort)
- **Property**: `getRetrievalStats(repoRoot)` MUST return result (may be empty/degraded)
- **Timeline**: < 100ms
- **Monitoring Strategy**: N/A (synchronous query)
- **Degraded Mode**: If SQLite unavailable, return empty array or stats with note "SQLite unavailable, statistics not tracked"

---

## Edge Cases

### Scenario: SQLite Module Not Installed
- **Expected Behavior**:
  - First call to any SQLite function logs warning: "SQLite unavailable, running in JSONL-only mode"
  - All JSONL operations work normally
  - Functions that REQUIRE SQLite (FTS5 search) either degrade or return clear error
  - No crashes or exceptions propagate to CLI

### Scenario: SQLite Installed But Bindings Corrupt
- **Expected Behavior**:
  - Same as "Module Not Installed"
  - Try/catch on `openDb()` should handle initialization failures
  - Mark system as `jsonl_only` on first failure

### Scenario: JSONL Exists, SQLite DB Missing
- **Expected Behavior**:
  - If SQLite available: Lazy initialization on first `openDb()` call
  - `syncIfNeeded()` detects mtime mismatch, triggers `rebuildIndex()`
  - System operates normally
- **No Special Handling Needed**: This is normal state for fresh repos

### Scenario: JSONL Exists, SQLite DB Corrupt
- **Expected Behavior**:
  - `openDb()` fails to open database file
  - System logs warning: "SQLite database corrupt, deleting and rebuilding"
  - Delete `.claude/.cache/lessons.sqlite`
  - Trigger `rebuildIndex()` from JSONL
- **Fallback**: If rebuild fails, degrade to JSONL-only mode

### Scenario: JSONL Exists, SQLite DB Stale (mtime mismatch)
- **Expected Behavior**:
  - `syncIfNeeded()` compares JSONL mtime to `last_sync_mtime` in metadata table
  - If JSONL newer: trigger `rebuildIndex()` to sync
  - This is normal operation (already implemented)

### Scenario: Empty JSONL File (No Lessons Yet)
- **Expected Behavior**:
  - `readLessons(repoRoot)` returns `{ lessons: [], skippedCount: 0 }`
  - `rebuildIndex()` creates empty SQLite tables (schema only)
  - `searchKeyword()` returns `[]`
  - No warnings or errors

### Scenario: JSONL Missing (New Repo)
- **Expected Behavior**:
  - `readLessons(repoRoot)` returns `{ lessons: [], skippedCount: 0 }` (ENOENT handled)
  - First `appendLesson()` creates directory structure and file
  - No SQLite operations until lessons exist

### Scenario: Vector Search Requires Embeddings
- **Expected Behavior**:
  - `searchVector()` in `src/search/vector.ts` calls `getCachedEmbedding()`
  - If SQLite unavailable: Cache always misses, embeddings computed fresh every time
  - Performance degradation acceptable (vector search is opt-in, embedding model is local)

### Scenario: User Runs `stats` Command in Degraded Mode
- **Expected Behavior**:
  ```
  Statistics:
    Total lessons: 42
    Confirmed: 38
    SQLite: unavailable (retrieval statistics not tracked)
  ```
  - No crash, clear message about degraded state

### Scenario: User Runs `search` Command in Degraded Mode
- **Expected Behavior**:
  - If keyword search (`searchKeyword`): Either
    - Option A: Return error: "Keyword search requires SQLite (FTS5). Use --vector for semantic search."
    - Option B: Fall back to JSONL linear scan with simple string matching (slower but functional)
  - If vector search (`searchVector`): Works normally, just slower (no embedding cache)

---

## Implementation Guidance

### Detection Strategy
```typescript
// src/storage/sqlite.ts
let sqliteAvailable: boolean | null = null;

function detectSqliteAvailability(): boolean {
  if (sqliteAvailable !== null) return sqliteAvailable;

  try {
    require('better-sqlite3');
    sqliteAvailable = true;
  } catch (err) {
    console.warn('SQLite unavailable, running in JSONL-only mode');
    sqliteAvailable = false;
  }

  return sqliteAvailable;
}
```

### Function Degradation Patterns

**Pattern 1: No-op when unavailable** (for cache/optimization functions)
```typescript
export function setCachedEmbedding(...args): void {
  if (!detectSqliteAvailability()) return; // silent no-op
  // ... actual implementation
}
```

**Pattern 2: Return empty/default when unavailable** (for query functions)
```typescript
export function getRetrievalStats(repoRoot: string): RetrievalStat[] {
  if (!detectSqliteAvailability()) return []; // empty stats
  // ... actual implementation
}
```

**Pattern 3: Throw clear error when no fallback possible** (for required features)
```typescript
export async function searchKeyword(repoRoot: string, query: string, limit: number): Promise<Lesson[]> {
  if (!detectSqliteAvailability()) {
    throw new Error('Keyword search requires SQLite (FTS5). Install native build tools or use vector search.');
  }
  // ... actual implementation
}
```

### Testing Strategy

**Unit Tests:**
- Mock `require('better-sqlite3')` to throw errors
- Verify each public function handles degradation correctly
- Verify warning logged exactly once

**Integration Tests:**
- Set up test environment without better-sqlite3 installed
- Run full CLI command suite
- Verify no crashes, appropriate degradation messages

**Property Tests (fast-check):**
- Generate random lesson sets
- Verify JSONL operations work regardless of SQLite state
- Verify data loss never occurs

---

## Open Questions

1. **Should keyword search degrade to linear scan, or hard-fail?**
   - Option A: Degrade to simple string matching (slower, less accurate)
   - Option B: Hard-fail with clear error message (forces user to install SQLite or use vector search)
   - **Recommendation**: Option B (simpler, clearer expectations)

2. **Should we pre-warn users during installation?**
   - Could add postinstall script to check if better-sqlite3 loaded
   - **Recommendation**: No, postinstall scripts are invasive; runtime detection is sufficient

3. **Should `rebuildIndex()` be exposed publicly in degraded mode?**
   - Currently exported from `src/storage/index.ts`
   - **Recommendation**: Keep exported, make it a no-op with warning in degraded mode

4. **Should embedding cache absence affect vector search accuracy?**
   - No - embeddings are deterministic; cache only affects performance
   - **Decision**: Document performance impact, but guarantee correctness

---

## Success Criteria

### Functional Requirements
- [ ] All JSONL operations work regardless of SQLite availability
- [ ] No crashes on better-sqlite3 load failure
- [ ] Clear warning logged when running in degraded mode
- [ ] `stats` command shows SQLite status explicitly

### Performance Requirements
- [ ] JSONL read time unchanged (< 100ms for <1000 lessons)
- [ ] Vector search still works (slower without cache, but functional)
- [ ] No performance regression when SQLite IS available

### Testing Requirements
- [ ] Unit tests for all degradation paths
- [ ] Integration test with better-sqlite3 mocked to fail
- [ ] Property tests verify data integrity regardless of mode

### Documentation Requirements
- [ ] README updated with SQLite optional note
- [ ] RESOURCE_LIFECYCLE.md updated with degradation behavior
- [ ] Error messages are actionable (tell user how to fix)
