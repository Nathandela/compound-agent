import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { access } from 'fs/promises';
import { getModelPath } from './download.js';
import { embedText, embedTexts, getEmbedding, unloadEmbedding } from './nomic.js';

describe('nomic embeddings', () => {
  let modelAvailable = false;

  beforeAll(async () => {
    // Check if model is available (skip download-dependent tests if not)
    try {
      await access(getModelPath());
      modelAvailable = true;
    } catch {
      modelAvailable = false;
    }
  });

  afterAll(() => {
    unloadEmbedding();
  });

  describe('embedText', () => {
    it.skipIf(!modelAvailable)('returns a vector for text input', async () => {
      const vector = await embedText('Use Polars for large files');
      expect(Array.isArray(vector)).toBe(true);
      expect(vector.length).toBeGreaterThan(0);
      expect(vector.every((v) => typeof v === 'number')).toBe(true);
    });

    it.skipIf(!modelAvailable)('returns consistent vectors for same input', async () => {
      const v1 = await embedText('test input');
      const v2 = await embedText('test input');
      expect(v1).toEqual(v2);
    });

    it.skipIf(!modelAvailable)('returns different vectors for different input', async () => {
      const v1 = await embedText('apples');
      const v2 = await embedText('programming');
      expect(v1).not.toEqual(v2);
    });

    it.skipIf(!modelAvailable)('handles empty string', async () => {
      const vector = await embedText('');
      expect(Array.isArray(vector)).toBe(true);
    });

    it.skipIf(!modelAvailable)('handles long text', async () => {
      const longText = 'This is a test sentence. '.repeat(100);
      const vector = await embedText(longText);
      expect(Array.isArray(vector)).toBe(true);
      expect(vector.length).toBeGreaterThan(0);
    });
  });

  describe('embedTexts', () => {
    it.skipIf(!modelAvailable)('processes multiple texts', async () => {
      const texts = ['first text', 'second text', 'third text'];
      const vectors = await embedTexts(texts);
      expect(vectors).toHaveLength(3);
      expect(vectors.every((v) => Array.isArray(v))).toBe(true);
    });

    it.skipIf(!modelAvailable)('returns empty array for empty input', async () => {
      const vectors = await embedTexts([]);
      expect(vectors).toEqual([]);
    });

    it.skipIf(!modelAvailable)('maintains order of results', async () => {
      const texts = ['apple', 'banana'];
      const vectors = await embedTexts(texts);
      const singleApple = await embedText('apple');
      const singleBanana = await embedText('banana');

      expect(vectors[0]).toEqual(singleApple);
      expect(vectors[1]).toEqual(singleBanana);
    });
  });

  describe('getEmbedding', () => {
    it.skipIf(!modelAvailable)('returns same instance on multiple calls', async () => {
      const e1 = await getEmbedding();
      const e2 = await getEmbedding();
      expect(e1).toBe(e2);
    });
  });

  describe('error handling', () => {
    it('throws if model not available and not downloaded', async () => {
      // This test checks the hard-fail requirement
      // When model is missing, it should throw, not silently fail
      if (modelAvailable) {
        // Model exists, skip this test
        return;
      }

      // Model doesn't exist - should throw when trying to load
      await expect(getEmbedding()).rejects.toThrow();
    });
  });
});
