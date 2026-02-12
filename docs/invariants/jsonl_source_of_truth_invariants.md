# Invariants: JSONL as Source of Truth

**Module:** Lesson Storage & Retrieval
**Files:** `src/storage/jsonl.ts`, `src/retrieval/session.ts`, `src/storage/sqlite.ts`

## Context

The compound agent stores lessons in two places:
- **JSONL file** (`.claude/lessons/index.jsonl`) - **source of truth**, git-tracked
- **SQLite database** (`.claude/.cache/lessons.sqlite`) - **rebuildable index**, gitignored

This document defines invariants that ensure JSONL remains the authoritative source.

---

## Data Invariants

### JSONL File Structure

- **Path**: `.claude/lessons/index.jsonl` (relative to repo root)
- **Format**: One valid JSON object per line (JSONL)
- **Schema**: Each line MUST validate against `LessonSchema` (Zod schema in `types.ts`)
- **Append-only**: New lessons are appended; updates/deletes append new entries with same ID
- **Deduplication**: Last write wins (by lesson ID) when parsing
- **Empty file**: Valid state (represents zero lessons)

### Lesson Data Model

**All lessons:**
- `id`: string, unique, deterministic hash of insight
- `type`: `'quick'` | `'full'`
- `trigger`: string, non-empty
- `insight`: string, non-empty
- `created`: ISO 8601 datetime string
- `confirmed`: boolean
- `deleted`: boolean (optional, absence means false)

**Full lessons only** (`type: 'full'`):
- `severity`: `'high'` | `'medium'` | `'low'` (REQUIRED for full lessons)
- `evidence`: string (optional)

**Invariant violation example:**
```jsonl
{"id": "abc", "type": "full", "insight": "...", "trigger": "...", "created": "..."}
```
☝️ INVALID: `type: 'full'` requires `severity` field

### SQLite Index

- **NOT** the source of truth (rebuilds from JSONL)
- Contains same data as JSONL after sync
- May be stale if JSONL modified externally
- May not exist (lazily created on first use)
- Can be deleted and rebuilt without data loss

---

## Safety Properties (Must NEVER Happen)

### 1. Read Operations Must Not Depend on SQLite Being Synced

**Property:** `loadSessionLessons()` and `readLessons()` MUST read from JSONL directly.

**Why:** Manual JSONL edits (git pull, merge, direct edit) must be visible immediately without requiring a rebuild.

**Test strategy:**
```typescript
test('loadSessionLessons reads from JSONL even if SQLite stale', async () => {
  // 1. Write lesson to JSONL
  await appendLesson(repo, highSeverityLesson);

  // 2. Delete SQLite database
  await fs.rm(join(repo, DB_PATH), { force: true });

  // 3. Load session lessons - should still work
  const lessons = await loadSessionLessons(repo);
  expect(lessons).toHaveLength(1);
  expect(lessons[0].severity).toBe('high');
});
```

**Current status:** ✅ PASS - Code already implements this correctly

---

### 2. Parse Errors Must Not Cause Silent Data Loss

**Property:** When JSONL contains invalid lines, the user MUST be notified (not silently skipped).

**Why:** Manual edits can introduce syntax errors. Silent skipping means user thinks lesson is saved but it's not.

**Current behavior:**
- `readLessons()` defaults to `strict: false` (skip errors silently)
- CLI commands do NOT enable error logging via `onParseError` callback

**Test strategy:**
```typescript
test('readLessons reports parse errors via callback', async () => {
  // Write valid lesson
  await appendLesson(repo, validLesson);

  // Manually append invalid JSON
  await appendFile(jsonlPath, 'invalid json\n');

  // Read with error callback
  const errors: ParseError[] = [];
  const result = await readLessons(repo, {
    onParseError: (err) => errors.push(err)
  });

  expect(result.lessons).toHaveLength(1); // Valid lesson
  expect(result.skippedCount).toBe(1);
  expect(errors).toHaveLength(1);
  expect(errors[0].line).toBe(2);
  expect(errors[0].message).toContain('Invalid JSON');
});
```

**Risk:** User manually edits JSONL, makes typo, lesson is silently ignored.

**Mitigation needed:**
- CLI should enable `onParseError` logging for `load-session` and `list` commands
- Add `--strict` flag to CLI commands that fail fast on parse errors
- Consider validating JSONL in a pre-commit hook

---

### 3. Schema Violations Must Be Detectable

**Property:** JSONL lines that fail `LessonSchema` validation MUST be reported to user.

**Why:** Manual edits might create structurally valid JSON that violates schema (e.g., `type: 'full'` without `severity`).

**Current behavior:**
- Schema validation happens inside `parseJsonLine()`
- Failures are skipped silently unless `strict: true`
- No CLI command shows which lessons failed validation

