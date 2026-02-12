# Spec-Driven Development

Specifications define WHAT we build before we build it. They prevent scope creep, ensure alignment, and create testable acceptance criteria.

## When Specs Are Required

Create a spec for:

- **New features (P1+)**: Any significant functionality addition
- **Breaking changes**: API changes, schema migrations, behavior modifications
- **Security-sensitive code**: Authentication, authorization, data handling
- **Data migrations**: Schema changes, data transformations
- **Complex refactoring**: Cross-module changes, architectural decisions

Specs are NOT required for:

- Bug fixes (unless they change behavior)
- Documentation updates
- Dependency updates
- Simple refactoring within a module

## How to Use the Template

1. Copy `TEMPLATE.md` to a new file with naming convention `NNNN-feature-name.md`
2. Fill in all sections. Delete placeholder text as you go.
3. If a section does not apply, write "N/A" with brief explanation
4. Get spec reviewed before implementation begins
5. Update status as work progresses: Draft -> Review -> Approved -> Implemented

## Naming Convention

```
NNNN-feature-name.md
```

- `NNNN`: Four-digit sequential number (0001, 0002, ...)
- `feature-name`: Kebab-case description of the feature

Examples:
- `0001-jsonl-storage.md`
- `0002-embedding-cache.md`
- `0003-lesson-retrieval.md`

## Spec Lifecycle

1. **Draft**: Author writes spec, iterates on content
2. **Review**: Team reviews spec, provides feedback
3. **Approved**: Spec accepted, implementation can begin
4. **Implemented**: Feature complete, spec archived

## Tips for Good Specs

- **Be specific**: Vague specs lead to scope creep
- **Be testable**: Every acceptance criterion should be verifiable
- **Define boundaries**: Out of Scope is as important as Requirements
- **Consider failure**: Edge cases and error handling upfront
- **Keep it short**: If a spec exceeds 2 pages, split the feature

## Location

All specs live in `docs/specs/`. The main project spec is `docs/SPEC.md`.
