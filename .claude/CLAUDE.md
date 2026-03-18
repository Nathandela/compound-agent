
# Compound Agent - Claude Code Instructions

## Project Overview

**Name**: Compound Agent
**Goal**: Learning system that helps Claude Code avoid repeating mistakes across sessions
**Stack**: TypeScript + pnpm (deployable as dev dependency)
**CLI**: `ca` (alias: `compound-agent`)
**Primary Language**: TypeScript

### Key Documentation

| Document | Purpose |
|----------|---------|
| `docs/INDEX.md` | Full documentation map |
| `docs/verification/` | Review workflow and criteria |
| `docs/standards/` | Coding standards and anti-patterns |
| `docs/archive/SPEC-v1.md` | Original specification (archived) |

---

## The Trinity (Priority Order)

**All decisions follow this hierarchy:**

1. **Correctness** — Does it work? Does it meet requirements?
2. **Consistency** — Does it follow established patterns?
3. **Simplicity** — Is it the simplest solution that works?

When in conflict, prioritize in this order. Never sacrifice correctness for simplicity.

---

## Rule Categories (Tiered Mandatoriness)

| Level | Meaning | Override |
|-------|---------|----------|
| **Inviolable** | Never break | Cannot override |
| **Strong Default** | Break only with explicit justification | Document why in PR |
| **Soft Default** | Prefer unless context demands otherwise | Use judgment |
| **Recommended** | Best practice, encouraged | Skip if simpler |

---

## Critical Constraints (DO NOT)

### Security (Inviolable)
- **DO NOT** hardcode secrets or credentials
- **DO NOT** use string interpolation for SQL queries
- **DO NOT** log sensitive data (PII, tokens, passwords)
- **DO NOT** change security configurations without human approval

### Code Quality (Inviolable)
- **DO NOT** write tests after implementation (TDD only)
- **DO NOT** mock business logic in tests
- **DO NOT** use global variables
- **DO NOT** skip type annotations on public APIs

### Process (Strong Default)
- **DO NOT** commit without running tests
- **DO NOT** push without `bd sync`
- **DO NOT** mark work complete without `/implementation-reviewer` approval

---

## Beads Workflow (Issue Tracking)

**This project uses `bd` (beads) for issue tracking.**

```bash
bd ready                    # Show available tasks
bd show <id>                # View issue details
bd create --title="..." --type=task --priority=2
bd update <id> --status=in_progress
bd close <id>
bd sync                     # Sync with git remote
```

**Inviolable**: Use beads for ALL task tracking. Create issue BEFORE writing code. Close issues when complete.

---

## TDD Workflow (Mandatory)

**Work is NOT complete until `/implementation-reviewer` returns APPROVED.**

Every implementation MUST follow this subagent sequence:

```
1. /invariant-designer      --> Define what must be true
2. /cct-subagent            --> Inject mistake-derived test requirements
3. /test-first-enforcer     --> Verify tests written FIRST
4. /property-test-generator  --> Generate edge case tests
5. /anti-cargo-cult-reviewer --> Reject fake tests
6. /module-boundary-reviewer --> Validate module design
7. /drift-detector          --> Check constraint drift
8. /implementation-reviewer  --> FINAL gate (must be APPROVED)
9. (optional) external reviewers --> Cross-model review (Gemini/Codex)
```

**Inviolable rules**: Tests before implementation. Real data, no mocked business logic. ALL subagents in sequence. On rejection, fix ALL issues before resubmitting.

**Security arc**: security-reviewer (core 4) escalates to `/security-injection`, `/security-secrets`, `/security-auth`, `/security-data`, `/security-deps` on demand. P0 findings block merge.

**External reviewers (optional)**: If `.claude/compound-agent.json` has `"externalReviewers"` configured, Gemini/Codex run after step 8 as advisory (non-blocking) reviewers. Enable with `npx ca reviewer enable gemini`.

> **Full pipeline details**: See `docs/verification/subagent-pipeline.md`
> **Exit criteria checklists**: See `docs/verification/exit-criteria.md`

---

## Quality Gates

```bash
pnpm test      # 100% pass rate, no skipped tests
pnpm lint      # Zero violations
```

> **Full exit criteria**: See `docs/verification/exit-criteria.md`

---

## Code Organization

> **Full details**: See `docs/standards/code-organization.md`
> **Anti-patterns**: See `docs/standards/anti-patterns.md`

---

## Session Completion Protocol

### Inviolable -- Before Saying "Done"

```bash
[ ] 1. ca verify-gates <epic-id>  # Verify review + compound tasks closed (if epic work)
[ ] 2. git status                  # Check what changed
[ ] 3. git add <files>             # Stage code changes
[ ] 4. bd sync                     # Commit beads changes
[ ] 5. git commit -m "..."         # Commit code
[ ] 6. bd sync                     # Commit any new beads changes
[ ] 7. git push                    # Push to remote
```

**CRITICAL**: Work is NOT complete until `git push` succeeds.

### Hand-off Requirements
- File issues for remaining work (`bd create`)
- Run quality gates (`pnpm test && pnpm lint`)
- Provide context for next session

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript (ESM) |
| Package Manager | pnpm |
| Build | tsup |
| Testing | Vitest + fast-check (property tests) |
| Storage | better-sqlite3 + FTS5 |
| Embeddings | @huggingface/transformers + nomic-embed-text-v1.5 |
| CLI | Commander.js |
| Schema | Zod |

---

## Architecture

```
.claude/                        (repository scope)
├── CLAUDE.md                   <- Always loaded (permanent rules)
├── compound-agent.json         <- Config (external reviewers, etc.)
├── agents/                     <- Subagent definitions (TDD pipeline)
├── commands/                   <- Custom slash commands
├── lessons/
│   └── index.jsonl             <- Source of truth (git-tracked)
└── .cache/
    └── lessons.sqlite          <- Rebuildable index (.gitignore)
```

---

## Resource Management Policy

### Heavyweight Resources (Singleton Pattern)

| Resource | Module | Lifecycle |
|----------|--------|-----------|
| SQLite database | `src/memory/storage/sqlite/connection.ts` | Lazy init, one instance per process |
| Embedding model | `src/memory/embeddings/nomic.ts` | Lazy init, one instance per process |

**Policy**: Singleton pattern required. Lazy initialization. Explicit cleanup via `closeDb()` / `unloadEmbedding()` before process exit. Singletons are internal implementation details (not global variables).

---

## Build & Test Commands

```bash
pnpm install            # Install dependencies
pnpm build              # Build with tsup
pnpm test               # Full suite (unit + integration + embedding)
pnpm test:fast          # Unit + embedding only (~15s)
pnpm test:unit          # Unit tests only (~14s)
pnpm test:integration   # CLI integration tests only (~100s)
pnpm test:changed       # Only tests affected by recent changes
pnpm test:watch         # Watch mode
pnpm test:all           # Full suite with model download
pnpm test:segment <mod> # Tests for one module (e.g., memory, commands)
pnpm dev                # Development mode (watch)
```

**Recommended**: `pnpm test:fast` during development, `pnpm test` before committing.

> **Test architecture details**: See `docs/standards/test-architecture.md`

---

## References

- `docs/INDEX.md` -- Full documentation map
- `docs/verification/` -- Review workflow and criteria
- `docs/standards/` -- Coding standards and anti-patterns
- `docs/ARCHITECTURE-V2.md` -- V2 architecture vision
- `docs/RESOURCE_LIFECYCLE.md` -- Resource lifecycle management
- `docs/LANDSCAPE.md` -- Competitive landscape analysis
