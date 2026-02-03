/**
 * Tests for remind-capture command.
 *
 * TDD: Tests written BEFORE implementation.
 * Following invariants from doc/verification/remind-capture-invariants.md
 *
 * Note: Tests use exported functions directly to avoid process.chdir()
 * which is not supported in Vitest workers. CLI integration tests
 * require cli.ts changes (Integration phase).
 */

import { execSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getRemindCaptureOutput, hasStagedChanges } from './remind-capture.js';

describe('remind-capture command', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `lna-remind-capture-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // Helper to initialize a git repo with staged changes
  async function setupGitRepoWithStagedChanges(): Promise<void> {
    execSync('git init', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: tempDir, stdio: 'pipe' });
    // Create and stage a file
    execSync('echo "test content" > test.txt', { cwd: tempDir, stdio: 'pipe', shell: '/bin/sh' });
    execSync('git add test.txt', { cwd: tempDir, stdio: 'pipe' });
  }

  // Helper to initialize empty git repo (no staged changes)
  async function setupEmptyGitRepo(): Promise<void> {
    execSync('git init', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: tempDir, stdio: 'pipe' });
  }

  // ============================================================================
  // hasStagedChanges function
  // ============================================================================

  describe('hasStagedChanges', () => {
    it('returns true when staged changes present', async () => {
      await setupGitRepoWithStagedChanges();
      expect(hasStagedChanges(tempDir)).toBe(true);
    });

    it('returns false when no staged changes', async () => {
      await setupEmptyGitRepo();
      expect(hasStagedChanges(tempDir)).toBe(false);
    });

    it('returns false when not a git repo', () => {
      // tempDir is not a git repo
      expect(hasStagedChanges(tempDir)).toBe(false);
    });

    it('returns false when cwd does not exist', () => {
      expect(hasStagedChanges('/nonexistent/path')).toBe(false);
    });
  });

  // ============================================================================
  // Safety Property S1: Never Block Commits (always returns without error)
  // ============================================================================

  describe('Safety: Never block commits', () => {
    it('returns without error when staged changes present', async () => {
      await setupGitRepoWithStagedChanges();
      expect(() => getRemindCaptureOutput(tempDir)).not.toThrow();
    });

    it('returns without error when no staged changes', async () => {
      await setupEmptyGitRepo();
      expect(() => getRemindCaptureOutput(tempDir)).not.toThrow();
    });

    it('returns without error when not a git repo', () => {
      // tempDir is not a git repo
      expect(() => getRemindCaptureOutput(tempDir)).not.toThrow();
    });
  });

  // ============================================================================
  // Safety Property S2: Silent exit when no staged changes
  // ============================================================================

  describe('Safety: Silent when no staged changes', () => {
    it('produces no output when no staged changes', async () => {
      await setupEmptyGitRepo();
      const output = getRemindCaptureOutput(tempDir);
      expect(output).toBe('');
    });

    it('produces no output when not a git repo', () => {
      const output = getRemindCaptureOutput(tempDir);
      expect(output).toBe('');
    });
  });

  // ============================================================================
  // Safety Property S3: Output bounded (< 800 characters)
  // ============================================================================

  describe('Safety: Bounded output', () => {
    it('outputs less than 800 characters when staged changes present', async () => {
      await setupGitRepoWithStagedChanges();
      const output = getRemindCaptureOutput(tempDir);
      expect(output.length).toBeLessThan(800);
    });
  });

  // ============================================================================
  // Liveness Property L1: Output reminder when staged changes present
  // ============================================================================

  describe('Liveness: Show reminder with staged changes', () => {
    it('outputs reminder template when staged changes present', async () => {
      await setupGitRepoWithStagedChanges();
      const output = getRemindCaptureOutput(tempDir);
      expect(output).toContain('Lesson Capture Reminder');
    });

    it('includes lna learn command suggestion', async () => {
      await setupGitRepoWithStagedChanges();
      const output = getRemindCaptureOutput(tempDir);
      expect(output).toContain('lna learn');
    });

    it('includes lesson_capture tool mention', async () => {
      await setupGitRepoWithStagedChanges();
      const output = getRemindCaptureOutput(tempDir);
      expect(output).toContain('lesson_capture');
    });

    it('includes helpful questions about learning', async () => {
      await setupGitRepoWithStagedChanges();
      const output = getRemindCaptureOutput(tempDir);
      expect(output).toContain('Did you learn anything');
    });
  });

  // ============================================================================
  // Liveness Property L2: Command completes quickly
  // ============================================================================

  describe('Liveness: Performance', () => {
    it('completes within 2000ms', async () => {
      await setupGitRepoWithStagedChanges();
      const start = Date.now();
      getRemindCaptureOutput(tempDir);
      const duration = Date.now() - start;
      // Allow generous margin for git operations
      expect(duration).toBeLessThan(2000);
    });

    it('completes quickly with no git repo', () => {
      const start = Date.now();
      getRemindCaptureOutput(tempDir);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(2000);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge cases', () => {
    it('handles multiple staged files', async () => {
      await setupEmptyGitRepo();
      // Create and stage multiple files
      execSync('echo "file1" > file1.txt', { cwd: tempDir, stdio: 'pipe', shell: '/bin/sh' });
      execSync('echo "file2" > file2.txt', { cwd: tempDir, stdio: 'pipe', shell: '/bin/sh' });
      execSync('echo "file3" > file3.txt', { cwd: tempDir, stdio: 'pipe', shell: '/bin/sh' });
      execSync('git add file1.txt file2.txt file3.txt', { cwd: tempDir, stdio: 'pipe' });

      const output = getRemindCaptureOutput(tempDir);
      expect(output).toContain('Lesson Capture Reminder');
    });

    it('handles staged changes after initial commit', async () => {
      await setupGitRepoWithStagedChanges();
      // Make initial commit
      execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
      // Stage new changes
      execSync('echo "new content" >> test.txt', { cwd: tempDir, stdio: 'pipe', shell: '/bin/sh' });
      execSync('git add test.txt', { cwd: tempDir, stdio: 'pipe' });

      const output = getRemindCaptureOutput(tempDir);
      expect(output).toContain('Lesson Capture Reminder');
    });

    it('handles working directory with spaces in path', async () => {
      // Create a directory with spaces
      const spacedDir = join(tmpdir(), `lna test dir ${Date.now()}`);
      await mkdir(spacedDir, { recursive: true });

      try {
        execSync('git init', { cwd: spacedDir, stdio: 'pipe' });
        execSync('git config user.email "test@test.com"', { cwd: spacedDir, stdio: 'pipe' });
        execSync('git config user.name "Test User"', { cwd: spacedDir, stdio: 'pipe' });
        execSync('echo "test" > test.txt', { cwd: spacedDir, stdio: 'pipe', shell: '/bin/sh' });
        execSync('git add test.txt', { cwd: spacedDir, stdio: 'pipe' });

        const output = getRemindCaptureOutput(spacedDir);
        expect(output).toContain('Lesson Capture Reminder');
      } finally {
        await rm(spacedDir, { recursive: true, force: true });
      }
    });

    it('returns empty when staged files are unstaged', async () => {
      await setupGitRepoWithStagedChanges();
      // Unstage the file
      execSync('git reset test.txt', { cwd: tempDir, stdio: 'pipe' });

      const output = getRemindCaptureOutput(tempDir);
      expect(output).toBe('');
    });
  });
});
