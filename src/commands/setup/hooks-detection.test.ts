/**
 * Tests for hook pattern detection functions.
 *
 * Tests the UserPromptSubmit and PostToolUseFailure hook logic.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  detectCorrection,
  detectPlanning,
  processToolFailure,
  processToolSuccess,
  processUserPrompt,
} from './hooks.js';

describe('Hook Detection Functions', () => {
  describe('detectCorrection', () => {
    it('detects "actually" as correction', () => {
      expect(detectCorrection('Actually, that is wrong')).toBe(true);
      expect(detectCorrection('actually use the other method')).toBe(true);
    });

    it('detects "no," as correction', () => {
      expect(detectCorrection('No, use Polars instead')).toBe(true);
      expect(detectCorrection('no. that is incorrect')).toBe(true);
    });

    it('detects "wrong" as correction', () => {
      expect(detectCorrection('That approach is wrong')).toBe(true);
      expect(detectCorrection('wrong! try again')).toBe(true);
    });

    it('detects "that\'s not right" as correction', () => {
      expect(detectCorrection("That's not right, use X")).toBe(true);
      expect(detectCorrection('thats not right')).toBe(true);
    });

    it('detects "use X instead" as correction', () => {
      expect(detectCorrection('use Polars instead')).toBe(true);
      expect(detectCorrection('Use the other API instead')).toBe(true);
    });

    it('detects "I told you" as correction', () => {
      expect(detectCorrection('I told you to use TypeScript')).toBe(true);
    });

    it('detects "you forgot" as correction', () => {
      expect(detectCorrection('You forgot to add the import')).toBe(true);
    });

    it('detects "stop" and "wait" as corrections', () => {
      expect(detectCorrection('Stop! That will break things')).toBe(true);
      expect(detectCorrection('Wait, let me explain')).toBe(true);
    });

    it('returns false for normal prompts', () => {
      expect(detectCorrection('Please implement the login feature')).toBe(false);
      expect(detectCorrection('What is the best approach here?')).toBe(false);
      expect(detectCorrection('Can you help me with this?')).toBe(false);
    });

    it('is case insensitive', () => {
      expect(detectCorrection('ACTUALLY, use the other one')).toBe(true);
      expect(detectCorrection('Wrong approach')).toBe(true);
    });
  });

  describe('detectPlanning', () => {
    it('detects decision language', () => {
      expect(detectPlanning('Please decide which approach to use')).toBe(true);
      expect(detectPlanning('Choose the best database')).toBe(true);
      expect(detectPlanning('Which approach should we pick?')).toBe(true);
      expect(detectPlanning('What do you think about this design?')).toBe(true);
    });

    it('detects question patterns', () => {
      expect(detectPlanning('Should we use React or Vue?')).toBe(true);
      expect(detectPlanning('How should I structure this?')).toBe(true);
      expect(detectPlanning("What's the best way to do this?")).toBe(true);
    });

    it('detects implementation language', () => {
      expect(detectPlanning('Implement the user authentication')).toBe(true);
      expect(detectPlanning('Build the API endpoint')).toBe(true);
      expect(detectPlanning('Create a new component')).toBe(true);
      expect(detectPlanning('Refactor this function')).toBe(true);
      expect(detectPlanning('Fix the bug in login')).toBe(true);
    });

    it('detects "add feature" pattern', () => {
      expect(detectPlanning('Add feature for dark mode')).toBe(true);
    });

    it('detects "set up" pattern', () => {
      expect(detectPlanning('Set up the testing framework')).toBe(true);
    });

    it('returns false for non-planning prompts', () => {
      expect(detectPlanning('Thank you for the help')).toBe(false);
      expect(detectPlanning('That looks good')).toBe(false);
      expect(detectPlanning('Can you explain that code?')).toBe(false);
    });

    it('is case insensitive', () => {
      expect(detectPlanning('IMPLEMENT the feature')).toBe(true);
      expect(detectPlanning('Build THE API')).toBe(true);
    });
  });

  describe('processUserPrompt', () => {
    it('returns correction reminder for correction patterns', () => {
      const result = processUserPrompt('Actually, that is wrong');

      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput?.hookEventName).toBe('UserPromptSubmit');
      expect(result.hookSpecificOutput?.additionalContext).toContain('lesson_capture');
      expect(result.hookSpecificOutput?.additionalContext).toContain('lesson_search');
    });

    it('returns planning reminder for planning patterns', () => {
      const result = processUserPrompt('Please implement the login feature');

      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput?.hookEventName).toBe('UserPromptSubmit');
      expect(result.hookSpecificOutput?.additionalContext).toContain('lesson_search');
      expect(result.hookSpecificOutput?.additionalContext).toContain('uncertain');
    });

    it('prioritizes correction over planning', () => {
      // This prompt has both correction ("actually") and planning ("implement")
      const result = processUserPrompt('Actually, implement it differently');

      expect(result.hookSpecificOutput?.additionalContext).toContain('lesson_capture');
    });

    it('returns empty object for normal prompts', () => {
      const result = processUserPrompt('Thank you for the help');

      expect(result.hookSpecificOutput).toBeUndefined();
    });
  });
});

describe('Failure Tracking Functions', () => {
  let testSessionId: string;
  let tempDir: string;

  beforeEach(async () => {
    testSessionId = `test-session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    tempDir = join(tmpdir(), `lna-test-${testSessionId}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up state files
    await processToolSuccess(testSessionId);
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('processToolFailure', () => {
    it('returns empty object on first failure', async () => {
      const result = await processToolFailure('Bash', { command: 'npm test' }, testSessionId);

      expect(result.hookSpecificOutput).toBeUndefined();
    });

    it('returns empty object on second different failure', async () => {
      await processToolFailure('Bash', { command: 'npm test' }, testSessionId);
      const result = await processToolFailure('Edit', { file_path: '/path/to/file.ts' }, testSessionId);

      expect(result.hookSpecificOutput).toBeUndefined();
    });

    it('returns tip after 3 total failures', async () => {
      await processToolFailure('Bash', { command: 'npm test' }, testSessionId);
      await processToolFailure('Edit', { file_path: '/path/to/file.ts' }, testSessionId);
      const result = await processToolFailure('Write', { file_path: '/other/file.ts' }, testSessionId);

      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput?.hookEventName).toBe('PostToolUseFailure');
      expect(result.hookSpecificOutput?.additionalContext).toContain('lesson_search');
    });

    it('returns tip after 2 failures on same file', async () => {
      await processToolFailure('Edit', { file_path: '/path/to/same.ts' }, testSessionId);
      const result = await processToolFailure('Edit', { file_path: '/path/to/same.ts' }, testSessionId);

      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput?.additionalContext).toContain('Multiple failures');
    });

    it('returns tip after 2 failures with same command', async () => {
      await processToolFailure('Bash', { command: 'npm test' }, testSessionId);
      const result = await processToolFailure('Bash', { command: 'npm test --coverage' }, testSessionId);

      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput?.additionalContext).toContain('lesson_search');
    });

    it('clears state after showing tip', async () => {
      // Trigger tip
      await processToolFailure('Bash', { command: 'npm test' }, testSessionId);
      await processToolFailure('Bash', { command: 'npm test' }, testSessionId);

      // Next failures should start fresh
      const result1 = await processToolFailure('Bash', { command: 'other' }, testSessionId);
      expect(result1.hookSpecificOutput).toBeUndefined();
    });
  });

  describe('processToolSuccess', () => {
    it('clears failure state on success', async () => {
      // Add some failures
      await processToolFailure('Bash', { command: 'npm test' }, testSessionId);
      await processToolFailure('Bash', { command: 'npm test' }, testSessionId);

      // Process success - should clear state
      await processToolSuccess(testSessionId);

      // Next failures should start fresh (need 3 again for tip)
      const result1 = await processToolFailure('Bash', { command: 'npm test' }, testSessionId);
      const result2 = await processToolFailure('Edit', { file_path: '/file.ts' }, testSessionId);

      expect(result1.hookSpecificOutput).toBeUndefined();
      expect(result2.hookSpecificOutput).toBeUndefined();
    });

    it('handles missing state file gracefully', async () => {
      // Should not throw even with no state file
      await expect(processToolSuccess('nonexistent-session')).resolves.not.toThrow();
    });
  });
});
