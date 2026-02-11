# Invariants for CLI Severity Flag Feature

**Issue**: compound_agent-s92 - CRITICAL: No way to create high-severity lessons via CLI

## Module Overview

### Purpose
Add `--severity` flag to `learn` command to enable creation of high-severity lessons that are loaded at session start.

### Current State
- `learn` command hardcodes `type: 'quick'` at cli.ts:819
- No severity flag exists
- `loadSessionLessons()` requires `type='full'` AND `severity='high'` AND `confirmed=true`
- Users cannot access the session-start lessons feature

### Inputs
- `--severity <value>`: Optional string flag (values: 'high', 'medium', 'low')
- Existing inputs: `insight`, `--trigger`, `--tags`, `--yes`

### Outputs
- Creates Lesson object with correct `type` and `severity` fields
- Appends to `.claude/lessons/index.jsonl`
- CLI success message shows lesson ID

### State
- Lesson stored in append-only JSONL file
- Zod schema validates lesson structure

---

## Data Invariants

### Field: `severity`
- **Type**: 'high' | 'medium' | 'low' | undefined
- **Constraints**:
  - Only valid when `--severity` flag is provided
  - Must be one of three literal values (enforced by `SeveritySchema`)
  - Optional field per `LessonSchema` (line 64 of types.ts)
- **Rationale**: Severity determines if lesson is loaded at session start

### Field: `type`
- **Type**: 'quick' | 'full'
- **Constraints**:
  - `type='full'` when `--severity` flag is provided
  - `type='quick'` when `--severity` flag is NOT provided
- **Rationale**: `loadSessionLessons()` filters for `type='full'` (session.ts:21,44)

### Coupling Invariant: severity implies type
- **Constraint**: `severity !== undefined` implies `type === 'full'`
- **Rationale**: `loadSessionLessons()` type guard checks both (session.ts:20-22)
- **Test Strategy**: Property test that all lessons with severity have type='full'

### Field: `confirmed`
- **Type**: boolean
- **Constraints**: Always `true` for `learn` command
- **Rationale**: Manual capture is explicit confirmation (cli.ts:829)

---

## Safety Properties (Must NEVER Happen)

### 1. Invalid severity value accepted
- **Description**: CLI must reject severity values other than 'high', 'medium', 'low'
- **Why**: Invalid severity breaks schema validation and corrupts JSONL
- **Test Strategy**:
  - Unit test: `learn --severity invalid "test"` should error
  - Unit test: `learn --severity HIGH "test"` should error (case-sensitive)
  - Property test: Generate random strings, verify only valid values accepted

### 2. Severity set without type='full'
- **Description**: A lesson with `severity` field must have `type='full'`
- **Why**: `loadSessionLessons()` will skip lessons where `type !== 'full'`
- **Test Strategy**:
  - Unit test: Verify created lesson has both fields set correctly
  - Integration test: Create high-severity lesson, verify `loadSessionLessons()` returns it

### 3. High-severity lesson not retrievable at session start
- **Description**: Round-trip failure: create -> list -> load-session
- **Why**: Core feature is unusable
- **Test Strategy**:
  - Integration test:
    1. `learn --severity high "test"`
    2. Verify lesson appears in `list --type full`
    3. Verify lesson appears in `load-session` results

### 4. Type='full' without severity field
- **Description**: When `--severity` is provided, lesson must have severity field populated
- **Why**: Type guard `isFullLesson()` checks `severity !== undefined` (session.ts:20-21)
- **Test Strategy**:
  - Unit test: Parse created lesson JSON, verify severity field exists and has correct value

### 5. JSONL corruption on invalid input
- **Description**: Invalid severity must error BEFORE writing to JSONL
- **Why**: Append-only storage - cannot undo corrupt writes
- **Test Strategy**:
  - Unit test: Run `learn --severity bad "test"`, verify JSONL file unchanged

---

## Liveness Properties (Must EVENTUALLY Happen)

### 1. CLI command completes within 500ms
- **Description**: `learn --severity high "insight"` must complete quickly
- **Timeline**: p95 < 500ms (no embedding, just JSONL append)
- **Monitoring Strategy**: Test with real file I/O, measure duration
- **Test**:
  ```typescript
  const start = Date.now();
  runCli('learn --severity high "test" --yes');
  const duration = Date.now() - start;
  expect(duration).toBeLessThan(500);
  ```

### 2. Severity validation error provides clear message
- **Description**: User must understand what went wrong
- **Timeline**: Immediate (synchronous validation)
- **Monitoring Strategy**: Error message review
- **Test**:
  ```typescript
  const { combined } = runCli('learn --severity invalid "test"');
  expect(combined).toMatch(/severity.*high.*medium.*low/i);
  ```

---

## Edge Cases

