/**
 * Tests for embedding model resolution.
 *
 * Note: Most tests are skipped if the model is not available.
 * To run all tests, download the model first:
 * npx node-llama-cpp pull hf:ggml-org/embeddinggemma-300M-qat-q4_0-GGUF
 */

import { describe, expect, it } from 'vitest';

import { isModelAvailable, MODEL_FILENAME, MODEL_URI, resolveModel } from './model.js';

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
    it.skipIf(!isModelAvailable())('returns path to model file', async () => {
      const path = await resolveModel({ cli: false });
      expect(path).toContain(MODEL_FILENAME);
      expect(path).toContain('.gguf');
    });

    it.skipIf(!isModelAvailable())('returns consistent path', async () => {
      const path1 = await resolveModel({ cli: false });
      const path2 = await resolveModel({ cli: false });
      expect(path1).toBe(path2);
    });

    it.skipIf(!isModelAvailable())('accepts cli option to suppress progress output', async () => {
      // cli: false suppresses download progress (delegates to node-llama-cpp)
      const path = await resolveModel({ cli: false });
      expect(path).toContain(MODEL_FILENAME);
    });
  });
});
