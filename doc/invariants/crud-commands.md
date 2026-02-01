# Invariants for CRUD CLI Commands

## Module Overview

**Purpose**: Provide complete CRUD operations for lesson management via CLI commands: show, update, delete.

**Commands**:
- `learning-agent show <id> [--json]` - Display lesson by ID
- `learning-agent update <id> [--field value] [--json]` - Modify existing lesson
- `learning-agent delete <id>... [--json]` - Soft delete lessons (tombstone)

**Integration Points**:
- JSONL storage (append-only, source of truth)
- SQLite index (auto-sync after mutations)
- LessonSchema validation (Zod)
- CLI framework (Commander.js)

**Current State**: Only read operations exist (list, search). Need to add show, update, delete.

---

## Data Invariants

### DI-1: Lesson ID Format
- **Property**: All lesson IDs match pattern `/^L[a-f0-9]{8}$/`
- **Constraint**: ID is deterministic hash from insight text (SHA-256, first 8 hex chars)
- **Rationale**: Allows conflict-free IDs across repositories
- **Test**: Property test with arbitrary insights, verify ID format and determinism

### DI-2: Lesson Immutability (Core Fields)
- **Property**: Fields `id`, `created`, `type` never change after creation
- **Constraint**: Update command rejects attempts to modify these fields
- **Rationale**: Identity and provenance must be stable
- **Test**: Attempt update with `--id` or `--created` flags, expect error

### DI-3: Mutable Field Whitelist
- **Property**: Update command only accepts: `insight`, `trigger`, `evidence`, `severity`, `tags`, `confirmed`, `pattern`
- **Constraint**: Any other field name returns error
- **Rationale**: Explicit control over what can be changed
- **Test**: Attempt update with `--source` or `--context`, expect error

### DI-4: Schema Validation on Update
- **Property**: Updated lessons validate against LessonSchema before append
- **Constraint**: Invalid field values (wrong type, out of range) rejected
- **Rationale**: Maintain data integrity across all operations
- **Test**: Update with `--severity invalid`, expect schema validation error

### DI-5: Tombstone Record Format
- **Property**: Delete appends `{ "id": "<id>", "deleted": true, "deletedAt": "<ISO8601>" }`
- **Constraint**: Tombstone is minimal record with only id, deleted, deletedAt
- **Rationale**: Append-only delete, no physical removal
- **Test**: Delete lesson, read JSONL, verify tombstone format

### DI-6: Last-Write-Wins Deduplication
- **Property**: When JSONL has multiple records with same ID, last non-deleted wins
- **Constraint**: readLessons applies deduplication; update appends new version
- **Rationale**: Append-only log with eventual consistency
- **Test**: Append lesson, update twice, read JSONL, verify 3 lines but readLessons returns latest

### DI-7: Deleted Lessons Exclusion
- **Property**: Lessons with `deleted: true` never appear in list, search, or show
- **Constraint**: All read operations filter out deleted=true
- **Rationale**: Soft delete means "invisible" not "absent"
- **Test**: Delete lesson, call list/search/show, verify lesson not found

### DI-8: Tags Array Format
- **Property**: Tags are array of strings; CLI accepts comma-separated string
- **Constraint**: `--tags "api,auth,security"` converts to `["api", "auth", "security"]`
- **Rationale**: CLI ergonomics vs internal representation
- **Test**: Update with `--tags "a,b,c"`, verify lesson.tags is `["a","b","c"]`

### DI-9: Pattern Object Structure
- **Property**: Pattern is `{ bad: string, good: string }` or undefined
- **Constraint**: Both fields required if pattern present; CLI accepts `--pattern-bad` and `--pattern-good`
- **Rationale**: Code examples need context (before/after)
- **Test**: Update with only `--pattern-bad`, expect error requiring `--pattern-good`

### DI-10: Boolean Field Representation
- **Property**: `confirmed` is boolean; CLI accepts `--confirmed true|false`
- **Constraint**: String "true"/"false" converts to boolean
- **Rationale**: CLI flags are strings, internal model is typed
- **Test**: Update with `--confirmed true`, verify lesson.confirmed === true

---

## Safety Properties (Must NEVER Happen)

### SP-1: No Physical Deletion of JSONL Lines
- **What**: Delete command must never remove existing lines from JSONL
- **Why**: Append-only guarantees enable git tracking and conflict resolution
- **Test Strategy**:
  - Create lesson with 100 chars of text
  - Delete lesson
  - Verify JSONL file size increased (tombstone appended)
  - Verify original lesson line still present in file

