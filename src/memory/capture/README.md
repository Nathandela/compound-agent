# Capture Module

Quality filters and trigger detection for lesson capture.

## Files

- **quality.ts** - Filters to ensure lessons are worth storing
  - `shouldPropose()` - Combined check: novel + specific + actionable
  - `isNovel()` - Duplicate detection via keyword search
  - `isSpecific()` - Reject vague patterns ("be careful", "try to")
  - `isActionable()` - Require action patterns ("use X instead of Y")

- **triggers.ts** - Detect learning opportunities
  - `detectUserCorrection()` - Find "no", "wrong", "actually" patterns
  - `detectSelfCorrection()` - Detect edit-fail-re-edit on same file
  - `detectTestFailure()` - Capture test failures for potential lessons

## Dependencies

- Depends on: `storage/sqlite.ts`, `types.ts`
- Used by: External callers (hooks, CLI)

## Quality Gate

Lessons must pass all three checks:
1. **Novelty** - Not similar to existing lessons (Jaccard > 0.8)
2. **Specificity** - At least 4 words, no vague phrases
3. **Actionability** - Contains clear action guidance
