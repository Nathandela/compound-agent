# Invariants for Auto-Sync SQLite After CLI Mutations

## Module Overview

**Purpose**: Ensure SQLite index stays synchronized with JSONL source of truth after every CLI mutation command.

**Affected Commands**:
- `learn` - Creates new lesson via appendLesson
- `capture` - Creates lesson from trigger/insight or detection
- `update` - Modifies existing lesson (future)
- `delete` - Marks lesson as deleted (future)
- `import` - Bulk imports lessons (syncs once at end)

**Current Behavior**:
- appendLesson() writes to JSONL only
- SQLite requires explicit rebuildIndex() or syncIfNeeded()
- Manual JSONL edits never sync until explicit command

**Proposed Behavior**:
After every mutation, automatically call syncIfNeeded() to update SQLite index.

---

## Data Invariants

### DI-1: JSONL is Source of Truth
- **Property**: JSONL file at `.claude/lessons/index.jsonl` is the authoritative data source
- **Constraint**: SQLite database at `.claude/.cache/lessons.sqlite` is a derived index
- **Rationale**: Git tracks JSONL; SQLite is rebuildable cache (.gitignore)

### DI-2: Mtime-Based Sync Detection
- **Property**: `metadata.last_sync_mtime` stores the mtime of JSONL at last sync
- **Constraint**: syncIfNeeded compares current JSONL mtime with stored mtime
- **Rationale**: Efficient detection of JSONL changes without content scanning

### DI-3: Embedding Cache Preservation
- **Property**: Embeddings cached in SQLite with content_hash (SHA-256 of "trigger insight")
- **Constraint**: rebuildIndex preserves embeddings when content_hash matches
- **Rationale**: Avoid expensive re-computation of embeddings

### DI-4: Single Mutation Per CLI Command
- **Property**: Each CLI command (learn, capture) appends exactly one lesson
- **Constraint**: `import` is the only command that appends multiple lessons
- **Rationale**: Performance optimization - single lesson sync is fast

---

## Safety Properties (Must NEVER Happen)

### SP-1: No Stale SQLite Reads After Mutation
- **What**: After appendLesson completes, SQLite index must reflect the new lesson
- **Why**: Commands like `search` query SQLite; stale index returns incomplete results
- **Test Strategy**:
  - Property test: learn + search must find the new lesson
  - Race condition test: concurrent learn + search
  - Verification: Check metadata.last_sync_mtime updated

### SP-2: No Data Loss on Sync Failure
- **What**: If syncIfNeeded fails, JSONL data must remain intact
- **Why**: JSONL is source of truth; SQLite failure cannot corrupt lessons
- **Test Strategy**:
  - Mock rebuildIndex to throw error
  - Verify JSONL file unchanged
  - Verify no partial SQLite state

### SP-3: No Double-Sync on Import
- **What**: `import` command must sync once at end, not per-lesson
- **Why**: Performance - N lessons should trigger 1 sync, not N syncs
- **Test Strategy**:
  - Mock syncIfNeeded to count calls
  - Import 100 lessons
  - Assert syncIfNeeded called exactly 1 time

### SP-4: No Sync When JSONL Unchanged
- **What**: syncIfNeeded must skip rebuild when mtime matches
- **Why**: Performance - avoid expensive operations when no changes
- **Test Strategy**:
  - Mock rebuildIndex to count calls
  - Call syncIfNeeded twice without JSONL mutation
  - Assert rebuildIndex called 0 times on second call

### SP-5: No Embedding Loss on Sync
- **What**: rebuildIndex must preserve cached embeddings when content unchanged
- **Why**: Embeddings are expensive to compute (semantic model inference)
- **Test Strategy**:
  - Create lesson with embedding cached
  - Append different lesson (triggers sync)
  - Verify first lesson's embedding preserved in SQLite

---

## Liveness Properties (Must EVENTUALLY Happen)