### SP-2: No Data Loss on Update Failure
- **What**: If update validation fails, JSONL must remain unchanged
- **Why**: Failed operations cannot corrupt source of truth
- **Test Strategy**:
  - Create lesson
  - Attempt update with invalid severity ("ultra-high")
  - Catch error
  - Verify JSONL has exactly 1 line (no partial append)
  - Verify readLessons returns original lesson unchanged

### SP-3: No Silent ID Mismatches
- **What**: Show/update/delete with non-existent ID must return clear error
- **Why**: User needs feedback, not silent failure or wrong lesson
- **Test Strategy**:
  - Call `show L99999999` (non-existent ID)
  - Assert: exit code 1, error message contains "Lesson L99999999 not found"
  - Verify: no JSONL modification, no SQLite query errors

### SP-4: No Resurrection of Deleted Lessons
- **What**: Update command must fail if target lesson is deleted
- **Why**: Deleted lessons are immutable (tombstone is final state)
- **Test Strategy**:
  - Create lesson L001
  - Delete lesson L001 (appends tombstone)
  - Attempt update L001 --insight "new"
  - Assert: error "Lesson L001 is deleted"
  - Verify: JSONL has 2 lines (original + tombstone), no third line

### SP-5: No Stale SQLite Reads After Mutation
- **What**: After update/delete completes, SQLite must reflect changes before command returns
- **Why**: Subsequent search/list must see mutations immediately
- **Test Strategy**:
  - Create lesson with tag "api"
  - Update lesson, change tag to "auth"
  - Immediately search for "api"
  - Assert: lesson not found
  - Search for "auth"
  - Assert: lesson found

### SP-6: No Malformed Tombstones
- **What**: Tombstone records must have exactly: id, deleted, deletedAt
- **Why**: Tombstones are not full lessons; excess data wastes space and creates confusion
- **Test Strategy**:
  - Create full lesson (all fields)
  - Delete lesson
  - Parse JSONL, find tombstone record
  - Assert: Object.keys(tombstone) === ["id", "deleted", "deletedAt"]
  - Assert: no trigger, insight, tags, etc.

### SP-7: No ID Collisions on Multiple Deletes
- **What**: Deleting same lesson twice must not create duplicate tombstones
- **Why**: Idempotency - delete is final state, not accumulative
- **Test Strategy**:
  - Create lesson L001
  - Delete L001 (appends tombstone)
  - Delete L001 again
  - Assert: error "Lesson L001 not found" (already deleted)
  - Verify: JSONL has exactly 2 lines (original + 1 tombstone)

### SP-8: No Invalid Schema in JSONL After Update
- **What**: Every line appended by update must pass LessonSchema.parse
- **Why**: Corrupted JSONL breaks all read operations
- **Test Strategy**:
  - Mock Zod schema to inject invalid field
  - Attempt update
  - Assert: schema validation catches error before append
  - Verify: appendLesson never called

### SP-9: No Partial Updates on Multi-Field Changes
- **What**: Update with multiple flags (--insight, --tags, --severity) must be atomic
- **Why**: Either all fields update or none; no half-applied changes
- **Test Strategy**:
  - Create lesson with insight "A", tags ["x"]
  - Attempt update --insight "B" --severity "invalid"
  - Assert: validation fails (invalid severity)
  - Verify: readLessons returns insight "A" (not "B")

### SP-10: No Tag Duplication After Update
- **What**: Update with `--tags "api,api,auth"` must deduplicate to `["api","auth"]`
- **Why**: Tags are semantic set, not list
- **Test Strategy**:
  - Update lesson with --tags "api,api,auth,api"
  - readLessons, verify lesson.tags === ["api", "auth"]

---

## Liveness Properties (Must EVENTUALLY Happen)

### LP-1: Show Returns Within 500ms
- **What**: Show command for existing lesson completes within 500ms
- **Timeline**: p95 < 500ms for databases with <10,000 lessons
- **Monitoring Strategy**: Log slow queries, warn if >500ms
- **Test Strategy**:
  - Create database with 1,000 lessons
  - Measure show command duration
  - Assert: p95 < 500ms