### Empty severity string
- **Input**: `learn --severity "" "insight"`
- **Expected**: Error - severity must be 'high', 'medium', or 'low'
- **Rationale**: Empty string is not a valid enum value

### Severity without insight
- **Input**: `learn --severity high`
- **Expected**: Error - insight is required argument
- **Rationale**: Existing validation should still apply

### Multiple severity flags (last wins)
- **Input**: `learn --severity low --severity high "insight"`
- **Expected**: Uses 'high' (Commander.js default behavior)
- **Rationale**: Consistent with standard CLI conventions

### Severity with all other flags
- **Input**: `learn --severity high "insight" --trigger "test" --tags "a,b" --yes`
- **Expected**: Success - all fields populated correctly
- **Rationale**: Severity should compose with existing flags

### Case sensitivity
- **Input**: `learn --severity High "insight"`
- **Expected**: Error - severity is case-sensitive
- **Rationale**: Zod enum validation is case-sensitive

### No severity flag (backward compatibility)
- **Input**: `learn "insight"` (no --severity)
- **Expected**: type='quick', severity=undefined (current behavior)
- **Rationale**: Must not break existing workflows

### Medium and low severity
- **Input**: `learn --severity medium "insight"` and `learn --severity low "insight"`
- **Expected**: type='full', severity='medium'/'low', NOT loaded by `loadSessionLessons()`
- **Rationale**: Session loader only returns severity='high' (session.ts:44)

---

## Type System Invariants

### Zod Schema Validation
- **Invariant**: All created lessons must pass `LessonSchema.parse()`
- **Why**: Schema is source of truth for data structure
- **Test**: Parse created lesson JSON, expect no ZodError

### TypeScript Type Consistency
- **Invariant**: Lesson object in memory matches `Lesson` type
- **Why**: Type safety ensures correct field access
- **Test**: TypeScript compilation succeeds with strict mode

---

## Backward Compatibility Invariants

### 1. Existing `learn` command still works
- **Invariant**: `learn "insight"` creates quick lesson (no severity)
- **Why**: Must not break existing users
- **Test**: Verify type='quick', severity=undefined

### 2. All existing lesson fields still required
- **Invariant**: Severity flag does not remove or change other fields
- **Why**: JSONL deduplication depends on consistent structure
- **Test**: Verify all fields present in both quick and full lessons

### 3. JSONL format unchanged
- **Invariant**: Line format is still `JSON.stringify(lesson) + '\n'`
- **Why**: Storage layer depends on newline-delimited JSON
- **Test**: Read JSONL file, verify each line is valid JSON with newline

---

## Test Coverage Requirements

### Unit Tests (CLI parsing)
1. `--severity high` sets type='full' and severity='high'
2. `--severity medium` sets type='full' and severity='medium'
3. `--severity low` sets type='full' and severity='low'
4. `--severity invalid` throws error
5. `--severity` (no value) throws error
6. No `--severity` flag creates type='quick', severity=undefined

### Integration Tests (Round-trip)
1. Create high-severity -> list -> verify appears
2. Create high-severity -> loadSessionLessons -> verify in results
3. Create medium-severity -> loadSessionLessons -> verify NOT in results
4. Create quick -> loadSessionLessons -> verify NOT in results

### Property Tests (Invariant checking)
1. For all lessons with severity field, type='full'
2. For all valid severity values, lesson creation succeeds
3. For all invalid severity values, lesson creation fails before JSONL write

### Error Handling Tests
1. Invalid severity shows clear error message
2. Error message lists valid values ('high', 'medium', 'low')
3. Failed command does not corrupt JSONL file

---

## Implementation Constraints

### Commander.js API
- Use `.option('-s, --severity <level>', 'Lesson severity (high, medium, low)')`
- Validate in action handler before creating lesson object
- Throw error with clear message on invalid value

### Validation Location
- **Must validate BEFORE** calling `appendLesson()`
- **Rationale**: Append-only storage cannot roll back
- **Test**: Failed validation leaves JSONL file unchanged

### Error Message Format
- **Must include** valid values in error message
- **Example**: "Invalid severity 'bad'. Use: high, medium, low"
- **Rationale**: User should know how to fix command

---

## Success Criteria

### All tests pass
- [ ] Unit tests for all severity values
- [ ] Integration tests for round-trip
- [ ] Property tests for invariants
- [ ] Error handling tests

### Type system validates
- [ ] TypeScript compilation succeeds
- [ ] Zod schema validation passes for all cases

### Documentation complete
- [ ] CLI help text mentions `--severity` flag
- [ ] Error messages are clear and actionable

### Backward compatibility maintained
- [ ] Existing `learn` command still works
- [ ] No changes to JSONL format
- [ ] No breaking changes to `Lesson` type
