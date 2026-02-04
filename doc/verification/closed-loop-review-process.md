# Closed-Loop Review Process

## Overview

Every implementation must pass independent review before being considered complete. Work is NOT complete until `/implementation-reviewer` gives APPROVED status.

## Workflow Flowchart

```
┌─────────────────────────────────────────────────────────────┐
│ STAGE 1: DEFINE INVARIANTS                                  │
│ Use /invariant-designer to document:                        │
│ • Data invariants (what must be true about data)            │
│ • Safety properties (what must never happen)                │
│ • Liveness properties (what must eventually happen)         │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 2: WRITE TESTS FIRST (TDD)                            │
│ • Write failing tests that verify invariants                │
│ • Use /test-first-enforcer to verify tests written first    │
│ • Use /property-test-generator for property-based tests     │
│ • Use /anti-cargo-cult-reviewer to reject fake tests        │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 3: IMPLEMENT (Make Tests Pass)                        │
│ • Write minimal code to pass tests                          │
│ • Use /module-boundary-reviewer for design validation       │
│ • Refactor for clarity while keeping tests green            │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 4: INDEPENDENT REVIEW (CRITICAL)                      │
│ Use /implementation-reviewer to validate:                   │
│ ✓ All tests pass                                            │
│ ✓ No regressions                                            │
│ ✓ Code quality perfect                                      │
│ ✓ Professional standards met                                │
│ ✓ No bugs detected                                          │
│ ✓ Specification met                                         │
└──────────────────┬──────────────────────────────────────────┘
                   │
            ┌──────┴──────┐
            │             │
    ALL CRITERIA MET?     │
            │             │
           YES           NO
            │             │
            │             ▼
            │    ┌────────────────────────────┐
            │    │ REJECTED - Fix Issues      │
            │    │ Address ALL issues listed  │
            │    │ Return to appropriate stage│
            │    └────────────┬───────────────┘
            │                 │
            │    ┌────────────┘
            │    └──> Return to Stage 2, 3, or 4
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 5: WORK COMPLETE                                      │
│ ✅ All quality criteria met                                  │
│ ✅ Implementation approved                                   │
│ ✅ Ready for integration                                     │
└─────────────────────────────────────────────────────────────┘
```

## Exit Criteria

### 1. Tests (MUST ALL PASS)
- [ ] `pnpm test` shows 100% pass rate
- [ ] No unconditional test skips (business logic must always run)
- [ ] Conditional skips (`skipIf`) allowed only for environment-native/hardware tests
- [ ] No flaky tests

### 2. No Regressions
- [ ] All previously passing tests still pass
- [ ] No new test failures

### 3. Code Quality
- [ ] `pnpm lint` passes with zero violations
- [ ] Type hints on all function signatures
- [ ] JSDoc on all public functions
- [ ] No commented-out code

### 4. Professional Standards
- [ ] Clear, descriptive names
- [ ] No magic numbers
- [ ] Functions are small (< 50 lines)
- [ ] No circular dependencies

### 5. No Bugs
- [ ] Logic reviewed and sound
- [ ] Edge cases handled
- [ ] Error handling appropriate

### 6. Specification Met
- [ ] Original requirements fulfilled
- [ ] Invariants documented and tested

## Review Communication Protocol

### When REJECTED

Reviewer returns structured feedback:

```
REVIEW STATUS: REJECTED

Work does NOT meet exit criteria:

1. [TESTS] {specific issue}
   File: {file}:{line}
   Fix: {specific action}

2. [CODE QUALITY] {specific issue}
   File: {file}:{line}
   Fix: {specific action}

NEXT STEPS:
1. Address ALL issues
2. Resubmit for review
```

### Developer Response

- Fix ALL issues listed (not just some)
- Do NOT argue (criteria are objective)
- Return to appropriate stage
- Call `/implementation-reviewer` again

## Independent Reviewer Authority

The `/implementation-reviewer` has FINAL authority:

**Can Do**:
- REJECT implementations that don't meet criteria
- REQUIRE specific fixes
- PREVENT merging of substandard code

**Cannot Be**:
- Bypassed
- Overridden
- Rushed

## Key Principles

1. **Independence**: Reviewer cannot be influenced
2. **Completeness**: ALL criteria must be met
3. **Objectivity**: Feedback based on criteria
4. **Iteration**: Loop continues until approved
5. **Authority**: Reviewer has final decision
