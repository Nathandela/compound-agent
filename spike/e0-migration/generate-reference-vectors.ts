/**
 * Generate reference embedding vectors from the current TS implementation.
 * These vectors will be compared against Rust ort crate output to validate A2.
 *
 * Output: reference-vectors.json — array of {text, vector} pairs
 */

import { embedText } from '../../src/memory/embeddings/nomic.js';
import { unloadEmbeddingResources } from '../../src/memory/embeddings/nomic.js';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 50 canonical texts covering different domains and lengths
const CANONICAL_TEXTS = [
  // Short single-word/phrase
  'hello',
  'embedding',
  'search: database query optimization',

  // Technical
  'When a CLI command completes, the process SHALL exit within 100ms.',
  'SQLite FTS5 full-text search with BM25 ranking',
  'The system shall not leave zombie processes after any CLI command exits.',
  'Cosine similarity between two normalized vectors equals their dot product.',
  'ONNX Runtime loads quantized int8 models for inference.',
  'Unix domain sockets provide low-latency IPC on the same machine.',
  'Go static binaries start in under 10ms with no runtime dependencies.',

  // Natural language
  'The quick brown fox jumps over the lazy dog.',
  'To be or not to be, that is the question.',
  'All happy families are alike; each unhappy family is unhappy in its own way.',
  'It was the best of times, it was the worst of times.',
  'In the beginning was the Word, and the Word was with God.',

  // Code-like
  'function embedText(text: string): Promise<Float32Array>',
  'SELECT id, trigger, insight FROM lessons WHERE deleted = 0',
  'CREATE VIRTUAL TABLE lessons_fts USING fts5(id, trigger, insight, tags)',
  'pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32',
  'go func() { conn, _ := net.Dial("unix", socketPath) }()',

  // Mixed domain
  'The embedding model produces 768-dimensional normalized Float32 vectors.',
  'Hook handlers must complete within 50ms including process startup time.',
  'Property-based testing discovers edge cases that example tests miss.',
  'Lessons learned from past mistakes should be captured and recalled.',
  'The daemon auto-starts on first embedding request and exits after 5min idle.',

  // Edge cases: special characters, unicode
  'café résumé naïve',
  '日本語のテスト文',
  'Ñoño español con acentos',
  '🎯 Target acquired — mission complete!',
  '',  // empty string

  // Repetition and near-duplicates
  'The cat sat on the mat.',
  'The cat sat on a mat.',
  'A cat was sitting on the mat.',
  'Dogs are great pets.',

  // Long text
  'Machine learning models process input data through multiple layers of transformation, each layer learning increasingly abstract representations. In natural language processing, transformer architectures use self-attention mechanisms to capture relationships between tokens regardless of their distance in the input sequence. The nomic-embed-text model uses this architecture to produce dense vector representations that capture semantic meaning.',

  // Numbers and mixed
  'Error code 404: resource not found',
  'Version 1.8.0 released on 2026-03-15',
  'Temperature: 98.6°F (37°C)',
  'Array dimensions: [768] dtype=float32',
  'Priority P0 critical bug in authentication module',

  // Questions
  'How do I configure Claude Code hooks?',
  'What is the difference between FTS5 and regular LIKE queries?',
  'Why does the ONNX Runtime leave zombie processes?',

  // Short fragments
  'fix: resolve process leak',
  'feat: add vector search',
  'BREAKING: remove deprecated API',
  'chore: update dependencies',
  'test: add property-based tests for search ranking',

  // One more to hit 50
  'The compound-agent system helps Claude Code avoid repeating mistakes across sessions by capturing, storing, and retrieving lessons learned from corrections and discoveries.',
];

async function main() {
  console.log(`Generating reference vectors for ${CANONICAL_TEXTS.length} texts...`);

  const results: Array<{ text: string; vector: number[] }> = [];

  for (let i = 0; i < CANONICAL_TEXTS.length; i++) {
    const text = CANONICAL_TEXTS[i];
    const vector = await embedText(text);
    results.push({ text, vector: Array.from(vector) });
    if ((i + 1) % 10 === 0) {
      console.log(`  ${i + 1}/${CANONICAL_TEXTS.length} done`);
    }
  }

  const outPath = join(__dirname, 'reference-vectors.json');
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Wrote ${results.length} vectors to ${outPath}`);
  console.log(`Vector dimensions: ${results[0].vector.length}`);

  await unloadEmbeddingResources();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
