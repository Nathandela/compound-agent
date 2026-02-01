# Age-based Temporal Validity Invariants

## Feature: learning_agent-eik

This document defines the invariants for the age-based temporal validity feature.

## Data Invariants

### DI-1: compactionLevel Range
- `compactionLevel` MUST be 0, 1, or 2 (never undefined for display purposes)
- Default value for new lessons and backwards compatibility: 0 (active)
- Schema makes field optional for backward compatibility

### DI-2: compactionLevel Semantics
- `0` = active (no age concern)
- `1` = flagged (>90 days old, needs review)
- `2` = archived (explicitly archived by compaction)

### DI-3: Age Calculation
- Age is calculated as: `(Date.now() - Date.parse(lesson.created)) / (1000 * 60 * 60 * 24)`
- Age MUST be a non-negative number
- Created date MUST be valid ISO8601

### DI-4: Flagging Threshold
- `AGE_FLAG_THRESHOLD_DAYS = 90`
- A lesson is flagged when: `age > AGE_FLAG_THRESHOLD_DAYS && compactionLevel < 2`

### DI-5: lastRetrieved Tracking
- `lastRetrieved` is ISO8601 timestamp or undefined
- Updated whenever a lesson is retrieved via search or load-session

### DI-6: compactedAt Tracking
- `compactedAt` is ISO8601 timestamp or undefined
- Set only when compactionLevel changes to 2 (archived)

## Safety Properties (What MUST NOT Happen)

### SP-1: No Data Loss on Missing Fields
- Lessons without compactionLevel MUST be treated as active (level 0)
- Missing compactionLevel MUST NOT cause validation errors

### SP-2: No Invalid compactionLevel
- compactionLevel outside [0, 1, 2] MUST be rejected by schema validation

### SP-3: Archived Lessons Not Flagged
- Lessons with compactionLevel=2 MUST NOT be flagged as old (already archived)

## Liveness Properties (What MUST Eventually Happen)

### LP-1: Age Warning Display
- When `load-session` displays a lesson older than 90 days, it MUST show warning marker

### LP-2: Stats Age Distribution
- `stats` command MUST show age distribution breakdown

## Acceptance Criteria Mapping

| Criterion | Invariant(s) |
|-----------|--------------|
| Schema includes compactionLevel | DI-1, DI-2 |
| load-session shows warning | LP-1 |
| stats shows age distribution | LP-2 |
| Tests cover age calculation | DI-3, DI-4 |
