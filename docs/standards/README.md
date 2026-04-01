# Coding Standards

This directory contains coding standards and best practices for the Compound Agent project (Go).

## Documents

| Document | Description |
|----------|-------------|
| [code-organization.md](code-organization.md) | Small code principle, package design, documentation structure |
| [anti-patterns.md](anti-patterns.md) | Categorized anti-patterns with enforcement tiers |
| [test-architecture.md](test-architecture.md) | Test organization, CI strategy, quality standards |
| [linting-for-agents.md](linting-for-agents.md) | Agent-targeted linting with `go vet` and golangci-lint |

## Applicability

For this project (Go CLI tool), the most relevant areas are:

- Package design and `internal/` layout
- Database queries (parameterized SQL via modernc.org/sqlite)
- Error handling (explicit error returns, no panics in library code)
- Testing (`go test`, table-driven tests, TDD)

## Related Documentation

- [../../.claude/CLAUDE.md](../../.claude/CLAUDE.md) - Project rules and TDD workflow
- [../ARCHITECTURE-V2.md](../ARCHITECTURE-V2.md) - Architecture vision
