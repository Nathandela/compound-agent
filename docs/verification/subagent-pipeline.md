# Subagent Pipeline

## Overview

Every implementation MUST follow the mandatory subagent sequence. Work is NOT complete until `/implementation-reviewer` returns APPROVED.

## Mandatory Sequence

| Order | Agent | Purpose | When to Use |
|-------|-------|---------|-------------|
| 1 | `/invariant-designer` | Define invariants | Before writing ANY code |
| 2 | `/test-first-enforcer` | Verify TDD adherence | Before implementing |
| 3 | `/property-test-generator` | Generate property tests | For edge cases |
| 4 | `/anti-cargo-cult-reviewer` | Reject fake tests | During test review |
| 5 | `/module-boundary-reviewer` | Validate module design | After implementation |
| 6 | `/implementation-reviewer` | **FINAL authority** | Before marking complete |

## Closed-Loop Process

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

## Phase Details

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
- **Do NOT argue** -- criteria are objective

## Inviolable TDD Rules

- Tests must exist BEFORE implementation
- Real data, real execution (no mocked business logic)
- Tests must verify meaningful properties
- ALL subagents in sequence must be used
- Work is NOT complete until `/implementation-reviewer` returns APPROVED
- On rejection, fix ALL issues before resubmitting (not just some)

## Subagent Authority

The `/implementation-reviewer` has FINAL authority:

**Can Do**:
- REJECT implementations that do not meet criteria
- REQUIRE specific fixes
- PREVENT completion of substandard work

**Cannot Be**:
- Bypassed (no exceptions)
- Overridden (criteria are objective)
- Rushed (quality over speed)
