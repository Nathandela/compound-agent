# Documentation Hub

This folder contains all project documentation. See [INDEX.md](INDEX.md) for the full map.

## Structure

| Document | Purpose |
|----------|---------|
| [INDEX.md](INDEX.md) | Full documentation map with all subdirectories |
| [ARCHITECTURE-V2.md](ARCHITECTURE-V2.md) | Three-layer architecture: Beads, Semantic Memory, Workflows |
| [RESOURCE_LIFECYCLE.md](RESOURCE_LIFECYCLE.md) | Heavyweight resource (SQLite, embeddings) lifecycle |
| [LANDSCAPE.md](LANDSCAPE.md) | Competitive landscape analysis |
| [MIGRATION.md](MIGRATION.md) | Migration guide from learning-agent to compound-agent |
| [verification/](verification/) | TDD workflow and review criteria |
| [adr/](adr/) | Architectural Decision Records |
| [specs/](specs/) | Feature specifications (Spec-Driven Development) |
| [invariants/](invariants/) | Module invariants (data/safety/liveness) |
| [standards/](standards/) | Coding standards and best practices |
| [archive/](archive/) | Historical specs, plans, and summaries |

## Quick Links

- **Starting work?** Read [ARCHITECTURE-V2.md](ARCHITECTURE-V2.md) for the architecture
- **Understanding decisions?** See [adr/](adr/) for Architectural Decision Records
- **Review process?** See [verification/closed-loop-review-process.md](verification/closed-loop-review-process.md)
- **Original spec?** See [archive/SPEC-v1.md](archive/SPEC-v1.md)

## For AI Agents

See `.claude/CLAUDE.md` for machine-readable project instructions including:
- Build & test commands
- Code style & conventions
- Critical constraints (DO NOTs)
- TDD workflow requirements