### LP-1: Sync Completes Within Timeout
- **What**: syncIfNeeded must complete within 5 seconds for single-lesson mutations
- **Timeline**: p95 < 5s for databases with <10,000 lessons
- **Monitoring Strategy**: Log slow syncs; warn if >5s
- **Test Strategy**:
  - Create database with 1,000 lessons
  - Measure syncIfNeeded duration
  - Assert p95 < 5s

### LP-2: Sync Happens Before Command Completion
- **What**: After CLI mutation, syncIfNeeded must complete before command returns
- **Timeline**: Synchronous - no async fire-and-forget
- **Why**: Next command may read from SQLite (search, list)
- **Test Strategy**:
  - learn + search in sequence
  - Assert search finds the new lesson
  - No setTimeout or async gaps

### LP-3: Import Syncs Within Reasonable Time
- **What**: `import` command syncs once at end, even for large batches
- **Timeline**: p95 < 10s for 1,000 lessons
- **Monitoring Strategy**: Log import duration; warn if >10s
- **Test Strategy**:
  - Import 1,000 lessons
  - Measure total duration
  - Assert sync happens once at end

---

## Edge Cases

### EC-1: Empty JSONL File
- **Scenario**: JSONL exists but is empty (0 bytes)
- **Expected**: syncIfNeeded succeeds; SQLite has 0 lessons; mtime updated
- **Test**: Create empty JSONL, call syncIfNeeded, verify metadata.last_sync_mtime set

### EC-2: Missing JSONL File
- **Scenario**: JSONL file does not exist (first command in new repo)
- **Expected**: appendLesson creates file; syncIfNeeded skips (mtime null check)
- **Test**: Delete JSONL, call learn, verify file created and sync occurs

### EC-3: Corrupted JSONL Line
- **Scenario**: JSONL has 1 valid + 1 invalid JSON line
- **Expected**: rebuildIndex skips invalid line (readLessons behavior); SQLite has 1 lesson
- **Test**: Manually corrupt JSONL, call syncIfNeeded, verify 1 lesson in SQLite

### EC-4: SQLite Database Missing
- **Scenario**: SQLite file deleted manually; JSONL intact
- **Expected**: openDb creates new database; rebuildIndex populates from JSONL
- **Test**: Delete SQLite, call search, verify database recreated with all lessons

### EC-5: JSONL Modified Externally
- **Scenario**: User manually edits JSONL file outside CLI
- **Expected**: Next CLI command triggers syncIfNeeded (mtime changed); SQLite reflects edits
- **Test**: Manually append lesson to JSONL, call search, verify lesson found

### EC-6: Concurrent Mutations
- **Scenario**: Two CLI processes append to JSONL simultaneously
- **Expected**: Both appendLesson succeed (file append is atomic on POSIX); both sync
- **Test**: Spawn 2 processes calling learn; verify both lessons in SQLite

### EC-7: Mtime Precision Issues
- **Scenario**: Filesystem mtime has low precision (e.g., 1-second granularity)
- **Expected**: syncIfNeeded uses > comparison (not >=); rebuild if mtime increases
- **Test**: Mock mtime to same value, verify no sync; increment by 1ms, verify sync

### EC-8: Import with All Duplicate IDs
- **Scenario**: Import file contains only lessons already in JSONL
- **Expected**: appendLesson skips all (ID check); syncIfNeeded still called once
- **Test**: Import existing lessons, verify sync called once with 0 new lessons

---

## Performance Constraints

### PC-1: Single-Lesson Sync is Fast
- **Constraint**: syncIfNeeded with content hash check < 100ms for small databases
- **Measurement**: Time syncIfNeeded after learn command
- **Why**: CLI must feel responsive

### PC-2: Import Bulk Sync is Proportional
- **Constraint**: Import of N lessons syncs in O(N) time, not O(N^2)
- **Measurement**: Time import for 10, 100, 1000 lessons; verify linear scaling
- **Why**: Large imports must be practical

### PC-3: Embedding Preservation is Cache-Hit
- **Constraint**: rebuildIndex with 100% cache hit (no content changes) < 500ms
- **Measurement**: rebuildIndex with all embeddings cached
- **Why**: Most syncs should be fast (only new lesson needs embedding)

