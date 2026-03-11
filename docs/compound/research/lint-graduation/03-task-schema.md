# Beads Task Schema for Lint Rule Proposals

**Research for**: `learning_agent-fpbh`
**Date**: 2026-03-11
**Purpose**: Design the beads task structure for proposed lint rules

---

## Executive Summary

A lint rule proposal uses existing beads fields deliberately: `description` for the self-contained rule spec, `design` for implementation architecture (Class B AST rules only), and `acceptance_criteria` for test cases. Two classes of rules exist: Class A (native compound-agent `rules.json` — regex/glob) and Class B (external linter — requires AST analysis). The schema must be linter-agnostic but concrete enough for a future agent to implement without reading the source lesson.

---

## Two Rule Classes

| Class | Target | Check Type | Complexity | Example |
|-------|--------|------------|------------|---------|
| **A** | compound-agent `rules.json` | `file-pattern`, `file-size`, `script` | Low — JSON entry | "no SQL string interpolation" |
| **B** | External linter (ESLint, Ruff, ast-grep) | AST visitor, selector | Medium-High — plugin code | "no `if(condition){expect()}`" |

---

## Beads Field Mapping

| Field | Purpose | Content |
|-------|---------|---------|
| `title` | Concise rule name | `Lint Rule: <rule-id> (from <lesson-id>)` |
| `description` | Full self-contained rule spec | Structured markdown (see below) |
| `design` | Implementation architecture (Class B only) | AST meta, plugin registration steps |
| `acceptance_criteria` | Pass/fail test cases | Code that should/shouldn't trigger |
| `notes` | Left blank at creation | Used by implementer for progress |
| `priority` | From lesson severity | high->1, medium->2, low->3 |
| `issue_type` | Always `task` | Implementation task |

---

## Description Template

```markdown
## Source Lesson
ID: {lesson_id}
Insight: {verbatim insight text}

## Rule Identity
- ID: {kebab-case-rule-id}
- Target: {eslint | ruff-config | clippy-config | golangci-config | ast-grep | file-pattern}
- Severity: {error | warning | info}
- Scope: {glob pattern for affected files}

## Detection Spec
{For Class A: check type, regex, glob, mustMatch flag}
{For Class B: natural language description of AST pattern + suggested selector}
{Mark selectors as "suggested, verify before use"}

## Violation Message
{What the developer sees when the rule fires}
{Must answer: what violated, how to fix, where to learn more}
{Under 3 lines, imperative mood}

## Remediation
{Concrete fix instruction}
{See: docs/path/to/reference.md}

## Code Examples
Bad:
  {code that violates the rule}

Good:
  {code that follows the rule}
```

---

## Design Field (Class B Only)

```markdown
## Linter Meta
{ESLint meta object fields, ast-grep rule YAML, or equivalent}

## Plugin Registration
{How to wire the rule into the project's linter config}
{Flag if no existing plugin infrastructure exists}
```

---

## Acceptance Criteria Template

```markdown
## Should Trigger (violations)
{2-3 code snippets with comments explaining why each triggers}

## Should NOT Trigger (clean)
{2-3 code snippets that are similar but correct}

## Edge Cases
{Strings containing the pattern, comments, etc.}
```

---

## Class A Simplification

For native `rules.json` rules, the detection spec is just:

```markdown
## Detection Spec
Check type: file-pattern
Glob: src/**/*.ts
Pattern: {regex}
mustMatch: false
```

And the `design` field stays empty.

---

## Concrete Example: Class B Rule

**Title**: `Lint Rule: no-conditional-expect (from Lb594d59f)`

**Description**:
```markdown
## Source Lesson
ID: Lb594d59f
Insight: Never use `if (condition) { expect() }` inside test bodies — creates
silent passes when condition is false. Use `it.runIf()` or `it.skipIf()`.

## Rule Identity
- ID: no-conditional-expect
- Target: eslint (Class B — AST analysis)
- Severity: error
- Scope: src/**/*.test.ts, src/**/*.spec.ts

## Detection Spec
Detect `if` statements whose body contains a call to `expect`.

Suggested ESLint selectors:
  IfStatement > BlockStatement > ExpressionStatement > CallExpression[callee.name='expect']
  IfStatement > ExpressionStatement > CallExpression[callee.name='expect']

Verify with astexplorer.net before use.

## Violation Message
"Conditional expect() creates silent passes when condition is false.
Use it.runIf(condition) or it.skipIf(!condition) instead.
See: docs/standards/test-architecture.md"

## Remediation
Use `it.runIf(condition)` or `it.skipIf(!condition)` to make skip/run explicit.
Move assertions outside conditional blocks.

## Code Examples
Bad:
  if (someCondition) {
    expect(result).toBe(true);
  }

Good:
  it.runIf(someCondition)('description', () => {
    expect(result).toBe(true);
  });
```

**Acceptance Criteria**:
```markdown
## Should Trigger
if (isAvailable) { expect(result).toBe(true); }
if (items.length > 0) { expect(items[0]).toBeDefined(); }

## Should NOT Trigger
it.runIf(isAvailable)('test', () => { expect(result).toBe(true); });
expect(result).toBe(true);  // unconditional
if (isAvailable) { doSomethingElse(); }  // no expect

## Edge Cases
const msg = "expect something";  // string literal — must not trigger
// expect(x).toBe(y)  // comment — must not trigger
```

---

## Key Design Decisions

1. **Self-contained tasks**: Implementer should not need to read the source lesson
2. **Source linkage**: Lesson ID in title + verbatim insight in description preserves "why"
3. **AST selectors are suggestions**: Mark as "verify before use" — LLM-generated selectors may be wrong
4. **`acceptance_criteria` field**: Currently unused in practice — using it here is a meaningful improvement
5. **Class A vs B distinction**: Must be explicit in the task because implementation paths differ entirely
