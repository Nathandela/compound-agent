# Linting for Agents

Standards for writing lint rules and structural tests that keep AI agents on track mechanically, without relying on documentation alone.

---

## A. Philosophy: Why Lint Differently for Agents

Agents lack accumulated project knowledge. They operate within fixed context windows and depend on mechanical feedback to stay aligned with project conventions.

**The enforcement hierarchy:**

1. **Enforce mechanically** (lint rules, `go vet`, structural tests) -- highest reliability
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

| Tier | Enforcement | Go Tool | Example |
|------|-------------|---------|---------|
| Inviolable | `go vet` + golangci-lint (`error`) -- blocks CI | `gosec`, `govet` | SQL injection via string concat, hardcoded secrets |
| Strong Default | golangci-lint (`warning`) -- visible, non-blocking | `funlen`, `gocognit` | Function > 50 lines, cyclomatic complexity |
| Soft Default | Structural test -- visible in test run | `go test` | No `utils/` dirs, package naming conventions |
| Recommended | Documentation only | -- | Naming conventions, ADR format |

**Severity determines agent behavior**: Errors demand immediate action. Warnings surface in output but don't block. Info-level issues appear in test output for awareness.

### Current Lint Stack

The project uses `go vet` (via `make lint`) as the baseline. To add golangci-lint, create a `.golangci.yml` in `go/` with rules mapped to the tiers above.

Key linter mappings from the TS era to Go equivalents:

| TS Rule | Go Equivalent | Linter |
|---------|---------------|--------|
| `no-sql-interpolation` | Detect string concat in SQL | `gosec` (G201, G202) |
| `max-lines` (300) | File line limit | `lll` or custom |
| `max-function-lines` (50) | Function length limit | `funlen` |
| `max-depth` | Cyclomatic complexity | `gocognit` |
| `no-hardcoded-secrets` | Hardcoded credentials | `gosec` (G101) |

---

## C. Writing Agent-Targeted Error Messages

Error messages are the primary interface between lint rules and agents. Every violation message must answer three questions:

1. **What** violated? (the fact)
2. **How** to fix it? (the action)
3. **Where** to learn more? (the reference)

### Message Format

```
SEVERITY [lint] rule-id: file:line -- message -- remediation
```

### Before / After Examples

**Bad** -- states the problem, not the fix:

```
File too long (312/300)
```

**Good** -- states problem, fix, and reference:

```
WARN [lint] funlen: internal/search/vector.go:15 -- Function SearchVector is 62 lines (limit 50) --
Split into smaller functions. See: docs/standards/code-organization.md
```

**Bad** -- vague pattern match:

```
Pattern matched on line 42
```

**Good** -- specific, actionable:

```
ERROR [lint] gosec-G201: internal/storage/sqlite.go:42 --
String concatenation in SQL query -- Use parameterized queries with ? placeholders.
See: docs/standards/code-organization.md
```

### Message Guidelines

- State the violation and the fix, not just the fact
- Keep under 3 lines (context budget)
- Include a `See:` doc reference when a standard exists
- Use `file:line` format so agents can navigate directly
- Write in imperative mood ("Split function", "Use parameterized queries")

---

## D. Custom Rule Development Guide

For Go, custom lint rules can be implemented as:

1. **`go vet` analyzers** -- for AST-level checks
2. **Shell scripts in Makefile** -- for simple structural checks
3. **Test assertions** -- for project-specific invariants

### Adding a Structural Check via Test

```go
func TestNoUtilsPackages(t *testing.T) {
    entries, err := os.ReadDir("../../internal")
    require.NoError(t, err)
    for _, e := range entries {
        if e.IsDir() {
            assert.NotEqual(t, "utils", e.Name(),
                "Avoid 'utils' packages -- give it a clear responsibility name")
        }
    }
}
```

### Adding a Makefile Check

```makefile
check-line-count:
	@find internal -name '*.go' | while read f; do \
		lines=$$(wc -l < "$$f"); \
		if [ "$$lines" -gt 300 ]; then \
			echo "WARN [lint] max-file-lines: $$f -- $$lines lines exceeds 300-line limit"; \
		fi; \
	done
```

---

## E. Structural Tests Guide

Structural tests verify project invariants that don't need AST parsing. They run as part of the normal `go test` suite.

### What Qualifies

- File/directory existence and naming conventions
- Export structure and package boundaries
- Template completeness and format
- Configuration consistency

### When to Promote to a Lint Rule

Promote a structural test to a golangci-lint custom rule when:

- It applies across repositories (not just this project)
- It needs configurable parameters
- It should produce agent-formatted violation messages

Keep as a structural test when:

- It's specific to this project's conventions
- It's simple enough to express in a few test assertions

---

## F. The Golden Principles Pattern

A continuous improvement loop for catching agent mistakes mechanically.

### The Loop

```
1. Identify a repeated agent mistake
2. Define the rule precisely enough to be mechanical
3. Write the check (lint rule, vet analyzer, or structural test)
4. Write the agent-targeted error message
5. Add to .golangci.yml, Makefile, or test suite
6. Document in this standard (update the tier table)
```

### Decision: Lint Rule vs. Structural Test

| Signal | Use Lint Rule | Use Structural Test |
|--------|--------------|-------------------|
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

- [code-organization.md](code-organization.md) -- Package size limits enforced by lint rules
- [anti-patterns.md](anti-patterns.md) -- Anti-pattern tiers with corresponding enforcement
- [test-architecture.md](test-architecture.md) -- Test organization and structural test patterns
- `go/Makefile` -- `make lint` (`go vet`) and `make test` targets
