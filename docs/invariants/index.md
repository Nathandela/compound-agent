# Invariants Index

Formal invariants (data, safety, liveness) for each module, following Lamport's safety/liveness framework. These define what must always be true, what must never happen, and what must eventually happen.

## Core Module Invariants

| Document | Module |
|----------|--------|
| [storage.md](storage.md) | JSONL append-only storage and SQLite FTS index |
| [embeddings.md](embeddings.md) | Text embedding vector generation |
| [search.md](search.md) | Vector and ranked search |
| [capture.md](capture.md) | Quality filters and lesson triggers |

## Feature Invariants

| Document | Feature |
|----------|---------|
| [auto-sync-sqlite.md](auto-sync-sqlite.md) | SQLite index auto-sync after CLI mutations |
| [age-based-temporal-validity.md](age-based-temporal-validity.md) | Age-based temporal validity for lessons |
| [cli_severity_flag_invariants.md](cli_severity_flag_invariants.md) | CLI severity flag for lesson creation |
| [crud-commands.md](crud-commands.md) | CRUD CLI commands (show, update, delete) |
| [download-model-command.md](download-model-command.md) | `download-model` command for embedding model |
| [init-includes-setup-claude.md](init-includes-setup-claude.md) | `init` command includes `setup claude` |
| [install-check.md](install-check.md) | Install-check utility for invalid installations |
| [jsonl_source_of_truth_invariants.md](jsonl_source_of_truth_invariants.md) | JSONL as single source of truth |
| [lna-cli-alias.md](lna-cli-alias.md) | `ca` CLI alias |
| [load-session-output.md](load-session-output.md) | `load-session` command output format |
| [pre-commit-hook-insertion.md](pre-commit-hook-insertion.md) | Pre-commit hook installation |
| [prime-invariants.md](prime-invariants.md) | `prime` command for trust language generation |
| [setup-claude-defaults.md](setup-claude-defaults.md) | `setup claude` default behavior |
| [sqlite_graceful_degradation_invariants.md](sqlite_graceful_degradation_invariants.md) | SQLite graceful degradation when native bindings fail |
| [type-unification.md](type-unification.md) | Type unification (QuickLesson + FullLesson -> Lesson) |

## Reference

| Document | Purpose |
|----------|---------|
| [README.md](README.md) | Framework overview, categories, and how to write invariants |

## When to Read

- **Before implementing a feature** -- Read existing invariants for the module you are modifying
- **Defining new invariants** -- Use `/invariant-designer` and document results here
- **Writing tests** -- Invariants define what tests should verify
