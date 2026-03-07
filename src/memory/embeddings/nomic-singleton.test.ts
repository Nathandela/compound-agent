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
  LlamaLogLevel: { disabled: 'disabled', fatal: 'fatal', error: 'error', warn: 'warn', info: 'info', log: 'log', debug: 'debug' },
}));

vi.mock('./model.js', () => ({
  resolveModel: vi.fn(),
  isModelAvailable: vi.fn(() => true),
}));

import { getLlama } from 'node-llama-cpp';
import { resolveModel } from './model.js';
import { getEmbedding, unloadEmbedding, unloadEmbeddingResources, withEmbedding } from './nomic.js';

function createMockContext() {
  return { dispose: vi.fn().mockResolvedValue(undefined), getEmbeddingFor: vi.fn() };
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
    it('unloadEmbeddingResources() disposes context and allows re-initialization', async () => {
      const mocks1 = setupMocks();

      // First init
      const ctx1 = await getEmbedding();
      expect(ctx1).toBe(mocks1.context);

      // Unload (await the async version)
      await unloadEmbeddingResources();
      expect(mocks1.context.dispose).toHaveBeenCalledTimes(1);

      // Setup fresh mocks for second init
      const mocks2 = setupMocks();

      // Re-init should create new instances
      const ctx2 = await getEmbedding();
      expect(ctx2).toBe(mocks2.context);

      // getLlama called twice total (once per init cycle)
      expect(getLlama).toHaveBeenCalledTimes(2);
    });

    it('unloadEmbeddingResources() calls dispose on model and llama refs', async () => {
      const { context, model, llama } = setupMocks();

      await getEmbedding();
      await unloadEmbeddingResources();

      expect(context.dispose).toHaveBeenCalledTimes(1);
      expect(model.dispose).toHaveBeenCalledTimes(1);
      expect(llama.dispose).toHaveBeenCalledTimes(1);
    });

    it('unloadEmbedding() is safe to call when not initialized', () => {
      // Should not throw
      expect(() => unloadEmbedding()).not.toThrow();
    });
  });

  describe('withEmbedding()', () => {
    it('returns the callback result', async () => {
      setupMocks();
      const result = await withEmbedding(async () => 42);
      expect(result).toBe(42);
    });

    it('calls unloadEmbeddingResources after callback completes', async () => {
      const { context, model, llama } = setupMocks();
      await withEmbedding(async () => {
        await getEmbedding();
      });
      // All native resources should be disposed
      expect(context.dispose).toHaveBeenCalledTimes(1);
      expect(model.dispose).toHaveBeenCalledTimes(1);
      expect(llama.dispose).toHaveBeenCalledTimes(1);
    });

    it('cleans up even when callback throws', async () => {
      const { context, model, llama } = setupMocks();
      await expect(
        withEmbedding(async () => {
          await getEmbedding();
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      // Resources still disposed
      expect(context.dispose).toHaveBeenCalledTimes(1);
      expect(model.dispose).toHaveBeenCalledTimes(1);
      expect(llama.dispose).toHaveBeenCalledTimes(1);
    });

    it('is safe to call when model was never loaded', async () => {
      // No setupMocks — withEmbedding should not throw during cleanup
      const result = await withEmbedding(async () => 'ok');
      expect(result).toBe('ok');
    });
  });

  describe('getLlama() initialization options', () => {
    it('passes build: "never" to prevent compilation from source', async () => {
      setupMocks();
      await getEmbedding();
      expect(getLlama).toHaveBeenCalledWith(
        expect.objectContaining({ build: 'never' }),
      );
    });

    it('passes progressLogs: false to suppress binary fallback warnings', async () => {
      setupMocks();
      await getEmbedding();
      expect(getLlama).toHaveBeenCalledWith(
        expect.objectContaining({ progressLogs: false }),
      );
    });

    it('passes logLevel: error to suppress C++ backend warn-level noise', async () => {
      setupMocks();
      await getEmbedding();
      expect(getLlama).toHaveBeenCalledWith(
        expect.objectContaining({ logLevel: 'error' }),
      );
    });

    it('does not set gpu option (preserves default auto-detection)', async () => {
      setupMocks();
      await getEmbedding();
      const callArgs = vi.mocked(getLlama).mock.calls[0]![0] as Record<string, unknown>;
      expect(callArgs).not.toHaveProperty('gpu');
    });
  });
});