**Test strategy:**
```typescript
test('schema validation errors are reported', async () => {
  // Append lesson with type:full but no severity (schema violation)
  const invalid = {
    id: 'test',
    type: 'full',
    trigger: 'test',
    insight: 'test',
    tags: [],
    source: 'manual',
    context: {},
    created: new Date().toISOString(),
    confirmed: true,
    supersedes: [],
    related: []
  };
  await appendFile(jsonlPath, JSON.stringify(invalid) + '\n');

  const errors: ParseError[] = [];
  const result = await readLessons(repo, {
    onParseError: (err) => errors.push(err)
  });

  expect(result.skippedCount).toBe(1);
  expect(errors[0].message).toContain('Schema validation failed');
  expect(errors[0].message).toContain('severity');
});
```

**Mitigation needed:**
- Add CLI command `validate` to check JSONL integrity
- Add `--validate` flag to `load-session` that fails if parse errors exist

---

### 4. Lesson Type Guards Must Be Precise

**Property:** `isFullLesson()` must correctly distinguish full vs quick lessons.

**Why:** Only full lessons have `severity`. Filtering for `severity === 'high'` on quick lessons will always fail.

**Implementation:**
```typescript
function isFullLesson(lesson: Lesson): lesson is FullLesson {
  return lesson.type === 'full' && lesson.severity !== undefined;
}
```

**Test strategy:**
```typescript
test('quick lessons are never classified as full lessons', async () => {
  const quickLesson: Lesson = {
    id: generateId('test'),
    type: 'quick',
    trigger: 'test trigger',
    insight: 'test insight',
    tags: [],
    source: 'manual',
    context: {},
    created: new Date().toISOString(),
    confirmed: true,
    supersedes: [],
    related: []
  };

  expect(isFullLesson(quickLesson)).toBe(false);

  // Even if we force-cast to add severity (runtime error case)
  const fakeFullLesson = { ...quickLesson, severity: 'high' } as any;
  expect(isFullLesson(fakeFullLesson)).toBe(false); // type check fails
});
```

**Current status:** ✅ Correctly implemented

---

### 5. Deduplication Must Be Last-Write-Wins

**Property:** When JSONL contains multiple entries with same ID, only the last one is returned.

**Why:** Updates are appended (not in-place edits). Deletions append `{"id": "...", "deleted": true}`.

**Test strategy:**
```typescript
test('last-write-wins deduplication', async () => {
  const id = generateId('test');

  // Append v1
  await appendLesson(repo, { ...lesson, id, insight: 'version 1' });

  // Append v2 (update)
  await appendLesson(repo, { ...lesson, id, insight: 'version 2' });

  const { lessons } = await readLessons(repo);
  expect(lessons).toHaveLength(1);
  expect(lessons[0].insight).toBe('version 2');
});

test('deleted lessons are removed', async () => {
  const id = generateId('test');

  // Append lesson
  await appendLesson(repo, { ...lesson, id });

  // Append tombstone
  await appendLesson(repo, { ...lesson, id, deleted: true });

  const { lessons } = await readLessons(repo);
  expect(lessons).toHaveLength(0);
});
```

**Current status:** ✅ Correctly implemented in `readLessons()`

---

## Liveness Properties (Must EVENTUALLY Happen)

### 1. SQLite Sync Must Detect JSONL Changes

**Property:** When JSONL mtime changes, `syncIfNeeded()` MUST trigger rebuild.

**Timeline:** Before any FTS search operation

**Why:** FTS search uses SQLite index. Stale index returns wrong results.

**Test strategy:**
```typescript
test('syncIfNeeded rebuilds when JSONL modified', async () => {
  // Create initial state
  await appendLesson(repo, lesson1);
  await rebuildIndex(repo);

  // Wait to ensure mtime difference (filesystem granularity)
  await sleep(10);

  // Append new lesson
  await appendLesson(repo, lesson2);

  // Sync should detect change
  const rebuilt = await syncIfNeeded(repo);
  expect(rebuilt).toBe(true);

  // Subsequent sync should skip
  const rebuiltAgain = await syncIfNeeded(repo);
  expect(rebuiltAgain).toBe(false);
});
```

**Current status:** ✅ Implemented via mtime tracking in metadata table

**Monitoring:** Log slow syncs (rebuild time > 1s for < 1000 lessons)

---

### 2. Search Commands Must Sync Before Querying

**Property:** All SQLite-dependent commands (`search`, `check-plan`) MUST call `syncIfNeeded()` before querying.

**Timeline:** p95 latency < 500ms for < 1000 lessons (including sync time)

**Why:** Ensures fresh data even if JSONL manually edited.

**Current status:**
- ✅ `search` command calls `syncIfNeeded()` (cli.ts:851)
- ✅ `check-plan` indirectly syncs via `retrieveForPlan()`

---

### 3. Manual Edits Must Be Validated Before Commit

**Property:** Git pre-commit hook SHOULD validate JSONL integrity.

**Timeline:** < 100ms validation time for < 1000 lessons

**Why:** Catch syntax errors before they reach other developers.

**Current status:** ❌ NOT IMPLEMENTED

**Implementation needed:**
```bash
# .git/hooks/pre-commit (addition)
if ! npx ca validate --quiet; then
  echo "Error: .claude/lessons/index.jsonl contains invalid lessons"
  echo "Run: npx ca validate --fix"
  exit 1
fi
```

---

## Edge Cases

