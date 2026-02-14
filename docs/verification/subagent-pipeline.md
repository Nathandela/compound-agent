# Subagent Pipeline

## Overview

Every implementation MUST follow the mandatory subagent sequence. Work is NOT complete until `/implementation-reviewer` returns APPROVED.

## Mandatory Sequence

| Order | Agent | Purpose | When to Use |
|-------|-------|---------|-------------|
| 1 | `/invariant-designer` | Define invariants | Before writing ANY code |
| 2 | `/cct-subagent` | Inject mistake-derived test requirements | After invariants, before tests |
| 3 | `/test-first-enforcer` | Verify TDD adherence | Before implementing |
| 4 | `/property-test-generator` | Generate property tests | For edge cases |
| 5 | `/anti-cargo-cult-reviewer` | Reject fake tests | During test review |
| 6 | `/module-boundary-reviewer` | Validate module design | After implementation |
| 7 | `/drift-detector` | Check for constraint drift | After boundary review |
| 8 | `/implementation-reviewer` | **FINAL authority** | Before marking complete |

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
| 2. CCT INJECTION |  /cct-subagent
| Inject test reqs |  - Match past mistakes
| from past lessons|  - REQUIRED / SUGGESTED tests
+--------+---------+
         |
         v
+------------------+
| 3. TESTS FIRST   |  /test-first-enforcer
| Write failing    |  /property-test-generator
| tests that verify|  /anti-cargo-cult-reviewer
| invariants       |
+--------+---------+
         |
         v
+------------------+
| 4. IMPLEMENT     |  /module-boundary-reviewer
| Minimal code to  |  - One test at a time
| pass tests       |  - NEVER modify tests to pass
+--------+---------+
         |
         v
+------------------+
| 5. DRIFT CHECK   |  /drift-detector
| Verify alignment |  - Invariants, ADRs
| with constraints |  - Architecture decisions
+--------+---------+
         |
         v
+------------------+
| 6. REVIEW        |  /implementation-reviewer
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

### Phase 2: CCT Injection
Use `/cct-subagent` to inject mistake-derived test requirements:
- Read CCT patterns synthesized from past lessons
- Match patterns against the current task's domain and files
- Output REQUIRED or SUGGESTED test requirements for test-first-enforcer

### Phase 3: Write Tests FIRST
- Use `/test-first-enforcer` to verify TDD adherence
- Use `/property-test-generator` for edge cases
- Use `/anti-cargo-cult-reviewer` to reject fake tests
- Tests MUST fail before implementation exists

### Phase 4: Implement
- Write minimal code to pass tests
- One test at a time
- **NEVER** modify tests to make them pass
- Use `/module-boundary-reviewer` for design validation

### Phase 5: Drift Check
Use `/drift-detector` to verify implementation alignment:
- Compare implementation against documented invariants and ADRs
- Check module boundaries and data flows match architecture
- Flag any deviation, even if tests pass

### Phase 6: Review (Closed Loop)
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
