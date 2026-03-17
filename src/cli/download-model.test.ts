/**
 * CLI tests for the download-model command.
 */

import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isModelAvailable } from '../memory/embeddings/nomic.js';
import { appendLesson } from '../memory/storage/jsonl.js';
import { closeDb, rebuildIndex } from '../memory/storage/sqlite/index.js';
import { cleanupCliTestDir, createQuickLesson, runCli, setupCliTestDir, shouldSkipEmbeddingTests } from '../test-utils.js';

// SAFETY: Never call isModelUsable() at module top-level — causes ~150MB native memory leak.
const modelAvailable = isModelAvailable();
const skipEmbedding = shouldSkipEmbeddingTests(modelAvailable);

describe('CLI', { tags: ['integration'] }, () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupCliTestDir();
  });

  afterEach(async () => {
    await cleanupCliTestDir(tempDir);
  });

  describe('download-model command', () => {
    it('command is registered and recognized', () => {
      const { combined } = runCli('download-model --help', tempDir);
      expect(combined).toContain('download-model');
      expect(combined).not.toMatch(/unknown command|not found/i);
    });

    it('shows success message when model downloads successfully', () => {
      const { combined } = runCli('download-model', tempDir);
      expect(combined).toMatch(/downloading|model|success/i);
    });

    it('shows model path and size after successful download', () => {
      const { combined } = runCli('download-model', tempDir);
      expect(combined).toMatch(/path/i);
      expect(combined).toMatch(/\.gguf/i);
      expect(combined).toMatch(/\d+\s*MB/i);
    });

    it('is idempotent - skips download if model already exists', () => {
      runCli('download-model', tempDir);
      const { combined } = runCli('download-model', tempDir);

      expect(combined).toMatch(/already\s+(downloaded|exists|available)/i);
      expect(combined).not.toMatch(/downloading/i);
    });

    it('second download completes quickly (no re-download)', () => {
      runCli('download-model', tempDir);

      const start = Date.now();
      runCli('download-model', tempDir);
      const duration = Date.now() - start;

      // Allow margin for CLI startup overhead in parallel test environment
      expect(duration).toBeLessThan(5000);
    });

    it('isModelAvailable returns true after successful download', () => {
      runCli('download-model', tempDir);

      const afterAvailable = isModelAvailable();

      expect(afterAvailable).toBe(true);
    });

    it('outputs valid JSON with --json flag', () => {
      const { stdout } = runCli('download-model --json', tempDir);

      const jsonLine = stdout.split('\n').find((line) => line.trim().startsWith('{'));
      expect(jsonLine).toBeDefined();

      const result = JSON.parse(jsonLine!) as {
        success: boolean;
        path: string;
        size: number;
        alreadyExisted: boolean;
      };

      expect(result.success).toBe(true);
      expect(result.path).toMatch(/\.gguf$/);
      expect(result.size).toBeGreaterThan(0);
      expect(typeof result.alreadyExisted).toBe('boolean');
    });

    it('JSON output shows alreadyExisted field accurately reflects model state', () => {
      const modelExistsBefore = isModelAvailable();

      const { stdout } = runCli('download-model --json', tempDir);

      const jsonLine = stdout.split('\n').find((line) => line.trim().startsWith('{'));
      expect(jsonLine).toBeDefined();

      const result = JSON.parse(jsonLine!) as { alreadyExisted: boolean };
      expect(result.alreadyExisted).toBe(modelExistsBefore);
    });

    it('JSON output shows alreadyExisted: true on subsequent download', () => {
      runCli('download-model', tempDir);

      const { stdout } = runCli('download-model --json', tempDir);

      const jsonLine = stdout.split('\n').find((line) => line.trim().startsWith('{'));
      expect(jsonLine).toBeDefined();

      const result = JSON.parse(jsonLine!) as { alreadyExisted: boolean };
      expect(result.alreadyExisted).toBe(true);
    });

    it('uses absolute path for model location', () => {
      const { stdout } = runCli('download-model --json', tempDir);

      const jsonLine = stdout.split('\n').find((line) => line.trim().startsWith('{'));
      expect(jsonLine).toBeDefined();

      const result = JSON.parse(jsonLine!) as { path: string };

      expect(result.path).toMatch(/^\//);
      expect(result.path).toContain('.node-llama-cpp');
    });

    it('uses consistent model filename', () => {
      const { stdout } = runCli('download-model --json', tempDir);

      const jsonLine = stdout.split('\n').find((line) => line.trim().startsWith('{'));
      expect(jsonLine).toBeDefined();

      const result = JSON.parse(jsonLine!) as { path: string };

      expect(result.path).toContain('hf_ggml-org_embeddinggemma-300M-qat-Q4_0.gguf');
    });

    it('downloaded model file has valid size (approximately 278MB)', () => {
      const { stdout } = runCli('download-model --json', tempDir);

      const jsonLine = stdout.split('\n').find((line) => line.trim().startsWith('{'));
      expect(jsonLine).toBeDefined();

      const result = JSON.parse(jsonLine!) as { size: number };

      const expectedSize = 277852359;
      const tolerance = expectedSize * 0.05;

      expect(result.size).toBeGreaterThan(expectedSize - tolerance);
      expect(result.size).toBeLessThan(expectedSize + tolerance);
    });

    it('command name matches error messages in check-plan', () => {
      const { combined } = runCli('check-plan --plan "test plan"', tempDir);

      if (combined.includes('download-model')) {
        expect(combined).toContain('npx ca download-model');
      }
    });

    it('check-plan works immediately after download-model', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'Test lesson for search'));
      await rebuildIndex(tempDir);
      closeDb();

      runCli('download-model', tempDir);

      const { combined } = runCli('check-plan --plan "test search"', tempDir);
      if (skipEmbedding) {
        expect(combined.toLowerCase()).toMatch(/runtime initialization failed|compatibility|failed to create context/i);
        // download-model should make file available; error should not be "file not found"
        expect(combined.toLowerCase()).not.toMatch(/file not found/);
      } else {
        expect(combined).not.toMatch(/model not available|download.*model/i);
      }
    });
  });
});
