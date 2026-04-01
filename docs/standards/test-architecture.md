# Test Architecture

## Test Organization

Tests are colocated with implementation files using Go conventions:

```
go/internal/
├── capture/
│   ├── quality.go
│   ├── quality_test.go         # Unit tests (colocated)
│   ├── triggers.go
│   └── triggers_test.go
├── embed/
│   ├── client.go
│   ├── client_test.go
│   ├── integration_test.go     # Integration tests (same package)
│   └── ...
├── memory/
│   ├── jsonl.go
│   ├── jsonl_test.go
│   ├── types.go
│   └── types_test.go
├── storage/
│   ├── sqlite.go
│   └── sqlite_test.go
└── ...
```

## Running Tests

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `make test` | Full suite | Before committing |
| `go test ./internal/capture/...` | Single package | Rapid iteration |
| `go test -run TestName ./internal/...` | Single test | Debugging |
| `go test -race ./...` | Race detector | CI, concurrency work |
| `go test -count=1 ./...` | No cache | Verify flaky tests |

## Known Limitations

**Embedding daemon**: Integration tests for the embed package depend on the `ca-embed` Rust daemon binary. These tests skip gracefully when the daemon is unavailable.

## CI Strategy

**Two test gates for release:**

| Gate | Command | Purpose | When to Run |
|------|---------|---------|-------------|
| Unit + Integration | `make test` | All tests; embed tests skip if daemon unavailable | Every PR, local dev |
| Race Detection | `go test -race ./...` | Detect data races | CI only |

**Local Development:**
- Use `go test ./internal/<package>/...` for rapid iteration
- Run `make test` before committing

**Release is blocked until both gates pass.**

## Test Quality Standards

- **TDD enforced**: Tests must exist BEFORE implementation
- **No mocked business logic**: Tests use real operations, not mocks of the thing being tested
- **Table-driven tests**: Use Go's `[]struct{ name string; ... }` pattern for case coverage
- **Subtests**: Use `t.Run(name, func(t *testing.T) { ... })` for test organization
- **`t.Helper()`**: Mark helper functions so failures report the correct call site
- **`t.TempDir()`**: Use for filesystem tests -- auto-cleaned after test
- **Timing tests use generous thresholds**: Avoid flaky tests on slow CI machines
