# Invariants for load-session Command Output

## Purpose

The `load-session` command loads high-severity lessons at session startup and outputs them in a format optimized for Claude Code's context window. This document defines the invariants that the output MUST maintain using Lamport's safety/liveness framework.

## Module Overview

**Command**: `npx ca load-session [--json]`

**Inputs**:
- Repository root directory (implicit)
- `--json` flag (optional)
- `--quiet` flag (optional, global)

**Outputs**:
- Human-readable markdown (default)
- JSON object (with `--json` flag)

**State**:
- Reads lessons from `.claude/lessons/index.jsonl`
- Filters for `type: 'full'`, `severity: 'high'`, `confirmed: true`
- Sorts by recency (most recent first)
- Returns up to 5 lessons (hardcoded limit)

## Data Invariants

### DI-1: Exit Code
- **Invariant**: Exit code is ALWAYS 0, regardless of lesson count
- **Rationale**: Called from Claude Code hooks with `|| true` - must never block session start
- **Test**: `expect(exitCode).toBe(0)` even when no lessons exist

### DI-2: Output Mode Exclusivity
- **Invariant**: Output is EITHER human-readable markdown OR JSON, never both
- **Constraint**: `--json` flag determines mode
- **Test**: Check output format matches flag

### DI-3: Human-Readable Format Structure
When `--json` is NOT set:
- **Header**: Starts with `## Session Lessons (High Severity)\n`
- **Lesson Entry**: Each lesson is numbered `1.`, `2.`, etc.
- **Lesson ID**: Shown in bold brackets `[Lxxxxxxxx]`
- **Lesson Insight**: Full text after ID
- **Source Line**: `   - Source: {source} ({YYYY-MM-DD})`
- **Tags Line** (conditional): `   - Tags: tag1, tag2` (only if tags.length > 0)
- **Separator**: Empty line between lessons
- **Footer** (unless `--quiet`): `---\n{count} high-severity {lesson|lessons} loaded.`

### DI-4: JSON Format Structure
When `--json` is set:
```json
{
  "lessons": [...],  // Array of Lesson objects
  "count": N         // Integer >= 0
}
```
- **Type**: Valid JSON object
- **Fields**: Exactly 2 fields: `lessons` and `count`
- **Count**: `count === lessons.length`

### DI-5: Date Format
- **Invariant**: Dates in human-readable output are truncated to ISO date prefix (YYYY-MM-DD)
- **Length**: Exactly 10 characters
- **Test**: Extract date from output, verify format `/^\d{4}-\d{2}-\d{2}$/`

### DI-6: Empty State Message
When no high-severity lessons exist:
- **Human-readable**: `"No high-severity lessons found."`
- **JSON**: `{"lessons": [], "count": 0}`
- **Test**: Both modes show valid output (not error)

## Safety Properties (Must NEVER Happen)

### S1: Never Expose Internal IDs to Claude
- **Property**: Lesson IDs MUST NOT appear in final output for Claude context
- **Why**: IDs like `[L12345678]` are implementation details, not useful for Claude's decision-making
- **Current Violation**: `outputSessionLessonsHuman` includes `[${lesson.id}]` in output (line 281)
- **Fix Required**: Remove ID from human-readable format
- **Test**: `output.should.not.match(/\[L[a-f0-9]{8}\]/)`

### S2: Never Prefix with [info]
- **Property**: Human-readable output MUST NOT include `[info]` prefix
- **Why**: Becomes noise in Claude's context window; save tokens for actual lessons
- **Current Violation**: `outputSessionLessonsHuman` may use `out.info()` helper
- **Fix Required**: Use plain `console.log()` instead of `out.info()`
- **Test**: `output.should.not.include('[info]')`

### S3: Never Exceed Token Budget
- **Property**: Output MUST NOT exceed ~800 tokens for 5 lessons
- **Why**: Claude's context window is limited; must leave room for code and instructions
- **Calculation**: 5 lessons × 160 tokens/lesson max
- **Test**: Measure token count of formatted output (use GPT-2 tokenizer estimate)

### S4: Never Block Session Start
- **Property**: Exit code MUST be 0 even on errors
- **Why**: Command is called from Claude Code hooks with `|| true`, but should succeed on its own
- **Test**: All error conditions (no lessons, corrupted data, etc.) return exit 0

### S5: Never Output Invalid JSON
- **Property**: With `--json` flag, output MUST be valid JSON
- **Why**: Parsers will fail silently or loudly, breaking automation
- **Test**: `JSON.parse(output)` must not throw

### S6: Never Omit Created Date
- **Property**: Every lesson in output MUST include a date
- **Why**: Recency is crucial context for Claude to judge relevance
- **Constraint**: `lesson.created` field is required by schema
- **Test**: Verify date appears in every lesson entry

## Liveness Properties (Must EVENTUALLY Happen)

### L1: Output Completes Within 500ms
- **Property**: Command MUST complete within 500ms for <1000 lessons
- **Timeline**: p95 latency < 500ms
- **Why**: Session start delay is user-visible
- **Monitoring**: Log slow executions (>500ms)
- **Test**: Measure execution time with realistic data

### L2: Graceful Degradation on Empty
- **Property**: When no lessons exist, MUST show friendly message (not error)
- **Why**: New repositories start with zero lessons; should not appear broken
- **Message**: `"No high-severity lessons found."` (informational, not error tone)
- **Test**: Check message tone and exit code

