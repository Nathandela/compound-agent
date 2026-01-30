# Verification Documentation

This directory contains documentation for the systematic code verification practices used in this project.

## Documents

| Document | Purpose |
|----------|---------|
| [closed-loop-review-process.md](closed-loop-review-process.md) | Mandatory review workflow with exit criteria |
| [systematic-code-verification.md](systematic-code-verification.md) | Complete verification playbook |

## Quick Reference

### TDD Workflow

1. `/invariant-designer` - Define what must be true
2. `/test-first-enforcer` - Verify tests written first
3. `/property-test-generator` - Generate property tests
4. Implement minimal code
5. `/module-boundary-reviewer` - Check module design
6. `/implementation-reviewer` - Final approval

### Exit Criteria

Work is complete when ALL are true:
- All tests pass
- No regressions
- Code quality perfect
- Professional standards met
- No bugs detected
- `/implementation-reviewer` approves
