# Test Architecture

## Test Organization

Tests are organized for parallelization efficiency:

```
src/
├── *.test.ts           # Unit tests (fast, run in parallel)
├── cli/                # CLI integration tests (split for parallelization)
│   ├── cli-test-utils.ts    # Shared test utilities
│   ├── learn.test.ts        # learn command tests
│   ├── search.test.ts       # search command tests
│   └── ...                  # One file per command group
├── storage/            # Storage layer tests
├── search/             # Search algorithm tests
├── capture/            # Lesson capture tests
├── embeddings/         # Embedding model tests
└── retrieval/          # Retrieval logic tests
```

## Why test:fast Is Fast

`test:fast` skips CLI integration tests (`src/cli/*.test.ts`) which:
- Spawn Node.js processes via `execSync`
- Have ~400ms overhead per test (process startup + tsx compilation)
- Account for ~95% of total test time

The remaining 385 tests cover all business logic and run in ~6 seconds.

## Known Limitations

**Embedding model concurrency**: The `node-llama-cpp` native addon can crash under heavy parallel load. If you see native crashes during parallel test runs:
- This is a known limitation of the underlying C++ library
- Tests pass reliably when run serially or under moderate parallelism
- The embedding tests use `skipIf(!modelAvailable)` to gracefully skip when model isn't installed

## CI Strategy

**Two test gates for release:**

| Gate | Command | Purpose | When to Run |
|------|---------|---------|-------------|
| Business Logic | `pnpm test` | All tests; embedding tests skip if model unavailable | Every PR, local dev |
| Full Suite | `pnpm test:all` | Downloads model, runs all tests including embedding | Release gate only |

**Local Development:**
- Use `pnpm test:fast` for rapid iteration (~6s)
- Run `pnpm test` before committing

**CI/CD:**
- PR checks: `pnpm test` (skips gracefully if no model)
- Release gate: `pnpm test:all` (requires compatible runner with native bindings)

**Release is blocked until both gates pass.** See CONTRIBUTING.md for full pre-release checklist.

## Test Quality Standards

- **TDD enforced**: Tests must exist BEFORE implementation
- **No mocked business logic**: Tests use real operations, not vi.mock() on the thing being tested
- **Property-based tests**: `fast-check` generates edge cases automatically
- **Timing tests use generous thresholds**: Avoid flaky tests on slow CI machines
