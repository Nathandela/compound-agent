# Embeddings Module Invariants

## Nomic Embeddings (src/embeddings/nomic.ts)

### Data Invariants
```
D1: Vectors are arrays of finite numbers (no NaN, no Infinity)
D2: All vectors from same model have identical dimension
D3: Output order of embedTexts matches input order
```

### Safety Properties
```
S1: Missing model throws Error with message (no fallback)
S2: Singleton pattern prevents multiple model loads
S3: Same input text always produces same output vector (deterministic)
S4: embedTexts with empty array returns empty array
```

### Liveness Properties
```
L1: getEmbedding lazy-loads model on first call
L2: embedText completes in bounded time for bounded input
L3: After unloadEmbedding, next getEmbedding reloads model
```

## Model Download (src/embeddings/download.ts)

### Safety Properties
```
S1: Download only from trusted source (huggingface.co)
S2: Existing valid model not re-downloaded
S3: Partial downloads do not leave corrupted model file
```

### Liveness Properties
```
L1: isModelAvailable returns boolean, never throws
L2: Download completes or fails with clear error
```