### LP-2: Update Syncs to SQLite Before Return
- **What**: After update appends to JSONL, syncIfNeeded completes synchronously
- **Timeline**: Immediate (no async fire-and-forget)
- **Why**: Next search/list must see updated lesson
- **Test Strategy**:
  - Update lesson, change insight from "A" to "B"
  - Immediately search for "B"
  - Assert: lesson found
  - No setTimeout or async gaps

### LP-3: Delete Returns Within 1 Second
- **What**: Delete command for N lessons completes within N × 200ms
- **Timeline**: p95 < 200ms per lesson
- **Why**: User expects fast response for bulk delete
- **Test Strategy**:
  - Delete 10 lessons in one command
  - Measure total duration
  - Assert: duration < 2 seconds

### LP-4: Update Failure Reports Within 100ms
- **What**: Schema validation errors return immediately (no network/IO delays)
- **Timeline**: < 100ms for validation-only failures
- **Why**: User feedback must be instant for CLI ergonomics
- **Test Strategy**:
  - Attempt update with --severity "invalid"
  - Measure time to error message
  - Assert: < 100ms (pure CPU validation)

### LP-5: Multiple Deletes Process Sequentially
- **What**: Delete L001 L002 L003 appends 3 tombstones in order
- **Timeline**: Bounded by O(N) time, no exponential blowup
- **Why**: Bulk operations must scale linearly
- **Test Strategy**:
  - Delete 100 lessons
  - Verify JSONL has 100 new tombstone lines
  - Measure duration, assert O(N) scaling

---

## Edge Cases

### EC-1: Show Non-Existent Lesson
- **Scenario**: `show L99999999` (ID not in JSONL)
- **Expected**: Exit code 1, error "Lesson L99999999 not found"
- **Test**: Grep JSONL, confirm ID absent, call show, verify error

### EC-2: Show Deleted Lesson
- **Scenario**: Lesson exists but has tombstone
- **Expected**: Exit code 1, error "Lesson L001 not found (deleted)"
- **Test**: Create lesson, delete, call show, verify error message

### EC-3: Update with No Flags
- **Scenario**: `update L001` (no --insight, --tags, etc.)
- **Expected**: Exit code 1, error "No fields to update (specify at least one: --insight, --tags, ...)"
- **Test**: Call update with only ID, verify error

### EC-4: Update with Empty String
- **Scenario**: `update L001 --insight ""`
- **Expected**: Exit code 1, error "insight cannot be empty"
- **Test**: Attempt update with empty required field, verify schema rejection

### EC-5: Update Immutable Field
- **Scenario**: `update L001 --created "2026-01-01T00:00:00Z"`
- **Expected**: Exit code 1, error "Cannot update immutable fields: created, id, type"
- **Test**: Attempt update with --created, verify error before JSONL append

### EC-6: Delete Already Deleted Lesson
- **Scenario**: Delete L001, then delete L001 again
- **Expected**: Exit code 1, error "Lesson L001 not found (already deleted)"
- **Test**: Delete twice, verify 2 JSONL lines (original + 1 tombstone)

### EC-7: Delete Multiple Lessons (Some Missing)
- **Scenario**: `delete L001 L002 L003` where L002 does not exist
- **Expected**: Warn "Lesson L002 not found, skipping", delete L001 and L003
- **Test**: Verify 2 tombstones appended, stderr contains warning

### EC-8: Update with Partial Pattern
- **Scenario**: `update L001 --pattern-bad "foo"`
- **Expected**: Exit code 1, error "Pattern requires both --pattern-bad and --pattern-good"
- **Test**: Specify only one pattern field, verify error

### EC-9: Update with Whitespace-Only Tags
- **Scenario**: `update L001 --tags " , , "`
- **Expected**: Parse as empty tags array `[]` (filter blank strings)
- **Test**: Update with whitespace tags, verify lesson.tags === []

### EC-10: Show with JSON Flag
- **Scenario**: `show L001 --json`
- **Expected**: Output valid JSON on stdout (parseable by jq)
- **Test**: Capture stdout, parse as JSON, verify lesson object

### EC-11: Update Preserves Supersedes/Related
- **Scenario**: Lesson has supersedes=["L002"], update insight
- **Expected**: Updated lesson retains supersedes array
- **Test**: Create lesson with supersedes, update, verify supersedes preserved

### EC-12: Delete Multiple Lessons in One Command
- **Scenario**: `delete L001 L002 L003`
- **Expected**: 3 tombstones appended, sync once at end
- **Test**: Mock syncIfNeeded, count calls, assert 1

