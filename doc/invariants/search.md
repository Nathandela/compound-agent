# Search Module Invariants

## Vector Search (src/search/vector.ts)

### Data Invariants
```
D1: cosineSimilarity returns value in range [-1, 1]
D2: ScoredLesson.score is raw cosine similarity
D3: Result count <= limit; results sorted by score descending
```

### Safety Properties
```
S1: cosineSimilarity throws if vectors have different lengths
S2: Zero-magnitude vector produces similarity 0 (no division error)
S3: searchVector never modifies stored lessons
S4: Empty lessons list returns empty results
```

### Liveness Properties
```
L1: Higher similarity lessons appear earlier in results
L2: Identical query and lesson text produces similarity near 1.0
```

## Ranking (src/search/ranking.ts)

### Data Invariants
```
D1: Boosts: high=1.5, medium=1.0, low=0.8, recent=1.2, confirmed=1.3
D2: finalScore = vectorSimilarity * severity * recency * confirmation
D3: Quick lessons use medium severity boost (1.0)
```

### Safety Properties
```
S1: All boost values are positive (no negative scores)
S2: rankLessons returns new array (does not mutate input)
S3: Invalid dates do not cause exceptions
```

### Liveness Properties
```
L1: All input lessons appear in output
L2: Ranking completes in O(n log n) time
```
