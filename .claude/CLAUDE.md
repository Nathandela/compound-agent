
# Learning Agent - Claude Code Instructions

## Project Overview

**Name**: Learning Agent
**Goal**: Learning system that helps Claude Code avoid repeating mistakes across sessions
**Stack**: TypeScript + pnpm (deployable as dev dependency)
**Status**: Spec finalized, ready to implement
**Type**: shared-lib
**Primary Language**: TypeScript

### Key Documentation

| Document | Purpose |
|----------|---------|
| `doc/SPEC.md` | Complete specification |
| `doc/CONTEXT.md` | Research and decisions |
| `doc/PLAN.md` | Day-by-day implementation plan |
| `doc/verification/` | Review workflow and criteria |

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
| **🔴 Inviolable** | Never break | Cannot override |
| **🟠 Strong Default** | Break only with explicit justification | Document why in PR |
| **🟡 Soft Default** | Prefer unless context demands otherwise | Use judgment |
| **🟢 Recommended** | Best practice, encouraged | Skip if simpler |

---

## Critical Constraints (DO NOT)

### 🔴 Security (Inviolable)
- **DO NOT** hardcode secrets or credentials
- **DO NOT** use string interpolation for SQL queries
- **DO NOT** log sensitive data (PII, tokens, passwords)
- **DO NOT** change security configurations without human approval

### 🔴 Code Quality (Inviolable)
- **DO NOT** write tests after implementation (TDD only)
- **DO NOT** mock business logic in tests
- **DO NOT** use global variables
- **DO NOT** skip type annotations on public APIs

### 🟠 Process (Strong Default)
- **DO NOT** commit without running tests
- **DO NOT** push without `bd sync`
- **DO NOT** mark work complete without `/implementation-reviewer` approval

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

## Closed-Loop TDD Workflow (Mandatory)

**Work is NOT complete until `/implementation-reviewer` returns APPROVED.**

### 🔴 Subagent Sequence (Inviolable)

Every implementation MUST follow this sequence:

```
1. /invariant-designer     --> Define what must be true
2. /test-first-enforcer    --> Verify tests written FIRST
3. /property-test-generator --> Generate edge case tests
4. /anti-cargo-cult-reviewer --> Reject fake tests
5. /module-boundary-reviewer --> Validate module design
6. /implementation-reviewer  --> FINAL gate (must be APPROVED)
```

### Closed-Loop Process

```
+------------------+
| 1. INVARIANTS    |  /invariant-designer
| Define what must |  - Data invariants
| always be true   |  - Safety properties
+--------+---------+  - Liveness properties
         |
         v
+------------------+
| 2. TESTS FIRST   |  /test-first-enforcer
| Write failing    |  /property-test-generator
| tests that verify|  /anti-cargo-cult-reviewer
| invariants       |
+--------+---------+
         |
         v
+------------------+
| 3. IMPLEMENT     |  /module-boundary-reviewer
| Minimal code to  |  - One test at a time
| pass tests       |  - NEVER modify tests to pass
+--------+---------+
         |
         v
+------------------+
| 4. REVIEW        |  /implementation-reviewer
| Independent gate |  - Validates ALL criteria
| FINAL authority  |  - Cannot be bypassed
+--------+---------+
         |
    +----+----+
    |         |
 APPROVED  REJECTED
    |         |
    v         v
+-------+  +------------------+
| DONE  |  | FIX ALL ISSUES   |
+-------+  | Return to stage  |
           | 2, 3, or 4       |
           +--------+---------+
                    |
                    +-------> (loop back)
```

### Phase 1: Define Invariants
Use `/invariant-designer` to document what must be true:
- Data invariants (what must always be true about data)
- Safety properties (what must never happen)
- Liveness properties (what must eventually happen)

### Phase 2: Write Tests FIRST
- Use `/test-first-enforcer` to verify TDD adherence
- Use `/property-test-generator` for edge cases
- Use `/anti-cargo-cult-reviewer` to reject fake tests
- Tests MUST fail before implementation exists

### Phase 3: Implement
- Write minimal code to pass tests
- One test at a time
- **NEVER** modify tests to make them pass
- Use `/module-boundary-reviewer` for design validation

### Phase 4: Review (Closed Loop)
- Call `/implementation-reviewer` for final approval
- If **REJECTED**: Fix ALL issues listed, return to appropriate stage, resubmit
- If **APPROVED**: Work is complete
- **Do NOT argue** — criteria are objective

### 🔴 Inviolable TDD Rules
- Tests must exist BEFORE implementation
- Real data, real execution (no mocked business logic)
- Tests must verify meaningful properties
- ALL subagents in sequence must be used
- Work is NOT complete until `/implementation-reviewer` returns APPROVED
- On rejection, fix ALL issues before resubmitting (not just some)