### L3: Clarity Over Verbosity
- **Property**: Output format MUST prioritize clarity for Claude
- **Why**: Claude needs to quickly identify relevant lessons; extra metadata is noise
- **Target Format**:
  ```markdown
  ## Lessons from Past Sessions

  These lessons were captured from previous corrections and should inform your work:

  1. **Use Polars for files >100MB** (performance)
     Learned: 2025-01-28 via user correction

  Consider these lessons when planning and implementing tasks.
  ```
- **Test**: Human review of formatted output

### L4: Summary Footer Respects --quiet
- **Property**: With `--quiet` flag, MUST suppress summary footer
- **Why**: Quiet mode is for piping to tools; summary line is noise
- **Test**: `runCli('load-session --quiet')` should not include "N lessons loaded"

## Edge Cases

### E1: Zero Lessons
- **Scenario**: Repository has no high-severity lessons
- **Expected**:
  - Human: `"No high-severity lessons found."`
  - JSON: `{"lessons": [], "count": 0}`
  - Exit code: 0

### E2: Lessons Without Tags
- **Scenario**: Lesson has `tags: []`
- **Expected**: Omit tags line entirely (not "Tags: (none)" or empty line)
- **Test**: Output should not contain "Tags:" for tagless lessons

### E3: Very Long Insight
- **Scenario**: Lesson insight is 500+ characters
- **Expected**: Display full insight (no truncation); token budget handles via lesson limit
- **Test**: Create lesson with 500-char insight, verify full text appears

### E4: Special Characters in Insight
- **Scenario**: Insight contains markdown characters (`, *, #, etc.)
- **Expected**: Display as-is (no escaping needed in markdown output)
- **Test**: Lesson with insight `Use **Polars** for \`large\` files` renders correctly

### E5: Multiple Lessons Same Date
- **Scenario**: 3 lessons created on same day
- **Expected**: All show same date; tie-breaking by created timestamp (time component)
- **Test**: Verify sort order respects full ISO timestamp

### E6: Corrupted Lessons File
- **Scenario**: `.claude/lessons/index.jsonl` has malformed JSON line
- **Expected**: Skip corrupted lines, show valid lessons, exit code 0
- **Current Behavior**: `readLessons` handles via `skippedCount`
- **Test**: Append invalid JSON, verify command still works

## Token Budget Analysis

### Current Format (line 274-294)
```
## Session Lessons (High Severity)

1. [L12345678] Use Polars for files >100MB, not pandas
   - Source: user_correction (2025-01-28)
   - Tags: performance, data

---
2 high-severity lessons loaded.
```

**Token Estimate** (per lesson): ~40 tokens
- Header: 6 tokens (one-time)
- Per lesson: 8 (ID) + 20 (insight) + 10 (source/date) + 5 (tags) = 43 tokens
- Footer: 5 tokens (one-time)
- **5 lessons**: 6 + (43 × 5) + 5 = **226 tokens**

### Target Format
```markdown
## Lessons from Past Sessions

These lessons were captured from previous corrections and should inform your work:

1. **Use Polars for files >100MB** (performance)
   Learned: 2025-01-28 via user correction

Consider these lessons when planning and implementing tasks.
```

**Token Estimate** (per lesson): ~30 tokens
- Header + preamble: 20 tokens (one-time)
- Per lesson: 3 (number) + 20 (insight) + 8 (metadata) = 31 tokens
- Footer: 10 tokens (one-time)
- **5 lessons**: 20 + (31 × 5) + 10 = **185 tokens**

**Savings**: 226 - 185 = **41 tokens** (18% reduction)
**Benefit**: Clearer signal-to-noise ratio for Claude

## Implementation Notes

### Files to Modify
1. `src/cli.ts` - `outputSessionLessonsHuman()` function (lines 274-294)
2. `src/cli.test.ts` - Update tests for `load-session` command (lines 769-872)

### Breaking Changes
- Output format changes (human-readable only)
- JSON format unchanged (stable API)
- Exit behavior unchanged (always 0)

### Backward Compatibility
- `--json` output format: UNCHANGED (stable)
- Exit code: UNCHANGED (always 0)
- Hook integration: UNCHANGED (command signature same)

## Test Strategy

### Property-Based Tests
```typescript
it('human output never includes lesson IDs', () => {
  fc.assert(
    fc.property(fc.array(createFullLesson('high'), 1, 5), (lessons) => {
      const output = outputSessionLessonsHuman(lessons, false);
      return !output.match(/\[L[a-f0-9]{8}\]/);
    })
  );
});

it('token count stays under budget', () => {
  const lessons = Array(5).fill(null).map((_, i) =>
    createFullLesson('high', { insight: 'A'.repeat(100) })
  );
  const output = outputSessionLessonsHuman(lessons, false);
  const tokenCount = estimateTokens(output);
  expect(tokenCount).toBeLessThan(800);
});
```

### Unit Tests
- Zero lessons case
- 1 lesson case
- 5 lessons case (at limit)
- Lessons with/without tags
- `--quiet` flag behavior
- Exit code always 0

### Integration Tests
- Real JSONL file with mixed severities
- Corrupted JSONL (verify graceful handling)
- Hook integration (verify Claude Code context)

## Validation Checklist

Before marking work complete, ALL must pass:

- [ ] Exit code 0 in all scenarios
- [ ] No lesson IDs in human-readable output
- [ ] No `[info]` prefix
- [ ] Token budget under 800 for 5 lessons
- [ ] JSON output unchanged (backward compatibility)
- [ ] `--quiet` suppresses footer
- [ ] Empty state shows friendly message
- [ ] Execution time < 500ms (p95)
- [ ] All edge cases handled
- [ ] Tests pass at 100%
- [ ] `/implementation-reviewer` returns APPROVED
