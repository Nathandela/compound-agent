# Contributing to Compound Agent

Thank you for your interest in Compound Agent!

**This project is open-source for transparency and learning, but we are not accepting pull requests at this time.** If you find a bug or have a feature idea, please open an [issue](https://github.com/Nathandela/compound-agent/issues) -- we read every one.

The rest of this document is for maintainers and documents internal development standards.

---

## Development Setup

### Prerequisites

- Go 1.26+
- golangci-lint

### Installation

```bash
# Clone the repository
git clone https://github.com/Nathandela/compound-agent.git
cd compound-agent

# Build the CLI
cd go && go build ./cmd/ca

# Run tests
cd go && go test ./...

# Run linter
cd go && golangci-lint run ./...
```

### Development Commands

```bash
cd go && go build ./cmd/ca   # Build CLI binary
cd go && go test ./...        # Run all tests
cd go && go vet ./...         # Static analysis
cd go && golangci-lint run ./...                 # Lint
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

```go
// BAD: Test that passes regardless of implementation
func TestFunctionExists(t *testing.T) {
    // This tests nothing meaningful
}

// BAD: Mocking the thing being tested
// BAD: Writing tests after implementation
```

### What TO Do

```go
// GOOD: Table-driven test with real data
func TestAppendLesson(t *testing.T) {
    tests := []struct {
        name    string
        trigger string
        insight string
        wantErr bool
    }{
        {"valid lesson", "test trigger", "test insight", false},
        {"empty trigger", "", "test insight", true},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            db := setupTestDB(t)
            err := AppendLesson(db, tt.trigger, tt.insight)
            if (err != nil) != tt.wantErr {
                t.Errorf("AppendLesson() error = %v, wantErr %v", err, tt.wantErr)
            }
        })
    }
}
```

## Code Standards

### Go

- Use `go/internal/` for all unexported packages
- Doc comments required on all exported functions
- Use table-driven tests
- Prefer early returns over deep nesting

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
   cd go && go test ./...
   ```
   All tests must pass with 100% pass rate.

2. **Run linting**
   ```bash
   cd go && golangci-lint run ./...
   ```
   Zero violations required.

3. **Check for regressions**
   Ensure no previously passing tests are now failing.

### PR Checklist

- [ ] Tests written FIRST (TDD)
- [ ] All tests pass (`go test ./...`)
- [ ] Lint passes (`golangci-lint run ./...`)
- [ ] Doc comments on exported functions
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
go/
  cmd/ca/              # CLI entrypoint
  internal/
    build/             # Build metadata
    capture/           # Lesson capture
    cli/               # Cobra command definitions
    compound/          # Compound synthesis
    embed/             # Embedding daemon IPC
    hook/              # Git hook management
    knowledge/         # Knowledge indexing
    memory/            # Memory management
    npmdist/           # npm distribution helpers
    retrieval/         # Session retrieval
    search/            # Hybrid search (keyword + vector)
    setup/             # Template installation
      templates/       # Embedded skill/agent/command templates
    storage/           # SQLite + FTS5
    telemetry/         # Telemetry tracking
    util/              # Shared utilities
```

## Releasing

Releases are fully automated via GitHub Actions. Pushing a version tag triggers the build and publish pipeline.

### Pre-Release Checklist

Before tagging a release, ensure quality gates pass locally:

```bash
cd go && go test ./...    # All tests pass
cd go && golangci-lint run ./...             # Zero lint violations
cd go && go build ./cmd/ca # Binary builds
```

### How to Release

```bash
# 1. Update version in package.json
#    - "version" field
#    - ALL 6 entries in "optionalDependencies" (@syottos/*)
#    Both MUST match. See "Critical: Version Sync" below.

# 2. Move [Unreleased] entries in CHANGELOG.md under a new version header
#    ## [x.x.x] - YYYY-MM-DD

# 3. Commit the version bump + changelog
git add package.json CHANGELOG.md && git commit -m "chore(release): bump version to vx.x.x"

# 4. Create and push the version tag
git tag vx.x.x
git push && git push --tags
```

### Critical: Version Sync

The `optionalDependencies` in `package.json` MUST match the `version` field. The release workflow publishes `@syottos/*` platform packages at the same version, then publishes the main `compound-agent` package. If optionalDependencies point to an older version, users get stale Go binaries with outdated templates -- new skills, updated references, and bug fixes silently missing.

```jsonc
// package.json -- all versions MUST be identical
{
  "version": "2.6.0",              // <-- this
  "optionalDependencies": {
    "@syottos/darwin-arm64": "2.6.0",  // <-- must match
    "@syottos/darwin-x64": "2.6.0",
    "@syottos/linux-arm64": "2.6.0",
    "@syottos/linux-x64": "2.6.0",
    "@syottos/win32-x64": "2.6.0",
    "@syottos/win32-arm64": "2.6.0"
  }
}
```

A CI test (`TestPlatformVersionSync`) enforces this at build time.

### What Happens Automatically

Pushing a `v*` tag triggers `.github/workflows/release.yml`, which:

1. **Builds Go CLI** (`ca`) for 6 platforms: linux-amd64, linux-arm64, darwin-arm64, darwin-amd64, windows-amd64, windows-arm64 -- with CGO_ENABLED=0 and version/commit embedded via ldflags
2. **Builds Rust daemon** (`ca-embed`) for 3 platforms: linux-amd64, linux-arm64, darwin-arm64 (Intel Macs use Rosetta; not available on Windows)
3. **Creates a GitHub Release** with all binaries and SHA256 checksums
4. **Publishes 6 platform-specific npm packages** (`@syottos/darwin-arm64`, `@syottos/darwin-x64`, `@syottos/linux-arm64`, `@syottos/linux-x64`, `@syottos/win32-x64`, `@syottos/win32-arm64`) -- each containing the `ca` binary (and `ca-embed` on Unix platforms)
5. **Publishes the main `compound-agent` npm package** -- the shell wrapper that resolves the platform-specific binary at runtime

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
