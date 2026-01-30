# Learning Agent - Claude Code Instructions

## Project Overview

**Name**: Learning Agent
**Goal**: Learning system that helps Claude Code avoid repeating mistakes across sessions
**Stack**: TypeScript + pnpm (deployable as dev dependency)
**Status**: Spec finalized, ready to implement

### Key Documentation

| Document | Purpose |
|----------|---------|
| `doc/SPEC.md` | Complete specification |
| `doc/CONTEXT.md` | Research and decisions |
| `doc/PLAN.md` | Day-by-day implementation plan |
| `docs/verification/` | Review workflow and criteria |

---

## The Trinity (Priority Order)

**All decisions follow this hierarchy:**

1. **Correctness** - Does it work? Does it meet requirements?
2. **Consistency** - Does it follow established patterns?
3. **Simplicity** - Is it the simplest solution that works?

When in conflict, prioritize in this order.

---

## Rule Categories

Rules have different levels of mandatoriness:

| Level | Meaning | Override |
|-------|---------|----------|
| **🔴 Inviolable** | Never break | Cannot override |
| **🟠 Strong Default** | Break only with explicit justification | Document why |
| **🟡 Soft Default** | Prefer unless context demands otherwise | Use judgment |
| **🟢 Recommended** | Best practice, encouraged | Skip if simpler |

---

## Beads Workflow (Issue Tracking)

**This project uses `bd` (beads) for issue tracking.**

```bash
# Finding work
bd ready                    # Show available tasks
bd show <id>                # View issue details

# Creating & updating
bd create --title="..." --type=task --priority=2
bd update <id> --status=in_progress
bd close <id>

# Sync
bd sync                     # Sync with git remote
```

### 🔴 Inviolable Rules
- Use beads for ALL task tracking (NOT TodoWrite or markdown files)
- Create issue BEFORE writing code
- Close issues when work is complete

---

## TDD Workflow (Mandatory)

### Phase 1: Define Invariants
Use `/invariant-designer` to document what must be true:
- Data invariants (what must always be true about data)
- Safety properties (what must never happen)
- Liveness properties (what must eventually happen)

### Phase 2: Write Tests FIRST
- Use `/test-first-enforcer` to verify TDD adherence
- Use `/property-test-generator` for edge cases
- Use `/anti-cargo-cult-reviewer` to reject fake tests

### Phase 3: Implement
- Write minimal code to pass tests
- One test at a time
- NEVER modify tests to pass

### Phase 4: Verify
- Use `/module-boundary-reviewer` for design validation
- Use `/implementation-reviewer` for final approval (FINAL AUTHORITY)

### 🔴 Inviolable Rules
- NO post-hoc tests - Tests must exist BEFORE implementation
- NO mocked business logic - Real data, real execution
- NO trivial assertions - Tests must verify meaningful properties
- Work is NOT complete until `/implementation-reviewer` approves

---

## Quality Gates

All code must pass these gates before completion:

```bash
pnpm test      # 100% pass rate, no skipped tests
pnpm lint      # Zero violations
```

### Exit Criteria

| Criterion | Check |
|-----------|-------|
| Tests pass | `pnpm test` shows 100% |
| No regressions | All previous tests still pass |
| Code quality | `pnpm lint` passes |
| Standards | Type hints, JSDoc on public functions |
| No bugs | Logic reviewed, edge cases handled |
| Approved | `/implementation-reviewer` returns APPROVED |

---

## Anti-Patterns (Avoid)

### 🔴 Inviolable - Never Do
- **Cargo-cult testing**: Tests that pass regardless of implementation
- **Mocking business logic**: vi.mock() on the thing being tested
- **Over-engineering**: Adding features/abstractions not requested

### 🟠 Strong Default - Avoid Unless Justified
- **Utils/helpers modules**: Indicate unclear responsibility
- **Magic numbers**: Use named constants
- **Commented-out code**: Delete it

### 🟡 Soft Default - Generally Avoid
- **Long functions**: Prefer < 50 lines
- **Deep nesting**: Prefer early returns
- **Implicit dependencies**: Pass dependencies explicitly

---

## Code Organization

### Small Code Snippets Principle

**🟠 Strong Default**: Keep code snippets small and focused.

- Functions: < 50 lines
- Files: < 300 lines
- Modules: Single clear responsibility
- Public API: Minimal exports via `index.ts`

### Documentation Structure

```
doc/                    # High-level project docs
├── SPEC.md            # Complete specification
├── CONTEXT.md         # Research and decisions
└── PLAN.md            # Implementation plan

docs/                   # Supporting documentation
└── verification/      # Review workflow
    ├── README.md
    └── closed-loop-review-process.md

src/                    # Code with inline JSDoc
└── module/
    └── index.ts       # Public API only
```

### Module Design (Parnas Principles)

```typescript
// src/storage/index.ts - Public API only
export { appendLesson, readLessons } from './jsonl.js';
export { rebuildIndex, searchKeyword } from './sqlite.js';

// Internal files NOT exported through index.ts
```

---

## Session Completion Protocol

### 🔴 Inviolable - Before Saying "Done"

```bash
[ ] 1. git status           # Check what changed
[ ] 2. git add <files>      # Stage code changes
[ ] 3. bd sync              # Commit beads changes
[ ] 4. git commit -m "..."  # Commit code
[ ] 5. bd sync              # Commit any new beads changes
[ ] 6. git push             # Push to remote
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
| Embeddings | node-llama-cpp + nomic-embed-text-v1.5 |
| CLI | Commander.js |
| Schema | Zod |

---

## Architecture

```
.claude/                        (repository scope)
├── CLAUDE.md                   <- Always loaded (permanent rules)
├── lessons/
│   ├── index.jsonl             <- Source of truth (git-tracked)
│   └── archive/                <- Old lessons (compacted)
└── .cache/
    └── lessons.sqlite          <- Rebuildable index (.gitignore)
```

---

## Verification Subagents

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| `/invariant-designer` | Define invariants | Before writing ANY code |
| `/test-first-enforcer` | Verify TDD adherence | Before implementing |
| `/property-test-generator` | Generate property tests | For edge cases |
| `/module-boundary-reviewer` | Validate module design | After implementation |
| `/anti-cargo-cult-reviewer` | Reject fake tests | During test review |
| `/implementation-reviewer` | **FINAL authority** | Before marking complete |

---

## References

- `doc/SPEC.md` - Full specification
- `doc/CONTEXT.md` - Research and decisions
- `doc/PLAN.md` - Implementation plan
- `docs/verification/closed-loop-review-process.md` - Review workflow
