# Linting for Agents

Standards for writing lint rules and structural tests that keep AI agents on track mechanically, without relying on documentation alone.

---

## A. Philosophy: Why Lint Differently for Agents

Agents lack accumulated project knowledge. They operate within fixed context windows and depend on mechanical feedback to stay aligned with project conventions.

**The enforcement hierarchy:**

1. **Enforce mechanically** (lint rules, structural tests) -- highest reliability
2. **Document explicitly** (CLAUDE.md, standards docs) -- agents may read it
3. **Hope agents infer it** -- unreliable, do not depend on this

Key insights from research:

- **Anthropic (C compiler project)**: Tests are the primary steering mechanism for autonomous agents. Without mechanical feedback, agents drift quickly.
- **OpenAI (harness engineering)**: Custom linters with error messages that inject remediation into agent context are more effective than documentation alone. The bottleneck is human attention, so enforcement must be automated.
- **Context window budget**: Every lint message consumes context. Output must be concise and actionable -- verbose warnings waste the agent's working memory.

**Rule of thumb**: If you've corrected the same mistake twice, write a lint rule. Documentation drifts; lint rules don't.

---

## B. Rule Categories Mapped to Enforcement Tiers

The project uses a tiered system (see [anti-patterns.md](anti-patterns.md)) for rule severity. Each tier maps to a specific enforcement mechanism:

| Tier | Enforcement | Severity | Example |
|------|-------------|----------|---------|
| Inviolable | Rule check (`error`) -- blocks CI | `error` | no-sql-interpolation, no-hardcoded-secrets |
| Strong Default | Rule check (`warning`) -- visible, non-blocking | `warning` | max-lines (300), max-depth |
| Soft Default | Structural test -- visible in test run | `info` | no-utils-dirs, barrel export conventions |
| Recommended | Documentation only | -- | naming conventions, ADR format |

**Severity determines agent behavior**: Errors demand immediate action. Warnings surface in output but don't block. Info-level issues appear in test output for awareness.

---

## C. Writing Agent-Targeted Error Messages

Error messages are the primary interface between lint rules and agents. Every violation message must answer three questions:

1. **What** violated? (the fact)
2. **How** to fix it? (the action)
3. **Where** to learn more? (the reference)

### The `formatViolation()` Pattern

The rule engine (`src/rules/engine.ts`) formats violations as single-line, agent-legible output:

```
SEVERITY [rules] rule-id: file:line -- message -- remediation
```

The `remediation` field on each rule is always appended, ensuring every violation includes a fix instruction.

### Before / After Examples

**Bad** -- states the problem, not the fix:

```
File too long (312/300)
```

**Good** -- states problem, fix, and reference:

```
WARN [rules] max-file-lines: src/memory/search.ts -- 312 lines exceeds 300-line limit --
Split module: extract related functions to new file in same directory,
re-export from index.ts. See: docs/standards/code-organization.md
```

**Bad** -- vague pattern match:

```
Pattern matched on line 42
```

**Good** -- specific, actionable:

```
ERROR [rules] no-sql-interpolation: src/storage/query.ts:42 --
String interpolation in SQL query -- Use parameterized queries with ? placeholders.
See: docs/standards/typescript-best-practices.md
```

### Message Guidelines

- State the violation and the fix, not just the fact
- Keep under 3 lines (context budget)
- Include a `See:` doc reference when a standard exists
- Use `file:line` format so agents can navigate directly
- Write in imperative mood ("Split module", "Use parameterized queries")

---

## D. Custom Rule Development Guide

Rules live in `src/rules/checks/` and are configured in `.claude/rules.json`.

### Adding a New Check

**1. Define the check type** (if needed) in `src/rules/types.ts`:

```typescript
// Add a new Zod schema for the check
export const MyCheckSchema = z.object({
  type: z.literal('my-check'),
  // ... check-specific fields
});

// Add to the discriminated union
export const RuleCheckSchema = z.discriminatedUnion('type', [
  FilePatternCheckSchema,
  FileSizeCheckSchema,
  ScriptCheckSchema,
  MyCheckSchema,  // <-- add here
]);
```

**2. Implement the check** in `src/rules/checks/my-check.ts`:

