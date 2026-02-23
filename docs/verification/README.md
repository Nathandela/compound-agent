# Verification Documentation

This directory contains documentation for the systematic code verification practices used in this project.

## Documents

| Document | Purpose |
|----------|---------|
| [closed-loop-review-process.md](closed-loop-review-process.md) | Mandatory review workflow with exit criteria |
| [subagent-pipeline.md](subagent-pipeline.md) | Full 8-step pipeline + optional external reviewers |
| [exit-criteria.md](exit-criteria.md) | Exit criteria checklists for all 8 categories |

## Quick Reference

### TDD Workflow

1. `/invariant-designer` - Define what must be true
2. `/cct-subagent` - Inject mistake-derived test requirements
3. `/test-first-enforcer` - Verify tests written first
4. `/property-test-generator` - Generate property tests
5. `/anti-cargo-cult-reviewer` - Reject fake tests
6. `/module-boundary-reviewer` - Check module design
7. `/drift-detector` - Check constraint drift
8. `/implementation-reviewer` - Final approval
9. External reviewers (optional) - Cross-model review via Gemini/Codex CLI

### Exit Criteria

Work is complete when ALL are true:
- All tests pass
- No regressions
- Code quality perfect
- Professional standards met
- No bugs detected
- Specification met
- Security clear (no P0/P1 findings)
- `/implementation-reviewer` approves
