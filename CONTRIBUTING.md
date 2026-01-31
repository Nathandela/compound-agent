# Contributing to Learning Agent

Thank you for your interest in contributing to Learning Agent! This document outlines the development workflow and standards for the project.

## Development Setup

### Prerequisites

- Node.js >= 20.0.0
- pnpm (recommended over npm/yarn)

### Installation

```bash
# Clone the repository
git clone https://github.com/Nathandela/learning_agent.git
cd learning_agent

# Install dependencies
pnpm install

# Build the project
pnpm build

# Run tests
pnpm test

# Download embedding model (required for vector search)
pnpm download-model
```

### Development Commands

```bash
pnpm build       # Build with tsup
pnpm dev         # Watch mode (rebuild on changes)
pnpm test        # Run all tests
pnpm test:watch  # Run tests in watch mode
pnpm lint        # Type checking
```

## Test-Driven Development (TDD)

This project follows strict TDD. All contributions must adhere to this workflow.

### TDD Workflow

1. **Write tests FIRST** - Tests must exist before any implementation
2. **Verify tests fail** - Run tests to confirm they fail for the right reason
3. **Implement minimal code** - Write only enough code to pass the tests
4. **Refactor when green** - Clean up only after all tests pass

### TDD Rules

- Tests must fail before implementation exists
- Never modify tests to make them pass
- One test at a time: pass one failing test before moving to the next
- Never mock business logic - use real data and real execution
- Tests must verify meaningful properties, not trivial assertions

### What NOT to Do

```typescript
// BAD: Mocking the thing being tested
vi.mock('./jsonl.js');
test('appendLesson works', () => { ... });

// BAD: Test that passes regardless of implementation
test('function exists', () => {
  expect(typeof appendLesson).toBe('function');
});

// BAD: Writing tests after implementation
```

### What TO Do

```typescript
// GOOD: Real data, real execution
test('appendLesson stores lesson and returns it', async () => {
  const lesson = createQuickLesson({ trigger: 'test', insight: 'test' });
  const result = await appendLesson(testDir, lesson);
  const lessons = await readLessons(testDir);
  expect(lessons.lessons).toContainEqual(result);
});
```

## Code Standards

### TypeScript

- Use ESM modules (`.js` extensions in imports)
- Type annotations required on all public APIs
- JSDoc comments on all public functions
- Use Zod schemas for runtime validation

### Code Size Limits

- **Functions**: < 50 lines
- **Files**: < 300 lines
- **Modules**: Single clear responsibility

### Naming

- Clear, descriptive names
- No abbreviations unless widely understood
- No magic numbers - use named constants

### Anti-Patterns to Avoid

- Utils/helpers modules (indicate unclear responsibility)
- Commented-out code (delete it)
- Deep nesting (prefer early returns)
- Global variables
- String interpolation in SQL queries

## Pull Request Process

### Before Submitting

1. **Run all tests**
   ```bash
   pnpm test
   ```
   All tests must pass with 100% pass rate.

2. **Run linting**
   ```bash
   pnpm lint
   ```
   Zero violations required.

3. **Check for regressions**
   Ensure no previously passing tests are now failing.

### PR Checklist

- [ ] Tests written FIRST (TDD)
- [ ] All tests pass (`pnpm test`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Type annotations on public APIs
- [ ] JSDoc on public functions
- [ ] No commented-out code
- [ ] Functions < 50 lines
- [ ] Files < 300 lines

### Commit Messages

- Use imperative mood ("Add feature" not "Added feature")
- Keep subject line under 50 characters
- Add body for complex changes explaining WHY
- One logical change per commit

Example:
```
Add vector search with cosine similarity

Implements semantic search using embeddings from nomic-embed-text.
Cosine similarity provides better results than Euclidean distance
for text similarity tasks.
```

## Issue Tracking

This project uses `bd` (beads) for issue tracking.

```bash
# View available tasks
bd ready

# View issue details
bd show <id>

# Create a new issue
bd create --title="..." --type=task --priority=2

# Update issue status
bd update <id> --status=in_progress

# Close an issue
bd close <id>

# Sync with git
bd sync
```

### Workflow

1. Create an issue BEFORE writing code
2. Update issue to `in_progress` when starting
3. Close issue when work is complete
4. Run `bd sync` before committing

## Architecture

```
src/
  index.ts          # Public API exports
  cli.ts            # CLI entry point
  types.ts          # Zod schemas + TypeScript types
  storage/
    jsonl.ts        # JSONL read/write
    sqlite.ts       # SQLite + FTS5
  embeddings/
    nomic.ts        # node-llama-cpp wrapper
    download.ts     # Model download logic
  search/
    vector.ts       # Cosine similarity search
    ranking.ts      # Score boosting
  capture/
    triggers.ts     # Detection patterns
    quality.ts      # Quality filter
  retrieval/
    session.ts      # Session-start loading
    plan.ts         # Plan-time retrieval
```

## Releasing

### Pre-Release Checklist

Before publishing a new version:

```bash
# 1. Ensure all tests pass
pnpm test

# 2. Ensure lint passes
pnpm lint

# 3. Build the package
pnpm build

# 4. Verify tarball contents
pnpm pack --dry-run
```

Expected tarball contents:
- `dist/` (compiled JavaScript + TypeScript declarations)
- `package.json`
- `README.md`
- `CHANGELOG.md`

### Publishing

```bash
# 1. Update version in package.json
pnpm version patch  # or minor, or major

# 2. Update CHANGELOG.md with new version

# 3. Commit version bump
git add -A && git commit -m "chore: bump version to x.x.x"

# 4. Create git tag
git tag vx.x.x

# 5. Verify publish (dry run)
pnpm publish --dry-run

# 6. Publish to npm
pnpm publish

# 7. Push commits and tag
git push && git push --tags
```

### Version Guidelines

- **patch**: Bug fixes, documentation updates
- **minor**: New features, backwards compatible
- **major**: Breaking changes

## Questions?

- Check [doc/SPEC.md](doc/SPEC.md) for the full specification
- Check [doc/CONTEXT.md](doc/CONTEXT.md) for design decisions
- Open an issue for questions or clarifications
