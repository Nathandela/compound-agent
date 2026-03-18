/**
 * Tests for embedding singleton coordination, race condition prevention,
 * and proper resource cleanup.
 *
 * These tests mock @huggingface/transformers to test coordination logic in isolation.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock external dependencies to test coordination logic
vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(),
}));

vi.mock('./model.js', () => ({
  resolveModel: vi.fn(),
  isModelAvailable: vi.fn(() => true),
}));

import { pipeline } from '@huggingface/transformers';
import { resolveModel } from './model.js';
import { getEmbedding, unloadEmbedding, unloadEmbeddingResources, withEmbedding } from './nomic.js';

function createMockPipeline() {
  const mockOutput = { data: new Float32Array(768).fill(0.1) };
  return Object.assign(vi.fn().mockResolvedValue(mockOutput), {
    dispose: vi.fn().mockResolvedValue(undefined),
  });
}

function setupMocks() {
  const mockPipeline = createMockPipeline();
  vi.mocked(resolveModel).mockResolvedValue('nomic-ai/nomic-embed-text-v1.5');
  vi.mocked(pipeline).mockResolvedValue(mockPipeline as any);
  return { mockPipeline };
}

describe('embedding singleton coordination', () => {
  afterEach(async () => {
    await unloadEmbeddingResources();
    vi.clearAllMocks();
  });

  describe('concurrent initialization', () => {
    it('concurrent getEmbedding() calls create only one pipeline', async () => {
      setupMocks();

      // Use microtask delay to simulate async model loading without real timers
      vi.mocked(pipeline).mockImplementation(async () => {
        // Yield to event loop so concurrent calls can race
        await Promise.resolve();
        return createMockPipeline() as any;
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

      // pipeline should only be called once (not 5 times)
      expect(pipeline).toHaveBeenCalledTimes(1);
    });
  });

  describe('retry after failure', () => {
    it('retries initialization after a failed attempt', async () => {
      setupMocks();

      // First call: fail
      vi.mocked(pipeline).mockRejectedValueOnce(new Error('download failed'));
      // Second call: succeed
      const mockPipeline = createMockPipeline();
      vi.mocked(pipeline).mockResolvedValueOnce(mockPipeline as any);

      // First call should reject
      await expect(getEmbedding()).rejects.toThrow('download failed');

      // Second call should retry (not return stale rejected promise)
      const ctx = await getEmbedding();
      expect(ctx).toBeDefined();
      expect(ctx.embed).toBeDefined();
      expect(pipeline).toHaveBeenCalledTimes(2);
    });

    it('concurrent callers all receive the same rejection', async () => {
      setupMocks();

      vi.mocked(pipeline).mockRejectedValue(new Error('load failed'));

      const results = await Promise.allSettled([getEmbedding(), getEmbedding(), getEmbedding()]);

      // All should reject
      expect(results.every((r) => r.status === 'rejected')).toBe(true);
    });
  });

  describe('resource cleanup', () => {
    it('unloadEmbeddingResources() disposes pipeline and allows re-initialization', async () => {
      const { mockPipeline: pipeline1 } = setupMocks();

      // First init
      const ctx1 = await getEmbedding();
      expect(ctx1).toBeDefined();

      // Unload
      await unloadEmbeddingResources();
      expect(pipeline1.dispose).toHaveBeenCalledTimes(1);

      // Setup fresh mocks for second init
      const { mockPipeline: pipeline2 } = setupMocks();

      // Re-init should create new instances
      const ctx2 = await getEmbedding();
      expect(ctx2).toBeDefined();
      expect(ctx2).not.toBe(ctx1);

      // pipeline() called twice total (once per init cycle)
      expect(pipeline).toHaveBeenCalledTimes(2);
      // Cleanup second
      expect(pipeline2).toBeDefined();
    });

    it('unloadEmbedding() is safe to call when not initialized', () => {
      // Should not throw
      expect(() => unloadEmbedding()).not.toThrow();
    });

    it('pipeline.dispose() is called during cleanup', async () => {
      const { mockPipeline } = setupMocks();

      await getEmbedding();
      await unloadEmbeddingResources();

      expect(mockPipeline.dispose).toHaveBeenCalledTimes(1);
    });

    it('skips null resources gracefully', async () => {
      // Don't initialize — all refs are null
      await expect(unloadEmbeddingResources()).resolves.toBeUndefined();
    });
  });

  describe('withEmbedding()', () => {
    it('returns the callback result', async () => {
      setupMocks();
      const result = await withEmbedding(async () => 42);
      expect(result).toBe(42);
    });

    it('calls unloadEmbeddingResources after callback completes', async () => {
      const { mockPipeline } = setupMocks();
      await withEmbedding(async () => {
        await getEmbedding();
      });
      // Pipeline should be disposed
      expect(mockPipeline.dispose).toHaveBeenCalledTimes(1);
    });

    it('cleans up even when callback throws', async () => {
      const { mockPipeline } = setupMocks();
      await expect(
        withEmbedding(async () => {
          await getEmbedding();
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      // Pipeline still disposed
      expect(mockPipeline.dispose).toHaveBeenCalledTimes(1);
    });

    it('is safe to call when model was never loaded', async () => {
      // No setupMocks — withEmbedding should not throw during cleanup
      const result = await withEmbedding(async () => 'ok');
      expect(result).toBe('ok');
    });
  });

  describe('pipeline() initialization options', () => {
    it('passes dtype: "q8" for quantization', async () => {
      setupMocks();
      await getEmbedding();
      expect(pipeline).toHaveBeenCalledWith(
        'feature-extraction',
        'nomic-ai/nomic-embed-text-v1.5',
        expect.objectContaining({ dtype: 'q8' }),
      );
    });

    it('uses feature-extraction task', async () => {
      setupMocks();
      await getEmbedding();
      expect(pipeline).toHaveBeenCalledWith(
        'feature-extraction',
        expect.any(String),
        expect.any(Object),
      );
    });
  });
});
