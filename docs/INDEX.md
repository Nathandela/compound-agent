# Documentation Map

Top-level index of all project documentation.

## Directory Tree

```
docs/
├── INDEX.md                    <- You are here
├── SPEC.md                     # Complete project specification
├── CONTEXT.md                  # Research and design decisions
├── PLAN.md                     # Day-by-day implementation plan
├── LANDSCAPE.md                # Competitive landscape analysis
├── ARCHITECTURE-V2.md          # V2 architecture vision
├── RESOURCE_LIFECYCLE.md       # Heavyweight resource management
├── README.md                   # Documentation hub (quick links)
├── test-optimization-baseline.md
├── property-tests-install-check.md
├── adr/                        # Architectural Decision Records
├── archive/                    # Historical plans and summaries
├── invariants/                 # Module invariants (data/safety/liveness)
├── research/                   # External research and references
├── specs/                      # Feature specifications
├── standards/                  # Coding standards and best practices
└── verification/               # Review workflow and quality criteria
```

## Subdirectories

| Directory | Purpose | Index |
|-----------|---------|-------|
| `adr/` | Records of key architectural decisions and their rationale | [adr/index.md](adr/index.md) |
| `archive/` | Historical implementation plans and summaries from past versions | [archive/index.md](archive/index.md) |
| `invariants/` | Formal invariants (data, safety, liveness) for each module | [invariants/index.md](invariants/index.md) |
| `research/` | External articles and research informing project design | [research/index.md](research/index.md) |
| `specs/` | Feature specifications written before implementation | [specs/index.md](specs/index.md) |
| `standards/` | Coding standards, anti-patterns, and test architecture | [standards/index.md](standards/index.md) |
| `verification/` | TDD subagent pipeline, exit criteria, and review process | [verification/index.md](verification/index.md) |

## Top-Level Documents

| Document | Purpose |
|----------|---------|
| [SPEC.md](SPEC.md) | Complete specification: architecture, schemas, implementation plan |
| [CONTEXT.md](CONTEXT.md) | Research context and design decisions from planning phase |
| [PLAN.md](PLAN.md) | Day-by-day implementation plan with task breakdown |
| [LANDSCAPE.md](LANDSCAPE.md) | Competitive landscape of agent memory/learning systems |
| [ARCHITECTURE-V2.md](ARCHITECTURE-V2.md) | V2 architecture vision for unified workflow plugin |
| [RESOURCE_LIFECYCLE.md](RESOURCE_LIFECYCLE.md) | Heavyweight resource (SQLite, embeddings) lifecycle management |
| [test-optimization-baseline.md](test-optimization-baseline.md) | Baseline metrics for test optimization work |
| [property-tests-install-check.md](property-tests-install-check.md) | Property-based test results for install-check utility |

## When to Read What

- **Starting a new feature?** Read [SPEC.md](SPEC.md) then check [invariants/](invariants/) for the relevant module
- **Understanding a past decision?** Check [adr/](adr/) for architectural choices
- **Setting up review?** See [verification/](verification/) for the subagent pipeline and exit criteria
- **Writing code?** Consult [standards/](standards/) for conventions and anti-patterns
- **Planning a release?** Review [PLAN.md](PLAN.md) and [archive/](archive/) for historical context
