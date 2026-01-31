# Invariants for Type Unification

## Module Overview

**Purpose**: Unify `QuickLesson` and `FullLesson` types into a single `Lesson` type with optional fields.

**Migration**: Discriminated union → Single schema with optional fields

**Current State**:
- `QuickLessonSchema`: Base fields + `type: z.literal('quick')`
- `FullLessonSchema`: Base fields + `type: z.literal('full')` + required `evidence`, required `severity`, optional `pattern`
- `LessonSchema`: `z.discriminatedUnion('type', [QuickLessonSchema, FullLessonSchema])`

**Target State**:
- Single `LessonSchema` with all fields
- `type: z.enum(['quick', 'full'])` (semantic marker, not structural discriminator)
- `evidence: z.string().optional()`
- `severity: SeveritySchema.optional()`
- `pattern: PatternSchema.optional()`
- Remove `QuickLessonSchema` and `FullLessonSchema` exports

---

## Data Invariants

### Core Identity
- **id**: string, unique, format `L[0-9a-f]{8}`, generated via SHA-256 hash of insight
- **type**: string, enum `['quick', 'full']`, always present, semantic marker for lesson quality tier
- **trigger**: string, non-empty, describes what caused the lesson capture
- **insight**: string, non-empty, the actual lesson learned

### Timestamps
- **created**: string, ISO 8601 format, never in the future, immutable after creation

### Optional Metadata
- **evidence**: string or undefined, present when `type === 'full'`, absent or undefined when `type === 'quick'`
- **severity**: enum `['high', 'medium', 'low']` or undefined, present when `type === 'full'`, absent or undefined when `type === 'quick'`
- **pattern**: object `{ bad: string, good: string }` or undefined, only valid when `type === 'full'`

### Semantic Constraints
- When `type === 'full'`: `evidence` and `severity` SHOULD be present (but schema allows undefined)
- When `type === 'quick'`: `evidence`, `severity`, and `pattern` SHOULD be undefined (but schema allows any value)
- `pattern` field is always optional regardless of `type`

---

## Safety Properties (Must NEVER Happen)

### 1. Existing JSONL Data Becomes Invalid
**What**: Migration must not break parsing of existing lessons in git history or live JSONL files.

**Why**:
- JSONL is git-tracked source of truth
- Users may have existing lessons
- Git history must remain readable

**Test Strategy**:
1. Property-based test: Generate 100+ lessons with old schema
2. Write to JSONL
3. Parse with new schema
4. Verify all lessons parse successfully
5. Verify `type` field preserved correctly

**Verification**:
```typescript
// Old data (existing JSONL)
{ "type": "quick", /* base fields */ }
{ "type": "full", "evidence": "...", "severity": "high", /* base fields */ }

// Must parse successfully with new schema
const result = LessonSchema.safeParse(oldData);
expect(result.success).toBe(true);
```

### 2. Lesson IDs Change During Migration
**What**: Lesson IDs must remain stable; migration cannot alter ID generation.

**Why**:
- IDs are used for `supersedes` and `related` references
- Changing IDs breaks cross-references
- IDs are used for deduplication

**Test Strategy**:
- Generate ID from same insight before/after migration
- Verify identical output
- Test with 1000+ random insights

### 3. Type Discriminator Checks Break
**What**: Code using `lesson.type === 'full'` must continue to work.

**Why**:
- 9 files use `lesson.type` for runtime checks
- Used in SQLite insertion, ranking, session loading, CLI display
- Breaking these would cause runtime failures

**Test Strategy**:
- Grep for all `lesson.type` usage
- Write regression tests for each usage pattern
- Verify `lesson.type === 'full'` still works
- Verify `lesson.type === 'quick'` still works

**Affected Files**:
- `src/retrieval/session.ts`: `lesson.type === 'full'` (line 18)
- `src/search/ranking.ts`: `lesson.type !== 'full'` (line 31)
- `src/storage/sqlite.ts`: `lesson.type` access (lines 381, 384, 385)
- `src/storage/sqlite.test.ts`: Type checks (lines 364, 365)
- `src/cli.ts`: Display (line 117)

### 4. SQLite Schema Becomes Incompatible
**What**: SQLite index stores `type`, `evidence`, `severity` as separate columns; migration must not break index rebuild.

