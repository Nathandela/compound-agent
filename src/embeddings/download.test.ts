import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, access, writeFile, mkdir, readFile } from 'fs/promises';
import { tmpdir, homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';
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

  describe('streaming download', () => {
    let tempDir: string;
    let modelPath: string;
    let tmpPath: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'learning-agent-stream-'));
      setModelDir(tempDir);
      modelPath = join(tempDir, MODEL_FILENAME);
      tmpPath = modelPath + '.tmp';
    });

    afterEach(async () => {
      resetModelDir();
      await rm(tempDir, { recursive: true, force: true });
    });

    it('writes to .tmp file during download and renames on completion', async () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      const originalFetch = global.fetch;

      // Track what files exist during and after download
      let tmpExistedDuringDownload = false;
      let finalExistedDuringDownload = false;
      let tmpContentDuringDownload: Buffer | null = null;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-length': String(testData.length) }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockImplementationOnce(async () => {
                return { done: false, value: testData };
              })
              .mockImplementationOnce(async () => {
                // Check files after first chunk is written
                // Allow brief delay for async write to complete
                await new Promise((r) => setTimeout(r, 10));
                tmpExistedDuringDownload = existsSync(tmpPath);
                finalExistedDuringDownload = existsSync(modelPath);
                if (tmpExistedDuringDownload) {
                  tmpContentDuringDownload = await readFile(tmpPath);
                }
                return { done: true, value: undefined };
              }),
          }),
        },
      });

      try {
        await ensureModel();

        // CRITICAL: .tmp file MUST exist during download (streaming invariant)
        expect(tmpExistedDuringDownload).toBe(true);
        // Final file should NOT exist until download completes
        expect(finalExistedDuringDownload).toBe(false);
        // .tmp file should have had the data written to it
        expect(tmpContentDuringDownload).not.toBeNull();
        expect(Array.from(tmpContentDuringDownload!)).toEqual(Array.from(testData));

        // After completion: final file exists, .tmp does not
        expect(existsSync(modelPath)).toBe(true);
        expect(existsSync(tmpPath)).toBe(false);

        // Verify data integrity
        const written = await readFile(modelPath);
        expect(Array.from(written)).toEqual(Array.from(testData));
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('deletes .tmp file on download failure (stream error)', async () => {
      const originalFetch = global.fetch;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-length': '1000' }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) })
              .mockRejectedValueOnce(new Error('Stream interrupted')),
          }),
        },
      });

      try {
        await expect(ensureModel()).rejects.toThrow('Stream interrupted');

        // After failure: no .tmp file, no final file
        expect(existsSync(tmpPath)).toBe(false);
        expect(existsSync(modelPath)).toBe(false);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('does not create .tmp file on HTTP error (4xx/5xx)', async () => {
      const originalFetch = global.fetch;

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      try {
        await expect(ensureModel()).rejects.toThrow('500');

        // No files should exist
        expect(existsSync(tmpPath)).toBe(false);
        expect(existsSync(modelPath)).toBe(false);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('preserves data integrity across multiple chunks', async () => {
      const chunk1 = new Uint8Array([10, 20, 30]);
      const chunk2 = new Uint8Array([40, 50]);
      const chunk3 = new Uint8Array([60, 70, 80, 90]);
      const expectedData = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90]);

      const originalFetch = global.fetch;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-length': String(expectedData.length) }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({ done: false, value: chunk1 })
              .mockResolvedValueOnce({ done: false, value: chunk2 })
              .mockResolvedValueOnce({ done: false, value: chunk3 })
              .mockResolvedValueOnce({ done: true, value: undefined }),
          }),
        },
      });

      try {
        await ensureModel();

        const written = await readFile(modelPath);
        expect(Array.from(written)).toEqual(Array.from(expectedData));
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
