# Invariants for Prime Command

## Purpose

The `prime` command generates trust language guidelines for Claude Code that include high-severity lessons from the learning agent. This document defines the invariants that the output MUST maintain using Lamport's safety/liveness framework.

## Module Overview

**Command**: `npx lna prime`

**Inputs**:
- Repository root directory (implicit)
- No command-line flags (simple zero-config design)

**Outputs**:
- Human-readable markdown optimized for Claude Code's context window
- Includes Beads-style trust language patterns
- Includes top 3-5 high-severity lessons from `loadSessionLessons()`

**Exported Function**:
- `getPrimeContext(): Promise<string>` - For MCP server integration

**State**:
- Reads lessons from `.claude/lessons/index.jsonl`
- Filters via `loadSessionLessons()` for `type: 'full'`, `severity: 'high'`, `confirmed: true`
- Sorts by recency (most recent first)
- Returns up to 5 lessons (via `loadSessionLessons` default limit)

## Data Invariants

### DI-1: Total Token Budget
- **Invariant**: Total output MUST be < 2K tokens (~8000 characters)
- **Rationale**: Prime output is for context recovery after compaction; must be compact
- **Breakdown**:
  - Trust language guidelines: ~1200 tokens (~4800 chars)
  - High-severity lessons: ~800 tokens (~3200 chars, 5 lessons × 160 tokens)
- **Test**: `estimateTokens(output) < 2000`

### DI-2: Output Structure
Output MUST contain exactly 3 sections in this order:
1. **Trust Language Guidelines** (Beads-style prohibitions and workflow)
2. **Emergency Recall Section** (`# 🔴 Mandatory Recall`)
3. **High-Severity Lessons** (from `loadSessionLessons()`)

**Test**: Verify all 3 sections present via header matching

### DI-3: Trust Language Pattern Requirements
Trust language section MUST include:
- **Explicit prohibitions**: `**Default**` and `**Prohibited**` markers
- **Emergency framing**: `# 🔴 Mandatory Recall` section header
- **Workflow sequencing**: `**Workflow**` markers for step-by-step process
- **Consequences language**: `NEVER skip...` phrasing

**Example format**:
```markdown
## Core Constraints

**Default**: Edit .claude/lessons/index.jsonl directly
**Prohibited**: NEVER edit this file manually. Use CLI commands only.

**Workflow**:
1. User corrects you
2. Capture lesson: `lna learn "insight"`
3. Lesson loads automatically next session

NEVER skip the quality gate (novel + specific + actionable).
```

**Test**: Verify presence of required keywords and patterns

### DI-4: Emergency Recall Section
- **Header**: Exactly `# 🔴 Mandatory Recall`
- **Content**: Top 3-5 high-severity lessons formatted for maximum signal
- **Format per lesson**:
  ```
  - **{insight}** ({tags_if_present})
    Learned: {YYYY-MM-DD} via {formatted_source}
  ```
- **No lesson IDs**: Internal identifiers MUST NOT appear
- **No noise words**: No `[info]`, no redundant context

**Test**: Parse section, verify structure matches spec

### DI-5: Lesson Integration
- **Source**: MUST use `loadSessionLessons(repoRoot, limit)` function
- **Limit**: Default to 5 (via `loadSessionLessons` default)
- **Filter**: Only `high` severity, confirmed, not invalidated (enforced by `loadSessionLessons`)
- **Sort**: Most recent first (enforced by `loadSessionLessons`)
- **Test**: Mock `loadSessionLessons`, verify called with correct args

### DI-6: Character Encoding
- **Invariant**: Output MUST be valid UTF-8
- **Why**: Emoji in headers (`🔴`) requires proper encoding
- **Test**: `Buffer.from(output, 'utf-8').toString('utf-8') === output`

### DI-7: Exit Code
- **Invariant**: Exit code ALWAYS 0, regardless of lesson count
- **Why**: Prime is for recovery; must never block context restoration
- **Test**: `expect(exitCode).toBe(0)` even when no lessons exist

### DI-8: Empty Lessons Case
When no high-severity lessons exist:
- **Behavior**: Omit Emergency Recall section entirely
- **Structure**: Output only trust language guidelines
- **No error message**: Absence of lessons is valid state
- **Test**: Verify output structure when `loadSessionLessons()` returns `[]`