**Why**:
- SQLite is rebuildable cache from JSONL
- Index rebuild must handle both old and new lesson formats
- Corruption would require manual intervention

**Test Strategy**:
- Append mixed old/new format lessons to JSONL
- Run `rebuildIndex()`
- Verify all lessons indexed correctly
- Query by `type`, `severity` fields
- Verify results match expected

### 5. Type Narrowing Lost
**What**: TypeScript type guards like `isFullLesson()` must still provide type narrowing.

**Why**:
- Used in `src/retrieval/session.ts` (lines 17-18, 40-41)
- Type narrowing enables access to `evidence` and `severity` without undefined checks
- Loss of narrowing would require code changes in consumers

**Test Strategy**:
```typescript
function isFullLesson(lesson: Lesson): lesson is FullLesson {
  return lesson.type === 'full';
}

// After narrowing, these must not error:
if (isFullLesson(lesson)) {
  const evidence: string = lesson.evidence; // Should work
  const severity: Severity = lesson.severity; // Should work
}
```

**Resolution**:
- Keep `FullLesson` type as alias/subset
- OR accept that `evidence` and `severity` are always `| undefined`
- Document breaking change if type narrowing removed

### 6. Test Fixtures Break
**What**: 153 test files contain factory functions like `createQuickLesson()` and `createFullLesson()`.

**Why**:
- Test factories are used across 13+ test files
- Breaking these would cause 100+ test failures
- Tests are the verification that migration succeeded

**Test Strategy**:
- Update factory functions to produce new schema
- Run full test suite (`pnpm test`)
- Verify 100% pass rate (no skipped tests)

**Affected Test Files**:
- `src/cli.test.ts`
- `src/retrieval/session.test.ts`
- `src/retrieval/plan.test.ts`
- `src/search/ranking.test.ts`
- `src/search/vector.test.ts`
- `src/storage/sqlite.test.ts`
- `src/storage/jsonl.test.ts`
- `src/capture/quality.test.ts`

### 7. Public API Exports Break
**What**: `index.ts` exports `QuickLessonSchema`, `FullLessonSchema`, `QuickLesson`, `FullLesson`.

**Why**:
- Public API consumed by external code
- Breaking exports is a major version change
- `examples/basic-usage.ts` imports these types

**Test Strategy**:
- Decision required: Keep or remove?
- If keep: `QuickLessonSchema` becomes alias to `LessonSchema.refine(type === 'quick')`
- If remove: Document as breaking change, update examples
- Run `src/index.test.ts` exports verification

**Verification**:
```typescript
// Option A: Keep as aliases
export const QuickLessonSchema = LessonSchema.refine(l => l.type === 'quick');
export const FullLessonSchema = LessonSchema.refine(l => l.type === 'full');

// Option B: Remove (breaking change)
// Update examples/basic-usage.ts
// Update AGENTS.md documentation
```

---

## Liveness Properties (Must EVENTUALLY Happen)

### 1. All Tests Pass After Migration
**Timeline**: Before marking task complete

**What**: Full test suite must reach 100% pass rate with zero skipped tests.

**Monitoring**:
- Run `pnpm test` after each change
- No flaky tests allowed
- No skipped tests allowed

**Exit Criteria**:
```bash
pnpm test
# Expected: All tests passed (exact count varies)
# Expected: 0 tests failed
# Expected: 0 tests skipped
```

### 2. Zero Linter Violations
**Timeline**: Before marking task complete

**What**: `pnpm lint` must pass with zero violations.

**Monitoring**:
```bash
pnpm lint
# Expected: 0 problems (0 errors, 0 warnings)
```

### 3. Type Exports Updated
**Timeline**: During implementation

**What**: Public API exports in `src/index.ts` must be updated or removed.

**Verification**:
- `src/index.test.ts` exports test must pass
- Documentation must reflect changes
- Examples must run without type errors

### 4. Documentation Updated
**Timeline**: Before marking task complete

**What**: All references to `QuickLesson`/`FullLesson` distinction must be updated.

**Files to Update**:
- `doc/SPEC.md`: Schema examples (lines 70-116)
- `doc/PLAN.md`: Type definitions (lines 105-155)
- `AGENTS.md`: Type documentation (line 27, 173-174)
- `examples/basic-usage.ts`: Usage examples (lines 19-49)
- `CONTRIBUTING.md`: Test examples (line 81)

