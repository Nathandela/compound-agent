/**
 * Tests for getLlama() initialization options in isModelUsable().
 *
 * Verifies that the correct options are passed to suppress noisy warnings
 * while preserving GPU auto-detection, and that resources are properly disposed.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node-llama-cpp', () => ({
  getLlama: vi.fn(),
  resolveModelFile: vi.fn(),
  LlamaLogLevel: { disabled: 'disabled', fatal: 'fatal', error: 'error', warn: 'warn', info: 'info', log: 'log', debug: 'debug' },
}));

import { existsSync } from 'node:fs';
import { getLlama } from 'node-llama-cpp';
import { clearUsabilityCache, isModelUsable } from './model.js';

// We need to mock existsSync to pretend the model file exists
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: vi.fn(() => true) };
});

function createMockContext() {
  return { dispose: vi.fn() };
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

  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(getLlama).mockResolvedValue(llama as any);

  return { context, model, llama };
}

describe('isModelUsable() initialization options', () => {
  afterEach(() => {
    clearUsabilityCache();
    vi.clearAllMocks();
  });

  describe('getLlama() options', () => {
    it('passes build: "never" to prevent compilation from source', async () => {
      setupMocks();
      await isModelUsable();
      expect(getLlama).toHaveBeenCalledWith(
        expect.objectContaining({ build: 'never' }),
      );
    });

    it('passes progressLogs: false to suppress binary fallback warnings', async () => {
      setupMocks();
      await isModelUsable();
      expect(getLlama).toHaveBeenCalledWith(
        expect.objectContaining({ progressLogs: false }),
      );
    });

    it('passes logLevel: error to suppress C++ backend warn-level noise', async () => {
      setupMocks();
      await isModelUsable();
      expect(getLlama).toHaveBeenCalledWith(
        expect.objectContaining({ logLevel: 'error' }),
      );
    });

    it('does not set gpu option (preserves default auto-detection)', async () => {
      setupMocks();
      await isModelUsable();
      const callArgs = vi.mocked(getLlama).mock.calls[0]![0] as Record<string, unknown>;
      expect(callArgs).not.toHaveProperty('gpu');
    });
  });

  describe('resource cleanup', () => {
    it('disposes context after successful check', async () => {
      const { context } = setupMocks();
      await isModelUsable();
      expect(context.dispose).toHaveBeenCalledTimes(1);
    });

    it('disposes model after successful check', async () => {
      const { model } = setupMocks();
      await isModelUsable();
      expect(model.dispose).toHaveBeenCalledTimes(1);
    });

    it('disposes llama instance after successful check', async () => {
      const { llama } = setupMocks();
      await isModelUsable();
      expect(llama.dispose).toHaveBeenCalledTimes(1);
    });

    it('disposes llama instance even when model loading fails', async () => {
      const llama = {
        loadModel: vi.fn().mockRejectedValue(new Error('model load failed')),
        dispose: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(getLlama).mockResolvedValue(llama as any);

      const result = await isModelUsable();
      expect(result.usable).toBe(false);
      expect(llama.dispose).toHaveBeenCalledTimes(1);
    });

    it('disposes model and llama when embedding context creation fails', async () => {
      const model = {
        createEmbeddingContext: vi.fn().mockRejectedValue(new Error('context creation failed')),
        dispose: vi.fn().mockResolvedValue(undefined),
      };
      const llama = {
        loadModel: vi.fn().mockResolvedValue(model),
        dispose: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(getLlama).mockResolvedValue(llama as any);

      const result = await isModelUsable();
      expect(result.usable).toBe(false);
      expect(model.dispose).toHaveBeenCalledTimes(1);
      expect(llama.dispose).toHaveBeenCalledTimes(1);
    });
  });
});