### Scenario: Empty JSONL file
**Expected:** `readLessons()` returns `{ lessons: [], skippedCount: 0 }`
**Test:** ✅ Covered (jsonl.ts:119)

### Scenario: JSONL file doesn't exist
**Expected:** `readLessons()` returns `{ lessons: [], skippedCount: 0 }` (ENOENT handled)
**Test:** ✅ Covered (jsonl.ts:118-120)

### Scenario: JSONL contains only whitespace/blank lines
**Expected:** Blank lines are skipped (jsonl.ts:130)
**Test:** ✅ Covered

### Scenario: Manual edit adds full lesson without `confirmed: true`
**Expected:** Lesson exists but not returned by `loadSessionLessons()` (filters for `confirmed === true`)
**Risk:** User thinks lesson is loaded but it's not
**Mitigation:** Add `validate` command that checks for common mistakes

### Scenario: Manual edit adds full lesson with `type: 'quick'`
**Expected:** `isFullLesson()` returns false, severity is ignored
**Risk:** High - this is likely what happened to the user
**Mitigation:** Schema validation should enforce: `type === 'full' → severity required`

### Scenario: SQLite index is corrupted
**Expected:** `rebuildIndex()` can recreate from JSONL
**Test:** Delete SQLite, run `rebuild`, verify data intact

### Scenario: JSONL is corrupted (e.g., partial write, git conflict)
**Expected:** Parse errors reported via `onParseError`, valid lessons still loaded
**Mitigation needed:** Add `--strict` mode that fails if ANY parse error exists

---

## Recommendations

### Immediate (High Priority)

1. **Add `validate` CLI command**
   ```bash
   npx ca validate
   # Output: "✅ All lessons valid" or "❌ 3 lessons failed validation (lines 10, 15, 22)"
   ```

2. **Enable parse error logging in CLI**
   ```typescript
   // In load-session, list, search commands:
   const { lessons, skippedCount } = await readLessons(repo, {
     onParseError: (err) => console.warn(`⚠️  Line ${err.line}: ${err.message}`)
   });
   ```

3. **Add unit test for user's scenario**
   ```typescript
   test('full lesson without severity is not loaded at session start', async () => {
     // Simulate user's manual edit
     const invalid = { type: 'full', severity: 'high', ... };
     delete invalid.severity; // Oops!

     await appendFile(jsonlPath, JSON.stringify(invalid) + '\n');

     const lessons = await loadSessionLessons(repo);
     expect(lessons).toHaveLength(0); // Not loaded (failed schema validation)
   });
   ```

### Medium Priority

4. **Add `--strict` flag to load-session**
   - Fail loudly if parse errors exist
   - Use in CI/CD to catch corruption early

5. **Improve error messages**
   ```typescript
   // When no high-severity lessons found, hint at common issues:
   if (lessons.length === 0) {
     console.log('No high-severity lessons found.');
     console.log('Tip: Run `npx ca validate` to check for parse errors.');
   }
   ```

6. **Add pre-commit validation hook**
   - Validate JSONL before allowing commit
   - Prevent invalid lessons from reaching other developers

### Low Priority

7. **Schema versioning**
   - Add `version` field to lessons for future schema migrations
   - Document migration strategy for breaking changes

8. **Telemetry for silent failures**
   - Log to `.claude/.cache/parse-errors.log` when lessons are skipped
   - Help diagnose issues without cluttering CLI output

---

## Test Coverage Checklist

All tests should verify both:
- ✅ **Happy path** (valid data)
- ✅ **Sad path** (invalid data, missing files, corruption)

### Unit Tests

- [ ] `readLessons()` with invalid JSON
- [ ] `readLessons()` with schema violations
- [ ] `readLessons()` with mixed valid/invalid lines
- [ ] `loadSessionLessons()` filters only `type: 'full'` + `severity: 'high'` + `confirmed: true`
- [ ] `loadSessionLessons()` works even if SQLite doesn't exist
- [ ] `syncIfNeeded()` detects JSONL mtime changes
- [ ] Deduplication (last-write-wins)
- [ ] Deletion (tombstones remove lessons)

### Integration Tests

- [ ] Manual JSONL edit → `load-session` reflects change immediately (no rebuild needed)
- [ ] Manual JSONL syntax error → user gets warning (not silent skip)
- [ ] Manual JSONL schema error → user gets validation error
- [ ] SQLite deleted → search still works after auto-rebuild

### Property-Based Tests

Use `fast-check` to generate random lessons and verify invariants:

```typescript
import fc from 'fast-check';

test('readLessons is idempotent', async () => {
  await fc.assert(
    fc.asyncProperty(fc.array(lessonArbitrary()), async (lessons) => {
      // Write lessons
      for (const lesson of lessons) {
        await appendLesson(repo, lesson);
      }

      // Read twice
      const result1 = await readLessons(repo);
      const result2 = await readLessons(repo);

      // Should be identical
      expect(result1).toEqual(result2);
    })
  );
});
```

---

## References

- **Lamport's Temporal Logic**: Safety vs Liveness properties
- **Source of truth principle**: Single authoritative data source
- **JSONL spec**: http://jsonlines.org/
- **Zod schema validation**: https://zod.dev/