**Verification**:
- Grep for `QuickLesson` and `FullLesson`
- Verify all references updated or intentionally kept

---

## Edge Cases

### Empty JSONL File
**Scenario**: No existing lessons
**Expected**: Schema migration works, new lessons validate correctly

### Mixed Format JSONL
**Scenario**: Some lines use old schema, some use new schema
**Expected**: Both formats parse successfully, index rebuilds correctly

### Corrupted JSONL Line
**Scenario**: Invalid JSON in JSONL file
**Expected**: Skip corrupted line, log warning, continue (existing behavior preserved)

### Partial Lesson Data
**Scenario**: Full lesson missing `evidence` or `severity`
**Expected**:
- New schema: Validates successfully (fields optional)
- Runtime logic: Code handles undefined gracefully
- Semantic meaning: `type === 'full'` but missing data is valid

### Lesson with `type` Field Missing
**Scenario**: Old lesson without `type` field
**Expected**: Schema validation fails (required field)
**Note**: Should not occur in practice (type always required in current schema)

### Type Guard After Migration
**Scenario**: `isFullLesson(lesson)` used for type narrowing
**Expected**:
- Type guard still compiles
- Narrowing behavior depends on schema design
- If `FullLesson` type removed: Narrowing lost, code changes required

### SQLite NULL Values
**Scenario**: New optional fields stored as NULL in SQLite
**Expected**:
- NULL values handled in queries
- Reconstruction from SQLite preserves undefined vs null semantics
- FTS5 index handles NULL gracefully

---

## Migration Strategy

### Phase 1: Add Optional Fields (Non-Breaking)
1. Make `evidence`, `severity`, `pattern` optional in `FullLessonSchema`
2. Run tests - should still pass
3. Verify old data still valid

### Phase 2: Unify Schemas
1. Replace `z.discriminatedUnion` with single schema
2. `type: z.enum(['quick', 'full'])`
3. All special fields optional
4. Keep `QuickLesson`/`FullLesson` types as conditional types or remove

### Phase 3: Update Consumers
1. Update SQLite queries to handle undefined
2. Update ranking logic to handle undefined severity
3. Update session loader to handle undefined severity
4. Verify type guards still work or refactor

### Phase 4: Update Tests
1. Update factory functions
2. Run full test suite
3. Fix any failures
4. Verify 100% pass rate

### Phase 5: Update Documentation
1. Update SPEC.md schema examples
2. Update AGENTS.md type references
3. Update examples/basic-usage.ts
4. Grep for remaining references

---

## Rollback Plan

If migration fails:

1. **Revert schema changes** in `src/types.ts`
2. **Revert test changes** to use old factory functions
3. **Revert consumer code** to use discriminated union
4. **Run tests** to verify rollback successful
5. **Document issues** encountered for future attempt

---

## Success Criteria

Migration is complete when ALL of the following are true:

- [ ] `LessonSchema` is single unified schema (not discriminated union)
- [ ] `type` field is `z.enum(['quick', 'full'])`
- [ ] `evidence`, `severity`, `pattern` are all optional
- [ ] All existing JSONL data parses successfully
- [ ] All tests pass (100% pass rate, 0 skipped)
- [ ] `pnpm lint` passes (0 violations)
- [ ] `lesson.type === 'full'` checks still work in production code
- [ ] SQLite index rebuild handles new schema
- [ ] Type guards compile and work correctly
- [ ] Public API decision made (keep/remove QuickLesson/FullLesson)
- [ ] Documentation updated
- [ ] Examples updated
- [ ] `/implementation-reviewer` returns APPROVED

---

## Questions for User

Before implementation, clarify:

1. **Public API**: Keep `QuickLesson`/`FullLesson` as aliases, or remove as breaking change?
2. **Type Guards**: Keep `isFullLesson()` with refined type, or remove and accept `| undefined` everywhere?
3. **Semantic Enforcement**: Should schema enforce "full lessons have evidence/severity" or is it optional?
4. **Test Count**: User mentioned "236 existing tests" - is this the current count or a target?

---

## Notes

- This is a **refactoring** task: External behavior must remain identical
- Schema change is internal: Consumers should not break
- Git history must remain parseable: Old commits with old schema must still work
- Idempotency: Running migration multiple times should be safe
- Reversibility: Must be able to rollback if issues discovered
