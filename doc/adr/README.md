# Architectural Decision Records

This directory contains Architectural Decision Records (ADRs) for the Learning Agent project.

## What is an ADR?

An ADR is a short document capturing an important architectural decision along with its context and consequences. ADRs provide a historical record of why things were built a certain way.

## ADR Lifecycle

| Status | Meaning |
|--------|---------|
| **Proposed** | Under discussion, not yet accepted |
| **Accepted** | Decision made and in effect |
| **Deprecated** | No longer applies to new work |
| **Superseded** | Replaced by a newer ADR |

## When to Write an ADR

Write an ADR when:

- Choosing between multiple viable approaches
- Making a decision that is hard to reverse
- Documenting something that future contributors will wonder "why?"

## How to Create an ADR

1. Copy `TEMPLATE.md` to `ADR-NNN-short-title.md`
2. Fill in all sections, focusing on the WHY
3. Keep it concise (under 50 lines ideally)
4. Submit for review via PR

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [001](ADR-001-jsonl-with-sqlite-index.md) | JSONL as source of truth with SQLite index | Accepted |
| [002](ADR-002-local-embeddings.md) | node-llama-cpp for local embeddings | Accepted |
| [003](ADR-003-zod-schema-validation.md) | Zod for schema validation | Accepted |
| [004](ADR-004-hybrid-search.md) | Hybrid search (keyword + vector) | Accepted |
