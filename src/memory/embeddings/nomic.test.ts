/**
 * Tests for text embedding functionality.
 *
 * Note: Tests that require the model are skipped if it's not available.
 * Run `npx node-llama-cpp pull hf:ggml-org/embeddinggemma-300M-qat-q4_0-GGUF` to download.
 */

import { afterAll, describe, expect, it } from 'vitest';

import { shouldSkipEmbeddingTests } from '../../test-utils.js';
import { isModelUsable } from './model.js';

import { embedText, embedTexts, getEmbedding, isModelAvailable, unloadEmbedding } from './nomic.js';

// Check if embedding tests should be skipped (env var, model unavailable, or runtime unusable)
const modelAvailable = isModelAvailable();
const modelUsability = modelAvailable ? await isModelUsable() : { usable: false as const };
const skipEmbedding = shouldSkipEmbeddingTests(modelAvailable, modelUsability.usable);

describe('embeddings', () => {
  afterAll(() => {
    unloadEmbedding();
  });

  describe('embedText', () => {
    it.skipIf(skipEmbedding)('returns a vector for text input', async () => {
      const vector = await embedText('Use Polars for large files');
      expect(Array.isArray(vector)).toBe(true);
      expect(vector.length).toBeGreaterThan(0);
      expect(vector.every((v) => typeof v === 'number')).toBe(true);
    });

    it.skipIf(skipEmbedding)('returns consistent vectors for same input', async () => {
      const v1 = await embedText('test input');
      const v2 = await embedText('test input');
      expect(v1).toEqual(v2);
    });

    it.skipIf(skipEmbedding)('returns different vectors for different input', async () => {
      const v1 = await embedText('apples');
      const v2 = await embedText('programming');
      expect(v1).not.toEqual(v2);
    });

    it.skipIf(skipEmbedding)('handles empty string', async () => {
      const vector = await embedText('');
      expect(Array.isArray(vector)).toBe(true);
    });

    it.skipIf(skipEmbedding)('handles long text', async () => {
      const longText = 'This is a test sentence. '.repeat(100);
      const vector = await embedText(longText);
      expect(Array.isArray(vector)).toBe(true);
      expect(vector.length).toBeGreaterThan(0);
    });
  });

  describe('embedTexts', () => {
    it.skipIf(skipEmbedding)('processes multiple texts', async () => {
      const texts = ['first text', 'second text', 'third text'];
      const vectors = await embedTexts(texts);
      expect(vectors).toHaveLength(3);
      expect(vectors.every((v) => Array.isArray(v))).toBe(true);
    });

    it.skipIf(skipEmbedding)('returns empty array for empty input', async () => {
      const vectors = await embedTexts([]);
      expect(vectors).toEqual([]);
    });

    it.skipIf(skipEmbedding)('maintains order of results', async () => {
      const texts = ['apple', 'banana'];
      const vectors = await embedTexts(texts);
      const singleApple = await embedText('apple');
      const singleBanana = await embedText('banana');

      expect(vectors[0]).toEqual(singleApple);
      expect(vectors[1]).toEqual(singleBanana);
    });
  });

  describe('getEmbedding', () => {
    it.skipIf(skipEmbedding)('returns same instance on multiple calls', async () => {
      const e1 = await getEmbedding();
      const e2 = await getEmbedding();
      expect(e1).toBe(e2);
    });
  });
});
