# Embeddings Module

Text embedding via node-llama-cpp with nomic-embed-text-v1.5 model.

## Files

- **download.ts** - Model download and path management
  - `ensureModel()` - Download model if missing (one-time ~500MB)
  - `getModelPath()` - Get path to model file
  - `setModelDir()` / `resetModelDir()` - Override model location (for testing)

- **nomic.ts** - Embedding generation
  - `embedText()` - Embed single text string to vector
  - `embedTexts()` - Batch embed multiple texts
  - `getEmbedding()` - Get singleton LlamaEmbeddingContext
  - `unloadEmbedding()` - Free memory by disposing context

## Dependencies

- Depends on: `node-llama-cpp` for GGUF model inference
- Used by: `search/vector.ts`

## Usage Notes

- Model stored at: `~/.cache/learning-agent/models/`
- Lazy-loads model on first `embedText()` call
- Hard-fails if model not downloaded (run CLI first)
