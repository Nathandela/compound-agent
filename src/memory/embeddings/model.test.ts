/**
 * Tests for embedding model resolution.
 *
 * Note: Most tests are skipped if the model is not available.
 * To run all tests, download the model first:
 * npx node-llama-cpp pull hf:ggml-org/embeddinggemma-300M-qat-q4_0-GGUF
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

// Check if embedding tests should be skipped (env var or model unavailable)
const modelAvailable = isModelAvailable();
const modelUsability = modelAvailable ? await isModelUsable() : { usable: false as const };
const skipEmbedding = shouldSkipEmbeddingTests(modelAvailable, modelUsability.usable);

// Keep tests isolated from module-level probe above.
clearUsabilityCache();

describe('embedding model resolution', () => {
  describe('MODEL_URI', () => {
    it('points to EmbeddingGemma Q4_0 model', () => {
      expect(MODEL_URI).toContain('embeddinggemma');
      expect(MODEL_URI).toContain('q4_0');
      expect(MODEL_URI).toContain('.gguf');
    });

    it('uses HuggingFace URI scheme', () => {
      expect(MODEL_URI).toMatch(/^hf:/);
    });
  });

  describe('MODEL_FILENAME', () => {
    it('matches the expected filename', () => {
      expect(MODEL_FILENAME).toBe('hf_ggml-org_embeddinggemma-300M-qat-Q4_0.gguf');
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
    it.skipIf(skipEmbedding)('returns path to model file', async () => {
      const path = await resolveModel({ cli: false });
      expect(path).toContain(MODEL_FILENAME);
      expect(path).toContain('.gguf');
    });

    it.skipIf(skipEmbedding)('returns consistent path', async () => {
      const path1 = await resolveModel({ cli: false });
      const path2 = await resolveModel({ cli: false });
      expect(path1).toBe(path2);
    });

    it.skipIf(skipEmbedding)('accepts cli option to suppress progress output', async () => {
      // cli: false suppresses download progress (delegates to node-llama-cpp)
      const path = await resolveModel({ cli: false });
      expect(path).toContain(MODEL_FILENAME);
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

    it.runIf(!modelAvailable)('returns usable=false with reason when model file not present', async () => {
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