```typescript
import type { MyCheck } from '../types.js';
import type { Violation } from '../engine.js';

export function runMyCheck(baseDir: string, check: MyCheck): Violation[] {
  const violations: Violation[] = [];
  // ... scan files, detect violations
  // Each violation needs: { file?, line?, message }
  return violations;
}
```

Follow the pattern in `src/rules/checks/file-pattern.ts`:
- Accept `baseDir` and the typed check config
- Return `Violation[]`
- Use `findFiles()` from `./glob-utils.js` for file discovery

**3. Register in the engine** (`src/rules/engine.ts`):

```typescript
import { runMyCheck } from './checks/my-check.js';

// In runCheck() switch statement:
case 'my-check':
  return runMyCheck(baseDir, rule.check);
```

**4. Add a rule to `.claude/rules.json`**:

```json
{
  "id": "my-rule-id",
  "description": "Human-readable description",
  "severity": "error",
  "check": {
    "type": "my-check"
  },
  "remediation": "Imperative fix instruction. See: docs/relevant-doc.md"
}
```

**5. Write tests** following the pattern in `src/rules/checks/file-pattern.test.ts`:
- Test with violations present (should detect)
- Test with clean files (should pass)
- Test edge cases (empty files, missing files)

### Existing Check Types

| Type | Purpose | Key Fields |
|------|---------|------------|
| `file-pattern` | Regex match/absence on files matching a glob | `glob`, `pattern`, `mustMatch` |
| `file-size` | Line count limit on files matching a glob | `glob`, `maxLines` |
| `script` | Run a shell command, check exit code | `command`, `expectExitCode` |

---

## E. Structural Tests Guide

Structural tests verify project invariants that don't need AST parsing. They run as part of the normal test suite.

### What Qualifies

- File/directory existence and naming conventions
- Export structure (barrel files, public APIs)
- Template completeness and format
- Configuration consistency

### Pattern

```typescript
import { describe, it, expect } from 'vitest';

describe('Project Structure', () => {
  it('all agent templates have YAML frontmatter', () => {
    for (const [key, content] of Object.entries(TEMPLATES)) {
      expect(content.trimStart().startsWith('---'), `${key} missing frontmatter`).toBe(true);
    }
  });
});
```

See `src/setup/templates/agents.test.ts` for a full example.

### When to Promote to a Rule Check

Promote a structural test to `src/rules/checks/` when:

- It applies across repositories (not just this project)
- It needs configurable parameters (globs, thresholds)
- It should produce agent-formatted violation messages
- It should be severity-configurable per project

Keep as a structural test when:

- It's specific to this project's conventions
- It's simple enough to express in a few test assertions
- The Vitest output is sufficient feedback

---

## F. The Golden Principles Pattern

A continuous improvement loop for catching agent mistakes mechanically.

### The Loop

```
1. Identify a repeated agent mistake
2. Define the rule precisely enough to be mechanical
3. Write the check (rule or structural test)
4. Write the agent-targeted error message
5. Add to rules.json or test suite
6. Document in this standard (update the tier table)
```

### Decision: Rule Check vs. Structural Test

| Signal | Use Rule Check | Use Structural Test |
|--------|---------------|-------------------|
| Cross-repo applicability | Yes | No |
| Needs configurable severity | Yes | No |
| About code content (patterns, size) | Yes | No |
| About project structure (files, dirs) | No | Yes |
| Needs formatted violation output | Yes | No |

### Graduating from Documentation to Enforcement

Not everything needs a lint rule. Start with documentation. If the same mistake recurs, escalate:

```
Recommended (doc only) --> Soft Default (structural test) --> Strong Default (warning rule) --> Inviolable (error rule)
```

Each escalation should be justified by evidence of repeated violations.

---

## References

- [code-organization.md](code-organization.md) -- Module size limits enforced by lint rules
- [anti-patterns.md](anti-patterns.md) -- Anti-pattern tiers with corresponding enforcement
- [test-architecture.md](test-architecture.md) -- Test organization and structural test patterns
- `src/rules/engine.ts` -- Rule engine, `formatViolation()` function
- `src/rules/types.ts` -- Zod schemas for rule configuration
- `src/rules/checks/file-pattern.ts` -- Reference check implementation
- `src/setup/templates/agents.test.ts` -- Reference structural test
