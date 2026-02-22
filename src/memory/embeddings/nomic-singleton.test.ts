/**
 * Tests for embedding singleton coordination, race condition prevention,
 * and proper resource cleanup.
 *
 * These tests mock node-llama-cpp to test coordination logic in isolation.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock external dependencies to test coordination logic
vi.mock('node-llama-cpp', () => ({
  getLlama: vi.fn(),
  LlamaEmbeddingContext: class {},
}));

vi.mock('./model.js', () => ({
  resolveModel: vi.fn(),
  isModelAvailable: vi.fn(() => true),
}));

import { getLlama } from 'node-llama-cpp';
import { resolveModel } from './model.js';
import { getEmbedding, unloadEmbedding } from './nomic.js';

function createMockContext() {
  return { dispose: vi.fn(), getEmbeddingFor: vi.fn() };
}

function createMockModel(context: ReturnType<typeof createMockContext>) {
  return {
    createEmbeddingContext: vi.fn().mockResolvedValue(context),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockLlama(model: ReturnType<typeof createMockModel>) {
  return {
    loadModel: vi.fn().mockResolvedValue(model),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

function setupMocks() {
  const context = createMockContext();
  const model = createMockModel(context);
  const llama = createMockLlama(model);

  vi.mocked(resolveModel).mockResolvedValue('/fake/model.gguf');
  vi.mocked(getLlama).mockResolvedValue(llama as any);

  return { context, model, llama };
}

describe('embedding singleton coordination', () => {
  afterEach(() => {
    unloadEmbedding();
    vi.clearAllMocks();
  });

  describe('concurrent initialization', () => {
    it('concurrent getEmbedding() calls create only one context', async () => {
      const { context } = setupMocks();

      // Use microtask delay to simulate async model loading without real timers
      vi.mocked(getLlama).mockImplementation(async () => {
        // Yield to event loop so concurrent calls can race
        await Promise.resolve();
        return {
          loadModel: vi.fn().mockResolvedValue({
            createEmbeddingContext: vi.fn().mockResolvedValue(context),
            dispose: vi.fn().mockResolvedValue(undefined),
          }),
          dispose: vi.fn().mockResolvedValue(undefined),
        } as any;
      });

      // Launch 5 concurrent calls
      const results = await Promise.all([
        getEmbedding(),
        getEmbedding(),
        getEmbedding(),
        getEmbedding(),
        getEmbedding(),
      ]);

      // All should return the same instance
      const unique = new Set(results);
      expect(unique.size).toBe(1);
      expect(results[0]).toBe(context);

      // getLlama should only be called once (not 5 times)
      expect(getLlama).toHaveBeenCalledTimes(1);
    });
  });

  describe('retry after failure', () => {
    it('retries initialization after a failed attempt', async () => {
      const { context, llama } = setupMocks();

      // First call: fail
      vi.mocked(getLlama).mockRejectedValueOnce(new Error('native crash'));
      // Second call: succeed
      vi.mocked(getLlama).mockResolvedValueOnce(llama as any);

      // First call should reject
      await expect(getEmbedding()).rejects.toThrow('native crash');

      // Second call should retry (not return stale rejected promise)
      const ctx = await getEmbedding();
      expect(ctx).toBe(context);
      expect(getLlama).toHaveBeenCalledTimes(2);
    });

    it('concurrent callers all receive the same rejection', async () => {
      setupMocks();

      vi.mocked(getLlama).mockRejectedValue(new Error('load failed'));

      const results = await Promise.allSettled([getEmbedding(), getEmbedding(), getEmbedding()]);

      // All should reject
      expect(results.every((r) => r.status === 'rejected')).toBe(true);
    });
  });

  describe('resource cleanup', () => {
    it('unloadEmbedding() disposes context and allows re-initialization', async () => {
      const mocks1 = setupMocks();

      // First init
      const ctx1 = await getEmbedding();
      expect(ctx1).toBe(mocks1.context);

      // Unload
      unloadEmbedding();
      expect(mocks1.context.dispose).toHaveBeenCalledTimes(1);

      // Setup fresh mocks for second init
      const mocks2 = setupMocks();

      // Re-init should create new instances
      const ctx2 = await getEmbedding();
      expect(ctx2).toBe(mocks2.context);

      // getLlama called twice total (once per init cycle)
      expect(getLlama).toHaveBeenCalledTimes(2);
    });

    it('unloadEmbedding() calls dispose on model and llama refs', async () => {
      const { context, model, llama } = setupMocks();

      await getEmbedding();
      unloadEmbedding();

      expect(context.dispose).toHaveBeenCalledTimes(1);
      expect(model.dispose).toHaveBeenCalledTimes(1);
      expect(llama.dispose).toHaveBeenCalledTimes(1);
    });

    it('unloadEmbedding() is safe to call when not initialized', () => {
      // Should not throw
      expect(() => unloadEmbedding()).not.toThrow();
    });
  });
});
