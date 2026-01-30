import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, access, writeFile, mkdir } from 'fs/promises';
import { tmpdir, homedir } from 'os';
import { join } from 'path';
import {
  getModelPath,
  MODEL_FILENAME,
  MODEL_URL,
  ensureModel,
  setModelDir,
  resetModelDir,
} from './download.js';

describe('embedding model download', () => {
  describe('getModelPath', () => {
    it('returns path in ~/.cache/learning-agent/models/', () => {
      const path = getModelPath();
      expect(path).toContain('.cache');
      expect(path).toContain('learning-agent');
      expect(path).toContain('models');
      expect(path).toContain(MODEL_FILENAME);
    });

    it('uses homedir as base', () => {
      const path = getModelPath();
      expect(path.startsWith(homedir())).toBe(true);
    });
  });

  describe('MODEL_URL', () => {
    it('points to nomic-embed-text model', () => {
      expect(MODEL_URL).toContain('nomic-embed-text');
      expect(MODEL_URL).toContain('.gguf');
    });
  });

  describe('ensureModel', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'learning-agent-model-'));
      setModelDir(tempDir);
    });

    afterEach(async () => {
      resetModelDir();
      await rm(tempDir, { recursive: true, force: true });
    });

    it('returns path if model already exists', async () => {
      // Create a fake model file
      const modelPath = join(tempDir, MODEL_FILENAME);
      await mkdir(tempDir, { recursive: true });
      await writeFile(modelPath, 'fake model content');

      const result = await ensureModel();
      expect(result).toBe(modelPath);
    });

    it('creates directory if missing', async () => {
      const newDir = join(tempDir, 'nested', 'dir');
      setModelDir(newDir);

      // Mock fetch to avoid actual download
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-length': '100' }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) })
              .mockResolvedValueOnce({ done: true, value: undefined }),
          }),
        },
      });

      try {
        await ensureModel();
        await access(newDir); // Should not throw
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('throws on network error', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      try {
        await expect(ensureModel()).rejects.toThrow('Network error');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('throws on HTTP error response', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      try {
        await expect(ensureModel()).rejects.toThrow('404');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
