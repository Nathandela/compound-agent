# Capture Module Invariants

## Quality Filters (src/capture/quality.ts)

### Data Invariants
```
D1: DUPLICATE_THRESHOLD = 0.98, MIN_WORD_COUNT = 4
D2: All check functions return Result with boolean + optional reason
```

### Safety Properties
```
S1: isNovel rebuilds index before checking (fresh data)
S2: Exact duplicates and high-similarity insights rejected
S3: Vague patterns (be careful, remember to) always rejected
S4: Insights under 4 words rejected; shouldPropose fails if ANY check fails
S5: Quality checks are read-only (no storage modification)
```

### Liveness Properties
```
L1: Fast checks run before DB lookup; combined check completes in bounded time
```

## Trigger Detection (src/capture/triggers.ts)

### Data Invariants
```
D1: USER_CORRECTION_PATTERNS: no, wrong, actually, not that, I meant
```

### Safety Properties
```
S1: detectUserCorrection requires >= 2 messages
S2: detectSelfCorrection requires >= 3 edit entries (edit->fail->re-edit)
S3: detectTestFailure returns null if tests passed
S4: All detection is read-only; pattern matching is case-insensitive
```

### Liveness Properties
```
L1: Patterns detected when matching; null returned otherwise (not exception)
```
