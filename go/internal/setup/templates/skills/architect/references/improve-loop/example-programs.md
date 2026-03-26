# Example Programs

> Loaded on demand. Read when referenced by SKILL.md.

These templates are starting points. The architect adapts them based on findings from Phases 1-3 (Socratic dialogue, system spec, decomposition analysis). Each program targets one concern with mechanical validation.

> **Note**: These examples target Go codebases. Adapt the tooling (test commands, linters, conventions) to your project's stack. The structure (Goal with markers, Validation, Constraints) is language-agnostic.

## Code Quality

```markdown
# Code Quality

## Goal
Fix linting violations, add missing type annotations on exported functions,
and remove unreachable code. Output IMPROVED if changes were made and all
tests pass, NO_IMPROVEMENT if no issues remain, FAILED if tests break.

## Validation
- All tests pass
- No new linting violations introduced
- Changes are focused and minimal

## Scope
Focus on go/internal/ directories.
```

## Test Coverage Gaps

```markdown
# Test Coverage Gaps

## Goal
Identify exported functions without test coverage and add table-driven tests.
Prioritize error paths and edge cases. Output IMPROVED if new tests were added
and pass, NO_IMPROVEMENT if coverage is already sufficient, FAILED if new tests
don't pass.

## Validation
- All tests pass (existing and new)
- New tests cover at least one previously untested path
- Tests use table-driven pattern

## Constraints
- Do not modify existing tests
- Do not mock business logic
```

## Error Handling

```markdown
# Error Handling

## Goal
Find error returns that are silently discarded (_ = someFunc()) or wrapped
without context. Add proper error wrapping with fmt.Errorf("context: %w", err).
Output IMPROVED if error handling was improved, NO_IMPROVEMENT if none found,
FAILED if changes break tests.

## Validation
- All tests pass
- No silent error discards in changed files
- Error messages include enough context to diagnose the caller chain
```

## Dead Code Removal

```markdown
# Dead Code

## Goal
Find and remove unused functions, unexported constants, and unreachable branches.
Output IMPROVED if dead code was removed and all tests pass, NO_IMPROVEMENT if
no dead code found, FAILED if removal breaks something.

## Validation
- All tests pass
- Removed code was genuinely unreachable (verify with grep before deleting)

## Constraints
- Do not remove exported symbols (they may be used by external consumers)
- Do not remove code guarded by build tags
```

## Documentation Gaps

```markdown
# Documentation Gaps

## Goal
Add doc comments to exported functions that lack them. Follow Go conventions:
start with the function name, describe what it does (not how), mention error
conditions. Output IMPROVED if comments were added, NO_IMPROVEMENT if all
exported functions are documented, FAILED if changes don't compile.

## Validation
- Code compiles
- go vet passes
- New comments start with the function name
```