---

## Implementation Notes

### Call Sites for Auto-Sync

1. **learn command** (src/cli.ts:850)
   - After: `await appendLesson(repoRoot, lesson);`
   - Add: `await syncIfNeeded(repoRoot);`

2. **capture command** (src/cli.ts:1131, 1134)
   - After: `await appendLesson(repoRoot, lesson);`
   - Add: `await syncIfNeeded(repoRoot);`

3. **detect command with --save** (src/cli.ts:1068)
   - After: `await appendLesson(repoRoot, lesson);`
   - Add: `await syncIfNeeded(repoRoot);`

4. **import command** (src/cli.ts:1272)
   - After the lesson append loop completes
   - Add: `await syncIfNeeded(repoRoot);` (once, not per-lesson)

5. **update command** (future)
   - After mutation
   - Add: `await syncIfNeeded(repoRoot);`

6. **delete command** (future)
   - After marking deleted
   - Add: `await syncIfNeeded(repoRoot);`

### Error Handling Strategy

```typescript
try {
  await appendLesson(repoRoot, lesson);
  await syncIfNeeded(repoRoot);
} catch (syncError) {
  // JSONL write succeeded but sync failed
  // Log warning but don't fail the command
  // SQLite will sync on next read (search, list)
  console.warn('SQLite sync failed (data is safe in JSONL):', syncError.message);
}
```

**Rationale**:
- JSONL is source of truth (already written)
- SQLite failure should not block lesson capture
- Lazy sync on next read operation (search, list) will eventually converge

---

## Testing Strategy

### Property Tests (fast-check)

1. **Append-Sync Idempotence**
   - Generate arbitrary lesson
   - appendLesson + syncIfNeeded
   - Verify SQLite has lesson
   - Call syncIfNeeded again (no JSONL change)
   - Verify no rebuild occurred (mock rebuildIndex)

2. **Append-Search Consistency**
   - Generate N arbitrary lessons
   - appendLesson + syncIfNeeded for each
   - Search for random keyword from lessons
   - Assert all matching lessons found

3. **Import Bulk Sync**
   - Generate N arbitrary lessons (N ∈ [1, 100])
   - Import all lessons
   - Assert syncIfNeeded called exactly once
   - Assert all lessons in SQLite

### Integration Tests

1. **learn + search**
   - CLI: `learn "insight"`
   - CLI: `search "insight"`
   - Assert: search finds the lesson

2. **capture + list**
   - CLI: `capture --trigger "t" --insight "i" --yes`
   - CLI: `list`
   - Assert: list contains the lesson

3. **import + search**
   - Create JSONL file with 10 lessons
   - CLI: `import lessons.jsonl`
   - CLI: `search <keyword>`
   - Assert: search finds imported lessons

### Unit Tests

1. **syncIfNeeded skips when unchanged**
   - Create JSONL with 1 lesson
   - Call syncIfNeeded
   - Assert rebuildIndex called
   - Call syncIfNeeded again (no JSONL change)
   - Assert rebuildIndex NOT called

2. **syncIfNeeded rebuilds when changed**
   - Create JSONL with 1 lesson
   - Call syncIfNeeded
   - Append another lesson to JSONL
   - Call syncIfNeeded
   - Assert rebuildIndex called again

---

## Verification Checklist

- [ ] appendLesson followed by syncIfNeeded in all mutation commands
- [ ] import syncs once at end, not per-lesson
- [ ] syncIfNeeded uses mtime comparison (not force rebuild)
- [ ] rebuildIndex preserves cached embeddings
- [ ] Error handling: sync failure logs warning, does not throw
- [ ] Property test: append-sync-search finds new lesson
- [ ] Integration test: learn + search succeeds
- [ ] Unit test: syncIfNeeded skips when mtime unchanged
- [ ] Performance test: single-lesson sync < 100ms
- [ ] Edge case test: empty JSONL syncs successfully
