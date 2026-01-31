# Search Module

Vector similarity search and multi-factor ranking for lessons.

## Files

- **vector.ts** - Semantic search via embeddings
  - `searchVector()` - Find lessons by vector similarity to query
  - `cosineSimilarity()` - Calculate similarity between two vectors
  - `ScoredLesson` - Lesson with similarity score

- **ranking.ts** - Multi-factor ranking with boosts
  - `rankLessons()` - Apply all boosts and sort by final score
  - `calculateScore()` - Combine vector similarity with boosts
  - `severityBoost()` - high=1.5, medium=1.0, low=0.8
  - `recencyBoost()` - 1.2 for lessons under 30 days old
  - `confirmationBoost()` - 1.3 for confirmed lessons
  - `RankedLesson` - Lesson with final ranked score

## Dependencies

- Depends on: `storage/jsonl.ts`, `embeddings/nomic.ts`, `types.ts`
- Used by: `retrieval/plan.ts`

## Scoring Formula

```
finalScore = vectorSimilarity * severity * recency * confirmation
```
