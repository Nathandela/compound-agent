/**
 * Tests for hook pattern detection functions.
 *
 * Tests the UserPromptSubmit and PostToolUseFailure hook logic.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  detectCorrection,
  detectPlanning,
  processToolFailure,
  processToolSuccess,
  processUserPrompt,
  readFailureState,
  resetFailureState,
  STATE_FILE_NAME,
  writeFailureState,
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

    it('detects targeted "stop" corrections', () => {
      expect(detectCorrection('Stop doing that')).toBe(true);
      expect(detectCorrection('stop using that approach')).toBe(true);
      expect(detectCorrection('Stop, that is wrong')).toBe(true);
    });

    it('detects targeted "wait" corrections', () => {
      expect(detectCorrection('Wait, that is wrong')).toBe(true);
      expect(detectCorrection('wait no, use the other one')).toBe(true);
    });

    it('does NOT false-positive on casual "stop" and "wait"', () => {
      expect(detectCorrection('Stop the server')).toBe(false);
      expect(detectCorrection('Wait for the build to finish')).toBe(false);
      expect(detectCorrection('Please stop the process')).toBe(false);
      expect(detectCorrection('Wait until tests pass')).toBe(false);
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
    it('detects decision language (high confidence)', () => {
      expect(detectPlanning('Please decide which approach to use')).toBe(true);
      expect(detectPlanning('Choose the best database')).toBe(true);
      expect(detectPlanning('Which approach should we pick?')).toBe(true);
      expect(detectPlanning('What do you think about this design?')).toBe(true);
    });

    it('detects question patterns (high confidence)', () => {
      expect(detectPlanning('Should we use React or Vue?')).toBe(true);
      expect(detectPlanning('How should I structure this?')).toBe(true);
      expect(detectPlanning("What's the best way to do this?")).toBe(true);
    });

    it('detects "add feature" pattern (high confidence)', () => {
      expect(detectPlanning('Add feature for dark mode')).toBe(true);
    });

    it('detects "set up" pattern (high confidence)', () => {
      expect(detectPlanning('Set up the testing framework')).toBe(true);
    });

    it('requires 2+ low-confidence matches for implementation language', () => {
      // Single low-confidence word alone should NOT match
      expect(detectPlanning('Fix the typo')).toBe(false);
      expect(detectPlanning('Build the project')).toBe(false);
      expect(detectPlanning('Create a file')).toBe(false);
      expect(detectPlanning('Write a test')).toBe(false);

      // Two low-confidence words together SHOULD match
      expect(detectPlanning('Implement and build the user authentication')).toBe(true);
      expect(detectPlanning('Create and refactor this function')).toBe(true);
      expect(detectPlanning('Fix the bug and write tests')).toBe(true);
    });

    it('returns false for non-planning prompts', () => {
      expect(detectPlanning('Thank you for the help')).toBe(false);
      expect(detectPlanning('That looks good')).toBe(false);
      expect(detectPlanning('Can you explain that code?')).toBe(false);
    });

    it('is case insensitive', () => {
      expect(detectPlanning('SHOULD WE use this?')).toBe(true);
      expect(detectPlanning('IMPLEMENT and BUILD the API')).toBe(true);
    });
  });

  describe('processUserPrompt', () => {
    it('returns correction reminder for correction patterns', () => {
      const result = processUserPrompt('Actually, that is wrong');

      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput?.hookEventName).toBe('UserPromptSubmit');
      expect(result.hookSpecificOutput?.additionalContext).toContain('npx ca learn');
      expect(result.hookSpecificOutput?.additionalContext).toContain('npx ca search');
    });

    it('returns planning reminder for high-confidence planning patterns', () => {
      const result = processUserPrompt('Should we use React or Vue?');

      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput?.hookEventName).toBe('UserPromptSubmit');
      expect(result.hookSpecificOutput?.additionalContext).toContain('npx ca search');
      expect(result.hookSpecificOutput?.additionalContext).toContain('uncertain');
    });

    it('prioritizes correction over planning', () => {
      const result = processUserPrompt('Actually, implement it differently');
      expect(result.hookSpecificOutput?.additionalContext).toContain('npx ca learn');
    });

    it('returns empty object for normal prompts', () => {
      const result = processUserPrompt('Thank you for the help');
      expect(result.hookSpecificOutput).toBeUndefined();
    });

    it('returns empty object for single low-confidence planning words', () => {
      const result = processUserPrompt('Fix the typo');
      expect(result.hookSpecificOutput).toBeUndefined();
    });
  });
});

describe('Failure Tracking Functions', () => {
  afterEach(() => {
    resetFailureState();
  });

  describe('processToolFailure', () => {
    it('returns empty object on first failure', () => {
      const result = processToolFailure('Bash', { command: 'npm test' });
      expect(result.hookSpecificOutput).toBeUndefined();
    });

    it('returns empty object on second different failure', () => {
      processToolFailure('Bash', { command: 'npm test' });
      const result = processToolFailure('Edit', { file_path: '/path/to/file.ts' });
      expect(result.hookSpecificOutput).toBeUndefined();
    });

    it('returns tip after 3 total failures', () => {
      processToolFailure('Bash', { command: 'npm test' });
      processToolFailure('Edit', { file_path: '/path/to/file.ts' });
      const result = processToolFailure('Write', { file_path: '/other/file.ts' });
      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput?.hookEventName).toBe('PostToolUseFailure');
      expect(result.hookSpecificOutput?.additionalContext).toContain('npx ca search');
    });

    it('returns tip after 2 failures on same file', () => {
      processToolFailure('Edit', { file_path: '/path/to/same.ts' });
      const result = processToolFailure('Edit', { file_path: '/path/to/same.ts' });
      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput?.additionalContext).toContain('Multiple failures');
    });

    it('returns tip after 2 failures with same command', () => {
      processToolFailure('Bash', { command: 'npm test' });
      const result = processToolFailure('Bash', { command: 'npm test --coverage' });
      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput?.additionalContext).toContain('npx ca search');
    });

    it('clears state after showing tip', () => {
      processToolFailure('Bash', { command: 'npm test' });
      processToolFailure('Bash', { command: 'npm test' });
      const result1 = processToolFailure('Bash', { command: 'other' });
      expect(result1.hookSpecificOutput).toBeUndefined();
    });

    it('does NOT create temp files', () => {
      const before = readdirSync(tmpdir()).filter((f) => f.startsWith('ca-failures'));
      processToolFailure('Bash', { command: 'npm test' });
      processToolFailure('Bash', { command: 'npm test' });
      const after = readdirSync(tmpdir()).filter((f) => f.startsWith('ca-failures'));
      expect(after.length).toBe(before.length);
    });
  });

  describe('processToolSuccess', () => {
    it('clears failure state on success', () => {
      processToolFailure('Bash', { command: 'npm test' });
      processToolFailure('Bash', { command: 'npm test' });
      processToolSuccess();
      const result1 = processToolFailure('Bash', { command: 'npm test' });
      const result2 = processToolFailure('Edit', { file_path: '/file.ts' });
      expect(result1.hookSpecificOutput).toBeUndefined();
      expect(result2.hookSpecificOutput).toBeUndefined();
    });

    it('handles being called with no prior state', () => {
      expect(() => processToolSuccess()).not.toThrow();
    });
  });
});

describe('Cross-Process Failure State Persistence', () => {
  let stateDir: string;

  function freshStateDir(): string {
    const dir = join(tmpdir(), `ca-test-state-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  afterEach(() => {
    resetFailureState(stateDir);
  });

  describe('readFailureState / writeFailureState', () => {
    it('writes state to file and reads it back', () => {
      stateDir = freshStateDir();
      const state = { count: 2, lastTarget: 'npm', sameTargetCount: 1, timestamp: Date.now() };
      writeFailureState(stateDir, state);

      const filePath = join(stateDir, STATE_FILE_NAME);
      expect(existsSync(filePath)).toBe(true);

      const read = readFailureState(stateDir);
      expect(read.count).toBe(2);
      expect(read.lastTarget).toBe('npm');
      expect(read.sameTargetCount).toBe(1);
    });

    it('returns defaults when no state file exists', () => {
      stateDir = freshStateDir();
      const read = readFailureState(stateDir);
      expect(read.count).toBe(0);
      expect(read.lastTarget).toBeNull();
      expect(read.sameTargetCount).toBe(0);
    });

    it('returns defaults when state file is corrupted', () => {
      stateDir = freshStateDir();
      const filePath = join(stateDir, STATE_FILE_NAME);
      writeFileSync(filePath, 'not valid json{{{', 'utf-8');

      const read = readFailureState(stateDir);
      expect(read.count).toBe(0);
      expect(read.lastTarget).toBeNull();
      expect(read.sameTargetCount).toBe(0);
    });

    it('returns defaults when state file is stale (>1h old)', () => {
      stateDir = freshStateDir();
      const staleTimestamp = Date.now() - 61 * 60 * 1000; // 61 minutes ago
      const state = { count: 5, lastTarget: 'npm', sameTargetCount: 3, timestamp: staleTimestamp };
      writeFailureState(stateDir, state);

      const read = readFailureState(stateDir);
      expect(read.count).toBe(0);
      expect(read.lastTarget).toBeNull();
      expect(read.sameTargetCount).toBe(0);
    });
  });

  describe('processToolFailure with persistence', () => {
    it('accumulates failures across simulated process boundaries', () => {
      stateDir = freshStateDir();

      // "Process 1": first failure
      const r1 = processToolFailure('Bash', { command: 'npm test' }, stateDir);
      expect(r1.hookSpecificOutput).toBeUndefined();

      // Reset in-memory state to simulate new process
      resetFailureState();

      // "Process 2": second failure on same target - should trigger tip
      const r2 = processToolFailure('Bash', { command: 'npm test' }, stateDir);
      expect(r2.hookSpecificOutput).toBeDefined();
      expect(r2.hookSpecificOutput?.additionalContext).toContain('Multiple failures');
    });

    it('triggers total threshold across simulated processes', () => {
      stateDir = freshStateDir();

      // "Process 1": first failure
      processToolFailure('Bash', { command: 'npm test' }, stateDir);
      resetFailureState(); // simulate new process

      // "Process 2": second failure (different target)
      processToolFailure('Edit', { file_path: '/file.ts' }, stateDir);
      resetFailureState(); // simulate new process

      // "Process 3": third failure (different target) - should trigger total threshold
      const r3 = processToolFailure('Write', { file_path: '/other.ts' }, stateDir);
      expect(r3.hookSpecificOutput).toBeDefined();
      expect(r3.hookSpecificOutput?.additionalContext).toContain('npx ca search');
    });
  });

  describe('processToolSuccess with persistence', () => {
    it('deletes state file on success', () => {
      stateDir = freshStateDir();
      processToolFailure('Bash', { command: 'npm test' }, stateDir);

      const filePath = join(stateDir, STATE_FILE_NAME);
      expect(existsSync(filePath)).toBe(true);

      processToolSuccess(stateDir);
      expect(existsSync(filePath)).toBe(false);
    });

    it('handles missing state file gracefully', () => {
      stateDir = freshStateDir();
      expect(() => processToolSuccess(stateDir)).not.toThrow();
    });
  });

  describe('resetFailureState with persistence', () => {
    it('deletes state file when stateDir provided', () => {
      stateDir = freshStateDir();
      processToolFailure('Bash', { command: 'npm test' }, stateDir);

      const filePath = join(stateDir, STATE_FILE_NAME);
      expect(existsSync(filePath)).toBe(true);

      resetFailureState(stateDir);
      expect(existsSync(filePath)).toBe(false);
    });
  });
});
