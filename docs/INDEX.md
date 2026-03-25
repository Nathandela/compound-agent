# Documentation Map

Top-level index of all project documentation.

## Directory Tree

```
docs/
├── INDEX.md                    <- You are here
├── LANDSCAPE.md                # Competitive landscape analysis
├── ARCHITECTURE-V2.md          # Architecture vision and workflow design
├── RESOURCE_LIFECYCLE.md       # Heavyweight resource management
├── MIGRATION.md                # Migration guide: learning-agent -> compound-agent
├── HOW_TO_NEXT_IMPROVE.md      # Improvement roadmap (Anthropic harness design analysis)
├── README.md                   # Documentation hub (quick links)
├── test-optimization-baseline.md
├── property-tests-install-check.md
├── adr/                        # Architectural Decision Records
├── archive/                    # Historical specs, plans, and summaries
├── assets/                     # Diagram PNGs referenced by README
├── embedding_memory_pressure/  # Memory pressure investigation (completed)
├── invariants/                 # Module invariants (data/safety/liveness)
├── research/                   # External research and references
├── specs/                      # Feature specifications
├── compound/                   # User-facing docs (deployed to consumer repos)
├── standards/                  # Coding standards and best practices
└── verification/               # Review workflow and quality criteria
```

## Subdirectories

| Directory | Purpose | Index |
|-----------|---------|-------|
| `compound/` | User-facing docs deployed to consumer repos via `ca setup` | [compound/README.md](compound/README.md) |
| `adr/` | Records of key architectural decisions and their rationale | [adr/index.md](adr/index.md) |
| `archive/` | Historical specs, plans, and summaries from past versions | [archive/index.md](archive/index.md) |
| `invariants/` | Formal invariants (data, safety, liveness) for each module | [invariants/index.md](invariants/index.md) |
| `research/` | External articles and research informing project design | [research/index.md](research/index.md) |
| `specs/` | Feature specifications written before implementation | [specs/index.md](specs/index.md) |
| `standards/` | Coding standards, anti-patterns, and test architecture | [standards/index.md](standards/index.md) |
| `assets/` | Diagram PNGs referenced by README | — |
| `embedding_memory_pressure/` | Memory pressure investigation and proposals (completed) | [embedding_memory_pressure/README.md](embedding_memory_pressure/README.md) |
| `verification/` | TDD subagent pipeline, exit criteria, and review process | [verification/index.md](verification/index.md) |

## Top-Level Documents

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE-V2.md](ARCHITECTURE-V2.md) | Architecture vision: 3-layer design, workflow phases, compound loop |
| [LANDSCAPE.md](LANDSCAPE.md) | Competitive landscape of agent memory/learning systems |
| [RESOURCE_LIFECYCLE.md](RESOURCE_LIFECYCLE.md) | Heavyweight resource (SQLite, embeddings) lifecycle management |
| [MIGRATION.md](MIGRATION.md) | Migration guide from learning-agent to compound-agent |
| [test-optimization-baseline.md](test-optimization-baseline.md) | Baseline metrics for test optimization work |
| [property-tests-install-check.md](property-tests-install-check.md) | Property-based test results for install-check utility |
| [HOW_TO_NEXT_IMPROVE.md](HOW_TO_NEXT_IMPROVE.md) | Improvement roadmap based on Anthropic harness design analysis |

## Archived Documents

The following documents have been moved to `archive/` and are preserved for historical context:

| Document | Description |
|----------|-------------|
| [archive/SPEC-v1.md](archive/SPEC-v1.md) | Original v0.x specification |
| [archive/CONTEXT-v1.md](archive/CONTEXT-v1.md) | Original research context and design decisions |
| [archive/PLAN-v1.md](archive/PLAN-v1.md) | Original implementation plan |
| [archive/v0.2.3-PLAN.md](archive/v0.2.3-PLAN.md) | v0.2.3 implementation plan |
| [archive/v0.2.2-implementation-plan.md](archive/v0.2.2-implementation-plan.md) | v0.2.2 parallel implementation strategy |
| [archive/PROPERTY_TESTS_SUMMARY.md](archive/PROPERTY_TESTS_SUMMARY.md) | Property-based test results for SQLite degradation |
| [archive/remind-capture-invariants-v1.md](archive/remind-capture-invariants-v1.md) | Invariants for the (removed) remind-capture command |

## When to Read What

- **New to compound-agent?** Run `ca setup` then read `docs/compound/README.md` (deployed to consumer repos)
- **Starting a new feature?** Read [ARCHITECTURE-V2.md](ARCHITECTURE-V2.md) then check [invariants/](invariants/) for the relevant module
- **Understanding a past decision?** Check [adr/](adr/) for architectural choices
- **Setting up review?** See [verification/](verification/) for the subagent pipeline and exit criteria
- **Setting up security review?** See [research/security/overview.md](research/security/overview.md) for severity classification and [verification/subagent-pipeline.md](verification/subagent-pipeline.md) for the security arc
- **Enabling external reviewers?** Run `ca reviewer enable gemini` — see [verification/subagent-pipeline.md](verification/subagent-pipeline.md)
- **Writing code?** Consult [standards/](standards/) for conventions and anti-patterns
- **Planning a release?** Review [archive/](archive/) for historical context
