# ADR Index

Architectural Decision Records capture key design decisions and their rationale. ADRs provide a historical record of why things were built a certain way.

## Documents

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](ADR-001-jsonl-with-sqlite-index.md) | JSONL as source of truth with SQLite index | Accepted |
| [ADR-002](ADR-002-local-embeddings.md) | node-llama-cpp for local embeddings | Accepted |
| [ADR-003](ADR-003-zod-schema-validation.md) | Zod for schema validation | Accepted |
| [ADR-004](ADR-004-hybrid-search.md) | Hybrid search (keyword + vector) | Accepted |
| [TEMPLATE.md](TEMPLATE.md) | Template for creating new ADRs | -- |

## When to Read

- **Wondering "why was X chosen?"** -- Check if an ADR covers it
- **Proposing an alternative approach** -- Read existing ADRs to understand prior context
- **Creating a new ADR** -- Copy `TEMPLATE.md` and follow the format in [README.md](README.md)