---

## Quality Gates

All code must pass these gates before completion:

```bash
pnpm test      # 100% pass rate, no skipped tests
pnpm lint      # Zero violations
```

### 🔴 Exit Criteria (ALL Required)

The `/implementation-reviewer` validates ALL 6 categories. **Every checkbox must pass.**

#### 1. Tests (MUST ALL PASS)
- [ ] `pnpm test` shows 100% pass rate
- [ ] No skipped tests
- [ ] No flaky tests

#### 2. No Regressions
- [ ] All previously passing tests still pass
- [ ] No new test failures introduced

#### 3. Code Quality
- [ ] `pnpm lint` passes with zero violations
- [ ] No commented-out code

#### 4. Professional Standards
- [ ] Type hints on all public APIs
- [ ] JSDoc on all public functions
- [ ] Clear, descriptive names
- [ ] No magic numbers
- [ ] Functions < 50 lines

#### 5. No Bugs
- [ ] Logic reviewed and sound
- [ ] Edge cases handled
- [ ] Error handling appropriate

#### 6. Specification Met
- [ ] Original requirements fulfilled
- [ ] Invariants documented and tested

### Rejection Protocol

When `/implementation-reviewer` returns **REJECTED**:

1. **Read ALL issues** — Every issue must be addressed
2. **Return to appropriate stage** — May need new tests, new implementation, or just fixes
3. **Fix completely** — Partial fixes will be rejected again
4. **Resubmit** — Call `/implementation-reviewer` again
5. **Repeat until APPROVED** — No shortcuts

---

## Code Organization

### 🟠 Small Code Principle (Strong Default)

- **Functions**: < 50 lines
- **Files**: < 300 lines
- **Modules**: Single clear responsibility
- **Public API**: Minimal exports via `index.ts`

### Module Design (Parnas Principles)

```typescript
// src/storage/index.ts - Public API only
export { appendLesson, readLessons } from './jsonl.js';
export { rebuildIndex, searchKeyword } from './sqlite.js';

// Internal files NOT exported through index.ts
```

### Documentation Structure

```
doc/                        # All documentation (singular)
├── SPEC.md                 # Complete specification
├── CONTEXT.md              # Research and decisions
├── PLAN.md                 # Implementation plan
└── verification/           # Review workflow
    ├── README.md
    └── closed-loop-review-process.md

src/                        # Code with inline JSDoc
└── module/
    └── index.ts            # Public API only
```

---

## Anti-Patterns (Avoid)

### 🔴 Inviolable — Never Do
- **Cargo-cult testing**: Tests that pass regardless of implementation
- **Mocking business logic**: `vi.mock()` on the thing being tested
- **Over-engineering**: Adding features/abstractions not requested
- **Post-hoc tests**: Writing tests after implementation

### 🟠 Strong Default — Avoid Unless Justified
- **Utils/helpers modules**: Indicate unclear responsibility
- **Magic numbers**: Use named constants
- **Commented-out code**: Delete it
- **Deep nesting**: Prefer early returns

### 🟡 Soft Default — Generally Avoid
- **Long functions**: Prefer < 50 lines
- **Implicit dependencies**: Pass dependencies explicitly
- **Emojis in code/comments**: Keep code professional

---

## Session Completion Protocol

### 🔴 Inviolable — Before Saying "Done"

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

### 🔴 Mandatory Sequence

| Order | Agent | Purpose | When to Use |
|-------|-------|---------|-------------|
| 1 | `/invariant-designer` | Define invariants | Before writing ANY code |
| 2 | `/test-first-enforcer` | Verify TDD adherence | Before implementing |
| 3 | `/property-test-generator` | Generate property tests | For edge cases |
| 4 | `/anti-cargo-cult-reviewer` | Reject fake tests | During test review |
| 5 | `/module-boundary-reviewer` | Validate module design | After implementation |
| 6 | `/implementation-reviewer` | **FINAL authority** | Before marking complete |

### Subagent Authority

The `/implementation-reviewer` has FINAL authority:

**Can Do**:
- REJECT implementations that do not meet criteria
- REQUIRE specific fixes
- PREVENT completion of substandard work

**Cannot Be**:
- Bypassed (no exceptions)
- Overridden (criteria are objective)
- Rushed (quality over speed)

---

## Build & Test Commands

### Build
```bash
pnpm install    # Install dependencies
pnpm build      # Build with tsup
```

### Test
```bash
pnpm test       # Run all tests
pnpm test:watch # Watch mode
```

### Run
```bash
pnpm dev        # Development mode
```

---

## References

- `doc/SPEC.md` — Full specification
- `doc/CONTEXT.md` — Research and decisions
- `doc/PLAN.md` — Implementation plan
- `doc/verification/closed-loop-review-process.md` — Review workflow