## Safety Properties (Must NEVER Happen)

### S1: Never Exceed Token Budget
- **Property**: Output MUST NOT exceed 2K tokens (~8000 characters)
- **Why**: Defeats purpose of compact context recovery
- **Enforcement**: Hard limit check before output
- **Monitoring**: Log outputs exceeding 1800 tokens (90% threshold)
- **Test**: Property-based test with varying lesson counts and insight lengths

### S2: Never Include Lesson IDs
- **Property**: Internal lesson IDs (e.g., `[L12345678]`) MUST NOT appear in output
- **Why**: IDs are implementation details; add noise without value for Claude
- **Test**: `output.should.not.match(/\[L[a-f0-9]{8}\]/)`

### S3: Never Include Implementation Details
- **Property**: Output MUST NOT expose internal system details
- **Prohibited terms**: "SQLite", "JSONL format", "embedding vectors", "compaction level"
- **Why**: Claude needs behavior, not implementation
- **Test**: Grep for prohibited terms

### S4: Never Use Vague Language
- **Property**: Trust language MUST be specific and actionable
- **Bad**: "Try to use CLI commands when possible"
- **Good**: "**Prohibited**: NEVER edit .claude/lessons/index.jsonl directly"
- **Test**: Manual review of trust language section for weak verbs ("try", "should", "might")

### S5: Never Omit Workflow Context
- **Property**: MUST include enough context for Claude to understand when/how to use commands
- **Required elements**:
  - When to capture lessons (correction triggers)
  - How to capture (`lna learn` command)
  - Quality gate criteria (novel, specific, actionable)
  - Session-start auto-loading behavior
- **Test**: Verify all required elements present

### S6: Never Break on Zero Lessons
- **Property**: Output MUST be valid and useful even with zero lessons
- **Why**: New repositories or freshly compacted repos may have no high-severity lessons
- **Expected**: Show trust language guidelines only (omit Emergency Recall section)
- **Test**: `getPrimeContext()` with empty repo returns valid output

### S7: Never Use Inconsistent Trust Language
- **Property**: All trust language patterns MUST follow Beads conventions
- **Beads patterns**:
  - `**Default**` / `**Prohibited**` pairs
  - `**Workflow**` for sequences
  - `NEVER` for absolute constraints (not "don't", "avoid")
  - `MUST` for requirements (not "should")
- **Test**: Regex validation of trust language markers

### S8: Never Duplicate Information
- **Property**: Each piece of information MUST appear exactly once
- **Why**: Token budget is tight; duplication wastes tokens
- **Example violation**: Repeating "Use lna learn" in both workflow and commands sections
- **Test**: Text similarity analysis for duplicate content blocks

## Liveness Properties (Must EVENTUALLY Happen)

### L1: Output Completes Within 100ms
- **Property**: Command MUST complete within 100ms for <1000 lessons
- **Timeline**: p95 latency < 100ms
- **Why**: Used for context recovery; must be fast
- **Note**: Slower than `load-session` because includes trust language formatting
- **Monitoring**: Log slow executions (>100ms)
- **Test**: Measure execution time with realistic data

### L2: Clarity Over Completeness
- **Property**: Output format MUST prioritize essential information
- **Why**: Token budget forces tradeoffs; focus on highest-value content
- **Prioritization**:
  1. Absolute constraints (`NEVER` statements)
  2. Core workflow (capture → storage → retrieval)
  3. Quality gate (novel, specific, actionable)
  4. High-severity lessons
  5. Optional: Command reference (if space permits)
- **Test**: Manual review for signal-to-noise ratio

### L3: getPrimeContext() API Stability
- **Property**: Exported function signature MUST remain stable for MCP server
- **Signature**: `export async function getPrimeContext(repoRoot?: string): Promise<string>`
- **Default**: Use `getRepoRoot()` if not provided
- **Test**: Integration test with MCP server mock

### L4: Trust Language Updates Reflect Reality
- **Property**: Trust language MUST stay synchronized with actual system behavior
- **Why**: Out-of-date instructions confuse Claude
- **Enforcement**: Update prime output when commands change
- **Test**: Cross-reference with CLI command help text

## Edge Cases

### E1: Zero Lessons
- **Scenario**: Repository has no high-severity lessons
- **Expected**: Output trust language only (omit Emergency Recall section)
- **Test**: Verify structure with `loadSessionLessons()` returning `[]`

