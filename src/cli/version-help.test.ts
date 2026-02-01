/**
 * CLI tests for --version and --help commands.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cleanupCliTestDir, runCli, setupCliTestDir } from './cli-test-utils.js';

describe('CLI', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupCliTestDir();
  });

  afterEach(async () => {
    await cleanupCliTestDir(tempDir);
  });

  describe('--version', () => {
    it('shows version', () => {
      const { combined } = runCli('--version', tempDir);
      expect(combined).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe('--help', () => {
    it('shows help', () => {
      const { combined } = runCli('--help', tempDir);
      expect(combined).toContain('learn');
      expect(combined).toContain('search');
      expect(combined).toContain('list');
    });
  });
});