### EC-13: Update Tags with Duplicates
- **Scenario**: `update L001 --tags "api,api,auth"`
- **Expected**: Deduplicate to `["api", "auth"]`
- **Test**: Update with duplicate tags, verify deduplication

### EC-14: Show Lesson with Missing Optional Fields
- **Scenario**: Quick lesson (no evidence, severity, pattern)
- **Expected**: Human-readable output shows "N/A" for missing fields
- **Test**: Create quick lesson, show, verify clean output (no "undefined")

### EC-15: Update Severity on Quick Lesson
- **Scenario**: Quick lesson (type="quick"), update --severity "high"
- **Expected**: Success, lesson gains severity field (semantic promotion)
- **Test**: Create quick lesson, update severity, verify type still "quick" but severity present

---

## CLI Interface Specifications

### Show Command

**Signature**:
```bash
learning-agent show <id> [--json]
```

**Flags**:
- `--json` - Output JSON instead of human-readable format

**Output (Human-Readable)**:
```
ID: L001
Type: full
Trigger: API returned 401 despite valid token
Insight: API requires X-Request-ID header
Evidence: Traced in network tab, header missing
Severity: high
Tags: api, auth
Source: test_failure
Context: tool=bash, intent="run auth integration tests"
Created: 2025-01-30T14:00:00Z
Confirmed: yes
Supersedes: L002, L003
Related: L004
Pattern:
  Bad:  requests.get(url, headers={'Authorization': token})
  Good: requests.get(url, headers={'Authorization': token, 'X-Request-ID': uuid4()})
```

**Output (JSON)**:
```json
{
  "id": "L001",
  "type": "full",
  "trigger": "API returned 401 despite valid token",
  "insight": "API requires X-Request-ID header",
  "evidence": "Traced in network tab, header missing",
  "severity": "high",
  "tags": ["api", "auth"],
  "source": "test_failure",
  "context": { "tool": "bash", "intent": "run auth integration tests" },
  "created": "2025-01-30T14:00:00Z",
  "confirmed": true,
  "supersedes": ["L002", "L003"],
  "related": ["L004"],
  "pattern": {
    "bad": "requests.get(url, headers={'Authorization': token})",
    "good": "requests.get(url, headers={'Authorization': token, 'X-Request-ID': uuid4()})"
  }
}
```

---

### Update Command

**Signature**:
```bash
learning-agent update <id> [OPTIONS] [--json]
```

**Flags**:
- `--insight <text>` - Update insight text
- `--trigger <text>` - Update trigger description
- `--evidence <text>` - Update evidence (full lessons)
- `--severity <level>` - Set severity (high|medium|low)
- `--tags <csv>` - Set tags (comma-separated)
- `--confirmed <bool>` - Set confirmed status (true|false)
- `--pattern-bad <code>` - Set "bad" pattern example
- `--pattern-good <code>` - Set "good" pattern example
- `--json` - Output JSON instead of human-readable

**Validation Rules**:
1. At least one update flag required (error if none)
2. Cannot update: id, created, type, source, context, supersedes, related
3. Pattern requires both --pattern-bad and --pattern-good
4. Severity must be: high, medium, or low
5. Tags deduplicated, whitespace-only filtered
6. Target lesson must exist and not be deleted

**Output (Human-Readable)**:
```
Updated lesson L001:
- insight: "API requires X-Request-ID header" → "API requires X-Request-ID header for auth"
- severity: high → medium
```

**Output (JSON)**:
```json
{
  "id": "L001",
  "type": "full",
  "trigger": "API returned 401 despite valid token",
  "insight": "API requires X-Request-ID header for auth",
  "severity": "medium",
  ...
}
```

---

### Delete Command

**Signature**:
```bash
learning-agent delete <id>... [--json]
```

**Arguments**:
- `<id>...` - One or more lesson IDs to delete

**Flags**:
- `--json` - Output JSON array of deleted IDs

**Behavior**:
- Appends tombstone for each valid ID
- Skips already-deleted lessons with warning
- Syncs SQLite once at end (not per-lesson)
- Non-existent IDs logged as warnings, do not fail command

**Output (Human-Readable)**:
```
Deleted 2 lessons:
- L001
- L003

Warnings:
- L002: not found (skipped)
```

**Output (JSON)**:
```json
{
  "deleted": ["L001", "L003"],
  "warnings": [
    { "id": "L002", "message": "not found" }
  ]
}
```

---

## Implementation Checklist