### E2: One Lesson
- **Scenario**: Only 1 high-severity lesson exists
- **Expected**: Show Emergency Recall with 1 lesson (no minimum threshold)
- **Test**: Verify formatting with single lesson

### E3: Exactly 5 Lessons
- **Scenario**: 5 high-severity lessons (at limit)
- **Expected**: Show all 5, stay under token budget
- **Test**: Measure tokens with 5 lessons of varying lengths

### E4: Very Long Insight
- **Scenario**: One lesson has 300-character insight
- **Expected**: Include full insight; may push toward token limit but should stay under
- **Constraint**: Trust language is fixed cost; lessons are variable
- **Test**: Generate lesson with max-length insight, verify total under 2K tokens

### E5: Lessons Without Tags
- **Scenario**: High-severity lesson has `tags: []`
- **Expected**: Omit tag display entirely: `**{insight}**` (no empty parens)
- **Test**: Verify no `()` appears for tagless lessons

### E6: Special Characters in Insight
- **Scenario**: Insight contains markdown characters (`, *, #, etc.)
- **Expected**: Display as-is; markdown interprets boldface/code correctly
- **Test**: Lesson with `Use **Polars** for \`large\` files` renders correctly

### E7: Corrupted Lessons File
- **Scenario**: `.claude/lessons/index.jsonl` has malformed JSON line
- **Expected**: `loadSessionLessons()` handles gracefully (skips corrupted lines)
- **Behavior**: Show available lessons, exit code 0
- **Test**: Append invalid JSON, verify command still works

### E8: Model Not Downloaded
- **Scenario**: Embedding model not available
- **Expected**: Command succeeds (does NOT require embeddings)
- **Why**: Prime uses `loadSessionLessons()` which filters by severity (no vector search)
- **Test**: Run with `isModelAvailable() === false`, verify success

### E9: Trust Language Section Too Large
- **Scenario**: Trust language guidelines approach 1500 tokens
- **Expected**: Reduce lesson count to maintain 2K total budget
- **Priority**: Trust language is more important than lessons (lessons can be retrieved via `check-plan`)
- **Test**: If trust language > 1200 tokens, reduce `loadSessionLessons()` limit to 3

## Token Budget Analysis

### Trust Language Section (Target: ~1200 tokens)

```markdown
# Learning Agent Workflow

## 🔴 Core Constraints

**Default**: Edit .claude/lessons/index.jsonl directly
**Prohibited**: NEVER edit this file manually. Use CLI commands only.

**Default**: Propose any lesson that seems useful
**Prohibited**: NEVER propose lessons without quality gate (novel + specific + actionable).

## Workflow

**Workflow**: When user corrects you:
1. Check quality gate (ALL must pass):
   - Novel (not already stored)
   - Specific (clear guidance)
   - Actionable (obvious what to do)
2. If pass: Capture with `lna learn "insight"`
3. If fail: Skip (most sessions have no lessons)

**Workflow**: When starting a session:
1. High-severity lessons load automatically
2. No action needed

**Workflow**: When creating a plan:
1. Check relevant lessons: `lna check-plan --plan "..."`
2. Consider lessons in implementation

NEVER skip the quality gate.
NEVER edit .claude/lessons/index.jsonl directly.
```

**Estimated tokens**: ~250 tokens (~1000 chars)

### Emergency Recall Section (Target: ~750 tokens)

```markdown
# 🔴 Mandatory Recall

Critical lessons from past corrections:

1. **Use Polars for files >100MB, not pandas** (performance, data)
   Learned: 2025-01-28 via user correction

2. **API requires X-Request-ID header for auth** (api, auth)
   Learned: 2025-01-25 via test failure

3. **Never modify lesson.id after creation** (storage, correctness)
   Learned: 2025-01-20 via self correction

4. **Use uv pip install, not pip directly** (tooling)
   Learned: 2025-01-15 via user correction

5. **Always call /implementation-reviewer before marking done** (process)
   Learned: 2025-01-10 via user correction
```

**Estimated tokens**: ~180 tokens per lesson × 5 = 900 tokens (includes section header)

### Total Budget
- Trust language: 250 tokens
- Emergency recall header: 10 tokens
- 5 lessons: 180 tokens × 5 = 900 tokens
- **Total**: ~1160 tokens

**Margin**: 2000 - 1160 = 840 tokens (42% headroom)

**Safety factor**: Can accommodate longer insights or 1-2 extra lessons without exceeding budget

## Implementation Notes

### Files to Create/Modify

1. **`src/commands/management/prime.ts`** (modify existing)
   - Keep existing `registerPrimeCommand()` function
   - Replace `PRIME_WORKFLOW_CONTEXT` constant with `generatePrimeContext()` function
   - Add `getPrimeContext()` export for MCP server

2. **`src/commands/management/prime.test.ts`** (create new)
   - Test output structure (3 sections)
   - Test token budget (< 2K)
   - Test zero lessons case
   - Test trust language patterns
   - Test `getPrimeContext()` API

3. **`src/index.ts`** (modify)
   - Export `getPrimeContext` for MCP server use

### Function Signature

```typescript
/**
 * Generate prime context output for Claude Code.
 *
 * Combines trust language guidelines with high-severity lessons
 * for context recovery after compaction or session restart.
 *
 * @param repoRoot - Repository root directory (defaults to getRepoRoot())
 * @returns Formatted markdown string (< 2K tokens)
 */
export async function getPrimeContext(repoRoot?: string): Promise<string>
```

### Trust Language Template

Store trust language as template literal with clear structure:
- Use `const TRUST_LANGUAGE_TEMPLATE = ...` for reusability
- Keep separate from lesson formatting logic
- Easy to update when workflow changes

### Lesson Formatting Function

```typescript
function formatLessonForPrime(lesson: Lesson): string {
  const date = lesson.created.slice(0, 10); // YYYY-MM-DD
  const tags = lesson.tags.length > 0 ? ` (${lesson.tags.join(', ')})` : '';
  const source = formatSource(lesson.source);
  return `- **${lesson.insight}**${tags}\n  Learned: ${date} via ${source}`;
}
```

### Token Estimation

```typescript
/**
 * Rough token estimate (1 token ≈ 4 characters for English text).
 * Used for budget validation, not billing.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

### Breaking Changes
- Output format changes (prime now includes lessons)
- API additions: `getPrimeContext()` export
- No breaking changes to existing functionality

## Test Strategy

### Property-Based Tests

```typescript
it('output always under 2K tokens', () => {
  fc.assert(
    fc.property(fc.array(createFullLesson('high'), 0, 10), async (lessons) => {
      const output = await getPrimeContext(mockRepoRoot);
      const tokens = estimateTokens(output);
      return tokens < 2000;
    })
  );
});

it('never includes lesson IDs', () => {
  fc.assert(
    fc.property(fc.array(createFullLesson('high'), 1, 5), async (lessons) => {
      const output = await getPrimeContext(mockRepoRoot);
      return !output.match(/\[L[a-f0-9]{8}\]/);
    })
  );
});
```

### Unit Tests
- Zero lessons case (trust language only)
- 1 lesson case
- 5 lessons case (at limit)
- Lessons with/without tags
- Trust language pattern validation
- `getPrimeContext()` API contract

### Integration Tests
- Real JSONL file with mixed severities (verify filter works)
- Execution time < 100ms
- Output structure (3 sections)
- Token budget with realistic data

## Validation Checklist

Before marking work complete, ALL must pass:

- [ ] Exit code 0 in all scenarios
- [ ] Total output < 2K tokens (8000 chars)
- [ ] No lesson IDs in output
- [ ] Trust language follows Beads patterns (`**Default**`, `**Prohibited**`, `**Workflow**`, `NEVER`)
- [ ] Emergency Recall section present when lessons exist
- [ ] Emergency Recall section omitted when zero lessons
- [ ] Lessons use `loadSessionLessons()` (no duplicate logic)
- [ ] `getPrimeContext()` exported for MCP server
- [ ] Zero lessons case handled gracefully
- [ ] Execution time < 100ms (p95)
- [ ] All edge cases handled
- [ ] Tests pass at 100%
- [ ] `/implementation-reviewer` returns APPROVED

## References

- `src/retrieval/session.ts` - `loadSessionLessons()` function
- `doc/invariants/load-session-output.md` - Related output formatting
- `doc/SPEC.md` - Trust language requirements from Beads integration
- `.claude/CLAUDE.md` - Example trust language patterns
