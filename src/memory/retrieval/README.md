# Retrieval Module

Lesson retrieval for session start and plan-time.

## Files

- **session.ts** - Session-start retrieval
  - `loadSessionLessons()` - Load high-severity, confirmed lessons
  - Returns top N lessons sorted by recency (default: 5)
  - No vector search, just filter and sort

- **plan.ts** - Plan-time retrieval with vector search
  - `retrieveForPlan()` - Find relevant lessons for a plan
  - `formatLessonsCheck()` - Format lessons as displayable message
  - Uses vector search + ranking boosts
  - Returns `PlanRetrievalResult` with lessons and message

## Dependencies

- Depends on: `storage/jsonl.ts`, `search/vector.ts`, `search/ranking.ts`
- Used by: CLI, hooks

## Usage Patterns

```typescript
// Session start - surface critical lessons
const critical = await loadSessionLessons(repoRoot);

// Plan time - find semantically relevant lessons
const { lessons, message } = await retrieveForPlan(repoRoot, planText);
```