### Show Command
- [ ] Parse ID argument
- [ ] Read lessons with readLessons (handles deduplication)
- [ ] Check if lesson exists and not deleted
- [ ] Format output (human-readable vs JSON)
- [ ] Return exit code 1 on not found

### Update Command
- [ ] Parse ID and field flags
- [ ] Validate at least one field specified
- [ ] Validate no immutable fields in flags
- [ ] Read current lesson (check exists, not deleted)
- [ ] Merge updates into lesson object
- [ ] Validate updated lesson against LessonSchema
- [ ] Deduplicate tags, validate pattern pairs
- [ ] Append updated lesson to JSONL
- [ ] Call syncIfNeeded
- [ ] Format output showing changes

### Delete Command
- [ ] Parse one or more IDs
- [ ] Read current lessons
- [ ] For each ID: check exists, not already deleted
- [ ] Create tombstone records
- [ ] Append tombstones to JSONL
- [ ] Call syncIfNeeded once at end
- [ ] Format output with deleted/warnings

---

## Testing Strategy

### Property Tests (fast-check)

1. **Show Idempotence**
   - Create arbitrary lesson
   - Show twice
   - Assert: identical output both times

2. **Update Preserves Identity**
   - Create arbitrary lesson with ID L001
   - Update arbitrary mutable fields
   - Assert: updated lesson.id === "L001", created unchanged

3. **Delete Idempotence**
   - Create arbitrary lesson
   - Delete twice
   - Assert: second delete returns "not found", JSONL has 1 tombstone

4. **Update-Show Consistency**
   - Create arbitrary lesson
   - Update arbitrary fields
   - Show lesson
   - Assert: show returns updated values

### Integration Tests

1. **Show Non-Existent**
   - CLI: `show L99999999`
   - Assert: exit code 1, stderr contains "not found"

2. **Update Insight**
   - CLI: `learn "original insight"`
   - Extract ID from output
   - CLI: `update <id> --insight "updated insight"`
   - CLI: `show <id>`
   - Assert: insight is "updated insight"

3. **Delete and Verify Invisible**
   - CLI: `learn "test lesson"`
   - Extract ID
   - CLI: `delete <id>`
   - CLI: `list`
   - Assert: ID not in list output

4. **Bulk Delete**
   - CLI: `learn "lesson 1"`, `learn "lesson 2"`, `learn "lesson 3"`
   - Extract IDs: L001, L002, L003
   - CLI: `delete L001 L002 L003`
   - CLI: `list`
   - Assert: all 3 IDs absent from list

5. **Update Tags**
   - CLI: `learn "test" --tags "api,auth"`
   - Extract ID
   - CLI: `update <id> --tags "api,security"`
   - CLI: `show <id> --json`
   - Parse JSON, assert: tags === ["api", "security"]

### Unit Tests

1. **rowToLesson Preserves Optional Fields**
   - Insert lesson with evidence + severity
   - Read back, verify evidence and severity present
   - Insert lesson without evidence + severity
   - Read back, verify fields undefined (not null)

2. **Tombstone Format**
   - Create lesson
   - Append tombstone manually
   - Call readLessons
   - Assert: lesson not in result, Map correctly handles deletion

3. **Schema Validation Rejects Invalid Update**
   - Create lesson
   - Attempt update with severity="invalid"
   - Assert: LessonSchema.parse throws ZodError
   - Verify: appendLesson never called

---

## Error Messages

| Scenario | Message |
|----------|---------|
| ID not found | `Lesson {id} not found` |
| ID is deleted | `Lesson {id} not found (deleted)` |
| No update flags | `No fields to update (specify at least one: --insight, --tags, ...)` |
| Update immutable field | `Cannot update immutable fields: {field}` |
| Invalid severity | `Invalid severity '{value}' (must be: high, medium, low)` |
| Empty required field | `{field} cannot be empty` |
| Pattern partial | `Pattern requires both --pattern-bad and --pattern-good` |
| Schema validation | `Schema validation failed: {zod_error_message}` |

---

## Success Criteria

1. **Correctness**: All tests pass (property, integration, unit)
2. **Consistency**: Update/delete auto-sync to SQLite
3. **Simplicity**: < 200 lines per command (show, update, delete)
4. **Performance**: Show < 500ms, update < 1s, delete < 200ms/lesson
5. **User Experience**: Clear error messages, JSON flag works everywhere
6. **Data Integrity**: No JSONL corruption, no schema violations, no data loss
