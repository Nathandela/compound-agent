/**
 * CLI tests for the hooks run command.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cleanupCliTestDir, runCli, setupCliTestDir } from '../test-utils.js';

describe('CLI', { tags: ['integration'] }, () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupCliTestDir();
  });

  afterEach(async () => {
    await cleanupCliTestDir(tempDir);
  });

  describe('hooks run command', () => {
    it('outputs lesson reminder prompt for pre-commit hook', () => {
      const { combined } = runCli('hooks run pre-commit', tempDir);
      // Check for key elements of the lesson capture prompt
      expect(combined).toContain('LESSON CAPTURE CHECKPOINT');
      expect(combined).toContain('npx lna learn');
    });

    it('exits with code 0 (non-blocking)', () => {
      const { combined } = runCli('hooks run pre-commit', tempDir);
      expect(combined).not.toMatch(/error|fail/i);
    });

    it('outputs JSON with --json flag', () => {
      const { stdout } = runCli('hooks run pre-commit --json', tempDir);
      const result = JSON.parse(stdout) as { hook: string; message: string };
      expect(result.hook).toBe('pre-commit');
      expect(result.message).toBeDefined();
    });

    it('shows error for unknown hook', () => {
      const { combined } = runCli('hooks run unknown-hook', tempDir);
      expect(combined.toLowerCase()).toMatch(/unknown|not found|invalid/i);
    });
  });
});
