/**
 * Tests for embedding model resolution.
 *
 * Note: Most tests are skipped if the model is not available.
 * To run all tests, download the model first: npx ca download-model
 */

import { afterEach, describe, expect, it } from 'vitest';

import { shouldSkipEmbeddingTests } from '../../test-utils.js';

import {
  clearUsabilityCache,
  isModelAvailable,
  isModelUsable,
  MODEL_FILENAME,
  MODEL_URI,
  resolveModel,
} from './model.js';

// Skip-gate uses isModelAvailable() only (fs.existsSync, zero native memory).
const modelAvailable = isModelAvailable();
const skipEmbedding = shouldSkipEmbeddingTests(modelAvailable);

describe('embedding model resolution', () => {
  describe('MODEL_URI', () => {
    it('points to nomic-embed-text-v1.5 model', () => {
      expect(MODEL_URI).toBe('nomic-ai/nomic-embed-text-v1.5');
    });
  });

  describe('MODEL_FILENAME', () => {
    it('matches HuggingFace cache directory convention', () => {
      expect(MODEL_FILENAME).toBe('models--nomic-ai--nomic-embed-text-v1.5');
    });
  });

  describe('isModelAvailable', () => {
    it('returns boolean', () => {
      const result = isModelAvailable();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('resolveModel', () => {
    // Skip if model not available (avoid download in CI)
    it.skipIf(skipEmbedding)('returns model identifier', async () => {
      const id = await resolveModel({ cli: false });
      expect(id).toBe(MODEL_URI);
    });

    it.skipIf(skipEmbedding)('returns consistent result', async () => {
      const id1 = await resolveModel({ cli: false });
      const id2 = await resolveModel({ cli: false });
      expect(id1).toBe(id2);
    });
  });

  describe('isModelUsable', () => {
    // Clear cache after each test to ensure isolation
    afterEach(() => {
      clearUsabilityCache();
    });

    it('returns a UsabilityResult object', async () => {
      const result = await isModelUsable();
      expect(result).toHaveProperty('usable');
      expect(typeof result.usable).toBe('boolean');
    }, 15000);

    it.runIf(!modelAvailable)('returns usable=false with reason when model not present', async () => {
      const result = await isModelUsable();
      expect(result.usable).toBe(false);
      expect(result.reason).toContain('not found');
      expect(result.action).toContain('download-model');
    });

    it.skipIf(skipEmbedding)('returns usable=true when model can initialize', async () => {
      const result = await isModelUsable();
      expect(result.usable).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it.skipIf(skipEmbedding)('cleans up resources after preflight check', async () => {
      // Should not leave any resources loaded after check
      const result = await isModelUsable();
      expect(result.usable).toBe(true);
      // If cleanup failed, subsequent calls would potentially fail or leak memory
      const result2 = await isModelUsable();
      expect(result2.usable).toBe(true);
    });

    it.runIf(!modelAvailable)('provides actionable error message on failure', async () => {
      const result = await isModelUsable();
      expect(result.usable).toBe(false);
      // Should provide clear action to fix
      expect(result.action).toBeDefined();
      expect(result.action).toMatch(/download-model|npx ca/);
    });

    it('caches result to avoid double initialization', async () => {
      // First call
      const result1 = await isModelUsable();
      // Second call should return cached result (no re-initialization)
      const result2 = await isModelUsable();
      expect(result1).toBe(result2); // Same object reference (cached)
    });

    it('clearUsabilityCache resets the cache', async () => {
      const result1 = await isModelUsable();
      clearUsabilityCache();
      const result2 = await isModelUsable();
      // After clearing, should be a new result (different object reference)
      expect(result1).not.toBe(result2);
      // But same usability status
      expect(result1.usable).toBe(result2.usable);
    }, 15000);
  });
});
