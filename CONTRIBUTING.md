# Contributing to Compound Agent

Thank you for your interest in Compound Agent!

**This project is open-source for transparency and learning, but we are not accepting pull requests at this time.** If you find a bug or have a feature idea, please open an [issue](https://github.com/Nathandela/compound-agent/issues) -- we read every one.

The rest of this document is for maintainers and documents internal development standards.

---

## Development Setup

### Prerequisites

- Node.js >= 20.0.0
- pnpm (recommended over npm/yarn)

### Installation

```bash
# Clone the repository
git clone https://github.com/Nathandela/compound-agent.git
cd compound-agent

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
    nomic.ts        # Transformers.js embedding pipeline (nomic-embed-text-v1.5)
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

Releases are fully automated via GitHub Actions. Pushing a version tag triggers the build and publish pipeline.

### Pre-Release Checklist

Before tagging a release, ensure quality gates pass locally:

```bash
cd go && go test -tags sqlite_fts5 ./...    # All tests pass
cd go && golangci-lint run ./...             # Zero lint violations
cd go && go build -tags sqlite_fts5 ./cmd/ca # Binary builds
```

### How to Release

```bash
# 1. Update version in package.json
#    (should already be bumped in the commit)

# 2. Move [Unreleased] entries in CHANGELOG.md under a new version header
#    ## [x.x.x] - YYYY-MM-DD

# 3. Commit the changelog update
git add CHANGELOG.md && git commit -m "docs(changelog): release vx.x.x"

# 4. Create and push the version tag
git tag vx.x.x
git push && git push --tags
```

### What Happens Automatically

Pushing a `v*` tag triggers `.github/workflows/release.yml`, which:

1. **Builds Go CLI** (`ca`) for 4 platforms: linux-amd64, linux-arm64, darwin-arm64, darwin-amd64 — with SQLite FTS5 and version/commit embedded via ldflags
2. **Builds Rust daemon** (`ca-embed`) for 3 platforms: linux-amd64, linux-arm64, darwin-arm64 (Intel Macs use Rosetta)
3. **Creates a GitHub Release** with all binaries and SHA256 checksums
4. **Publishes 4 platform-specific npm packages** (`@syottos/darwin-arm64`, `@syottos/darwin-x64`, `@syottos/linux-arm64`, `@syottos/linux-x64`) — each containing the `ca` and `ca-embed` binaries
5. **Publishes the main `compound-agent` npm package** — the shell wrapper that resolves the platform-specific binary at runtime

All npm packages are published with `--provenance` for supply chain security.

### Version Guidelines

- **patch** (x.x.1): Bug fixes, documentation updates
- **minor** (x.1.0): New features, new skills, new research docs (backwards compatible)
- **major** (1.0.0): Breaking changes to CLI interface or template structure

## Questions?

- Check [docs/archive/SPEC-v1.md](docs/archive/SPEC-v1.md) for the original specification
- Check [docs/archive/CONTEXT-v1.md](docs/archive/CONTEXT-v1.md) for design decisions
- Check [docs/INDEX.md](docs/INDEX.md) for the full documentation map
- Open an issue for questions or clarifications
