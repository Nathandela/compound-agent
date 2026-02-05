/**
 * Integration tests for trigger detection orchestration
 *
 * Tests the full flow: detection -> quality filter -> lesson proposal
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { detectAndPropose, parseInputFile } from './integration.js';
import type { DetectionInput, DetectionResult } from './integration.js';

describe('trigger detection integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'learning-agent-test-'));
    // Create .claude/lessons directory
    await fs.mkdir(path.join(tempDir, '.claude', 'lessons'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('detectAndPropose', () => {
    it('returns null when no trigger detected', async () => {
      const input: DetectionInput = {
        type: 'user',
        data: {
          messages: ['hello', 'hi there'],
          context: { tool: 'chat', intent: 'greeting' },
        },
      };

      const result = await detectAndPropose(tempDir, input);
      expect(result).toBeNull();
    });

    it('detects user correction and returns proposal', async () => {
      const input: DetectionInput = {
        type: 'user',
        data: {
          messages: [
            'edit the config file',
            'No, wrong file - use dev.config.ts instead of prod.config.ts when developing locally',
          ],
          context: { tool: 'edit', intent: 'config update' },
        },
      };

      const result = await detectAndPropose(tempDir, input);
      expect(result).not.toBeNull();
      expect(result?.trigger).toContain('correction');
      expect(result?.source).toBe('user_correction');
    });

    it('detects self correction and returns proposal', async () => {
      const input: DetectionInput = {
        type: 'self',
        data: {
          edits: [
            { file: 'src/app.ts', success: true, timestamp: Date.now() - 3000 },
            { file: 'src/app.ts', success: false, timestamp: Date.now() - 2000 },
            { file: 'src/app.ts', success: true, timestamp: Date.now() - 1000 },
          ],
        },
      };

      const result = await detectAndPropose(tempDir, input);
      expect(result).not.toBeNull();
      expect(result?.trigger).toContain('Self-correction');
      expect(result?.source).toBe('self_correction');
    });

    it('returns null when self correction pattern not found', async () => {
      // Only 2 edits - not enough for edit->fail->re-edit pattern
      const input: DetectionInput = {
        type: 'self',
        data: {
          edits: [
            { file: 'src/app.ts', success: true, timestamp: Date.now() - 2000 },
            { file: 'src/app.ts', success: true, timestamp: Date.now() - 1000 },
          ],
        },
      };

      const result = await detectAndPropose(tempDir, input);
      expect(result).toBeNull();
    });

    it('detects test failure and returns proposal', async () => {
      const input: DetectionInput = {
        type: 'test',
        data: {
          passed: false,
          output: 'FAIL: AssertionError - use toEqual instead of toBe for object comparison',
          testFile: 'src/app.test.ts',
        },
      };

      const result = await detectAndPropose(tempDir, input);
      expect(result).not.toBeNull();
      expect(result?.trigger).toContain('Test failure');
      expect(result?.source).toBe('test_failure');
    });

    it('returns null for test that passes', async () => {
      const input: DetectionInput = {
        type: 'test',
        data: {
          passed: true,
          output: 'All tests passed',
          testFile: 'src/app.test.ts',
        },
      };

      const result = await detectAndPropose(tempDir, input);
      expect(result).toBeNull();
    });

    it('filters out non-actionable insights', async () => {
      const input: DetectionInput = {
        type: 'user',
        data: {
          messages: [
            'do something',
            'No, be careful', // Vague correction - should be filtered
          ],
          context: { tool: 'edit', intent: 'task' },
        },
      };

      const result = await detectAndPropose(tempDir, input);
      // Detection found, but insight is vague so should not propose
      expect(result).toBeNull();
    });

    it('includes proposed insight text for user corrections', async () => {
      const input: DetectionInput = {
        type: 'user',
        data: {
          messages: [
            'run the tests',
            'Actually, use pnpm test instead of npm test in this project',
          ],
          context: { tool: 'bash', intent: 'testing' },
        },
      };

      const result = await detectAndPropose(tempDir, input);
      expect(result).not.toBeNull();
      expect(result?.proposedInsight).toBeDefined();
      expect(result?.proposedInsight?.length).toBeGreaterThan(0);
    });
  });

  describe('parseInputFile', () => {
    it('parses JSON input file for user correction', async () => {
      const inputPath = path.join(tempDir, 'input.json');
      const inputData = {
        type: 'user',
        data: {
          messages: ['hello', 'No, wrong'],
          context: { tool: 'chat', intent: 'test' },
        },
      };
      await fs.writeFile(inputPath, JSON.stringify(inputData));

      const result = await parseInputFile(inputPath);
      expect(result.type).toBe('user');
      if (result.type === 'user') {
        expect(result.data.messages).toEqual(['hello', 'No, wrong']);
      }
    });

    it('parses JSON input file for self correction', async () => {
      const inputPath = path.join(tempDir, 'input.json');
      const inputData = {
        type: 'self',
        data: {
          edits: [
            { file: 'test.ts', success: true, timestamp: 1000 },
          ],
        },
      };
      await fs.writeFile(inputPath, JSON.stringify(inputData));

      const result = await parseInputFile(inputPath);
      expect(result.type).toBe('self');
      if (result.type === 'self') {
        expect(result.data.edits).toHaveLength(1);
      }
    });

    it('parses JSON input file for test failure', async () => {
      const inputPath = path.join(tempDir, 'input.json');
      const inputData = {
        type: 'test',
        data: {
          passed: false,
          output: 'Test failed',
          testFile: 'test.ts',
        },
      };
      await fs.writeFile(inputPath, JSON.stringify(inputData));

      const result = await parseInputFile(inputPath);
      expect(result.type).toBe('test');
      if (result.type === 'test') {
        expect(result.data.passed).toBe(false);
      }
    });

    it('throws error for invalid JSON', async () => {
      const inputPath = path.join(tempDir, 'input.json');
      await fs.writeFile(inputPath, 'not json');

      await expect(parseInputFile(inputPath)).rejects.toThrow();
    });

    it('throws error for missing file', async () => {
      const inputPath = path.join(tempDir, 'nonexistent.json');

      await expect(parseInputFile(inputPath)).rejects.toThrow();
    });

    it('throws error for invalid type', async () => {
      const inputPath = path.join(tempDir, 'input.json');
      const inputData = {
        type: 'invalid',
        data: {},
      };
      await fs.writeFile(inputPath, JSON.stringify(inputData));

      await expect(parseInputFile(inputPath)).rejects.toThrow();
    });

    it('throws for user type with wrong data shape', async () => {
      const inputPath = path.join(tempDir, 'input.json');
      const inputData = {
        type: 'user',
        data: { wrong: 'fields' },
      };
      await fs.writeFile(inputPath, JSON.stringify(inputData));

      await expect(parseInputFile(inputPath)).rejects.toThrow();
    });

    it('throws for self type with wrong data shape', async () => {
      const inputPath = path.join(tempDir, 'input.json');
      const inputData = {
        type: 'self',
        data: { messages: ['hello'] },
      };
      await fs.writeFile(inputPath, JSON.stringify(inputData));

      await expect(parseInputFile(inputPath)).rejects.toThrow();
    });

    it('throws for test type with wrong data shape', async () => {
      const inputPath = path.join(tempDir, 'input.json');
      const inputData = {
        type: 'test',
        data: { edits: [] },
      };
      await fs.writeFile(inputPath, JSON.stringify(inputData));

      await expect(parseInputFile(inputPath)).rejects.toThrow();
    });

    it('throws when data field is missing', async () => {
      const inputPath = path.join(tempDir, 'input.json');
      const inputData = { type: 'user' };
      await fs.writeFile(inputPath, JSON.stringify(inputData));

      await expect(parseInputFile(inputPath)).rejects.toThrow();
    });

    it('strips extra fields from valid input', async () => {
      const inputPath = path.join(tempDir, 'input.json');
      const inputData = {
        type: 'test',
        data: {
          passed: false,
          output: 'Test failed',
          testFile: 'test.ts',
        },
        extraTopLevel: 'should be stripped',
      };
      await fs.writeFile(inputPath, JSON.stringify(inputData));

      const result = await parseInputFile(inputPath);
      expect(result.type).toBe('test');
      expect((result as Record<string, unknown>)['extraTopLevel']).toBeUndefined();
    });
  });
});

describe('DetectionResult type', () => {
  it('has required fields', () => {
    const result: DetectionResult = {
      trigger: 'Test trigger',
      source: 'user_correction',
      proposedInsight: 'Use X instead of Y',
    };

    expect(result.trigger).toBeDefined();
    expect(result.source).toBeDefined();
    expect(result.proposedInsight).toBeDefined();
  });
});
