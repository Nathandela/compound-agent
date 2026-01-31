# Coding Standards

This directory contains coding standards and best practices for the Learning Agent project.

## Documents

| Document | Description |
|----------|-------------|
| [typescript-best-practices.md](typescript-best-practices.md) | TypeScript patterns, configuration, and conventions |

## Source

These standards are adapted from [Quanthome/doc](https://github.com/Quanthome/doc) research branch, specifically:

- `standards/typescript-best-practices.md` - Core TypeScript patterns

## Applicability

For this project (TypeScript library), the most relevant sections are:

- TypeScript Configuration
- Code Style & Formatting
- Backend Patterns (module structure, database queries)
- Validation & Error Handling (Zod)
- Testing (Vitest + fast-check)
- Import Organization

React and frontend patterns from the source are excluded as this is a backend library.

## Related Documentation

- [../SPEC.md](../SPEC.md) - Project specification
- [../../AGENTS.md](../../AGENTS.md) - AI agent context
- [../../.claude/CLAUDE.md](../../.claude/CLAUDE.md) - Project rules and TDD workflow
