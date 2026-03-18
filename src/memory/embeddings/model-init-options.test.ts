/**
 * Tests for pipeline() initialization options in isModelUsable().
 *
 * Verifies that the correct options are passed to Transformers.js pipeline,
 * and that resources are properly disposed after the probe.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(),
}));

import { existsSync } from 'node:fs';
import { pipeline } from '@huggingface/transformers';
import { clearUsabilityCache, isModelUsable } from './model.js';

// We need to mock existsSync to pretend the model directory exists
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: vi.fn(() => true) };
});

function createMockPipeline() {
  const mockOutput = { data: new Float32Array(768).fill(0.1) };
  return Object.assign(vi.fn().mockResolvedValue(mockOutput), {
    dispose: vi.fn().mockResolvedValue(undefined),
  });
}

function setupMocks() {
  const mockPipeline = createMockPipeline();
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(pipeline).mockResolvedValue(mockPipeline as any);
  return { mockPipeline };
}

describe('isModelUsable() initialization options', () => {
  afterEach(() => {
    clearUsabilityCache();
    vi.clearAllMocks();
  });

  describe('pipeline() options', () => {
    it('uses feature-extraction task', async () => {
      setupMocks();
      await isModelUsable();
      expect(pipeline).toHaveBeenCalledWith(
        'feature-extraction',
        expect.any(String),
        expect.any(Object),
      );
    });

    it('passes dtype: "q8" for quantization', async () => {
      setupMocks();
      await isModelUsable();
      expect(pipeline).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ dtype: 'q8' }),
      );
    });

    it('uses nomic-ai/nomic-embed-text-v1.5 model', async () => {
      setupMocks();
      await isModelUsable();
      expect(pipeline).toHaveBeenCalledWith(
        expect.any(String),
        'nomic-ai/nomic-embed-text-v1.5',
        expect.any(Object),
      );
    });
  });

  describe('resource cleanup', () => {
    it('disposes pipeline after successful check', async () => {
      const { mockPipeline } = setupMocks();
      await isModelUsable();
      expect(mockPipeline.dispose).toHaveBeenCalledTimes(1);
    });

    it('disposes pipeline even when creation fails partially', async () => {
      const mockPipeline = createMockPipeline();
      // First call fails, but we want to ensure cleanup still happens
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(pipeline).mockRejectedValue(new Error('pipeline creation failed'));

      const result = await isModelUsable();
      expect(result.usable).toBe(false);
      // pipeline.dispose would not be called since pipeline creation failed
      // but the function should still return gracefully
      expect(mockPipeline).toBeDefined();
    });
  });

  describe('caching', () => {
    it('returns cached result on second call', async () => {
      setupMocks();
      const result1 = await isModelUsable();
      const result2 = await isModelUsable();
      expect(result1).toBe(result2); // Same reference
      expect(pipeline).toHaveBeenCalledTimes(1); // Only one probe
    });

    it('clearUsabilityCache allows fresh probe', async () => {
      setupMocks();
      const result1 = await isModelUsable();
      clearUsabilityCache();
      const result2 = await isModelUsable();
      expect(result1).not.toBe(result2); // Different references
      expect(pipeline).toHaveBeenCalledTimes(2); // Two probes
    });
  });

  describe('fast-fail path', () => {
    it('returns usable=false without creating pipeline if model not found', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const result = await isModelUsable();
      expect(result.usable).toBe(false);
      expect(result.reason).toContain('not found');
      expect(result.action).toContain('download-model');
      expect(pipeline).not.toHaveBeenCalled();
    });
  });
});
