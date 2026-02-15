# Exit Criteria

## Quality Gates

All code must pass these gates before completion:

```bash
pnpm test      # 100% pass rate, no skipped tests
pnpm lint      # Zero violations
```

## Exit Criteria Checklist (ALL Required)

The `/implementation-reviewer` validates ALL categories below. **Every checkbox must pass.** (Category 7 applies only to `/compound:lfg` epic work.)

### 1. Tests (MUST ALL PASS)
- [ ] `pnpm test` shows 100% pass rate
- [ ] No unconditional test skips (business logic must always run)
- [ ] Conditional skips (`skipIf`) allowed only for environment-native/hardware tests
- [ ] No flaky tests

### 2. No Regressions
- [ ] All previously passing tests still pass
- [ ] No new test failures introduced

### 3. Code Quality
- [ ] `pnpm lint` passes with zero violations
- [ ] No commented-out code

### 4. Professional Standards
- [ ] Type hints on all public APIs
- [ ] JSDoc on all public functions
- [ ] Clear, descriptive names
- [ ] No magic numbers
- [ ] Functions < 50 lines

### 5. No Bugs
- [ ] Logic reviewed and sound
- [ ] Edge cases handled
- [ ] Error handling appropriate

### 6. Specification Met
- [ ] Original requirements fulfilled
- [ ] Invariants documented and tested

### 7. Workflow Gates (for `/compound:lfg` epic work)
- [ ] `ca verify-gates <epic-id>` passes (review + compound tasks exist and are closed)
- [ ] All phase gates passed (PHASE GATE 3, PHASE GATE 4, FINAL GATE)

## Rejection Protocol

When `/implementation-reviewer` returns **REJECTED**:

1. **Read ALL issues** -- Every issue must be addressed
2. **Return to appropriate stage** -- May need new tests, new implementation, or just fixes
3. **Fix completely** -- Partial fixes will be rejected again
4. **Resubmit** -- Call `/implementation-reviewer` again
5. **Repeat until APPROVED** -- No shortcuts
