/**
 * Unit tests for the minimal hook-runner entrypoint.
 *
 * TDD GATE: Tests written FIRST before implementation.
 * Validates that hook-runner routes each hook name to the correct
 * processor without loading Commander, SQLite, or embeddings.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock all dependencies BEFORE importing the module under test.
// This ensures the hook-runner never loads heavyweight modules.

vi.mock('./read-stdin.js', () => ({
  readStdin: vi.fn(),
}));

vi.mock('./cli-utils.js', () => ({
  getRepoRoot: vi.fn(() => '/fake/repo'),
}));

vi.mock('./setup/hooks-user-prompt.js', () => ({
  processUserPrompt: vi.fn(() => ({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: 'mocked' } })),
}));

vi.mock('./setup/hooks-failure-tracker.js', () => ({
  processToolFailure: vi.fn(() => ({})),
  processToolSuccess: vi.fn(),
}));

vi.mock('./setup/hooks-phase-guard.js', () => ({
  processPhaseGuard: vi.fn(() => ({})),
}));

vi.mock('./setup/hooks-read-tracker.js', () => ({
  processReadTracker: vi.fn(() => ({})),
}));

vi.mock('./setup/hooks-stop-audit.js', () => ({
  processStopAudit: vi.fn(() => ({})),
}));

import { readStdin } from './read-stdin.js';
import { getRepoRoot } from './cli-utils.js';
import { processUserPrompt } from './setup/hooks-user-prompt.js';
import { processToolFailure, processToolSuccess } from './setup/hooks-failure-tracker.js';
import { processPhaseGuard } from './setup/hooks-phase-guard.js';
import { processReadTracker } from './setup/hooks-read-tracker.js';
import { processStopAudit } from './setup/hooks-stop-audit.js';

// We need to import the runHook function from hook-runner.
// The hook-runner module will export a runHook function for testability,
// with main() calling runHook(process.argv[2]).
import { runHook } from './hook-runner.js';

describe('hook-runner', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.exitCode = undefined;
    // Reset all mocks (clears call history AND return values)
    vi.clearAllMocks();
    // Re-set default return values after clearing
    vi.mocked(readStdin).mockResolvedValue('{}');
    vi.mocked(getRepoRoot).mockReturnValue('/fake/repo');
    vi.mocked(processUserPrompt).mockReturnValue({});
    vi.mocked(processToolFailure).mockReturnValue({});
    vi.mocked(processToolSuccess).mockReturnValue(undefined);
    vi.mocked(processPhaseGuard).mockReturnValue({});
    vi.mocked(processReadTracker).mockReturnValue({});
    vi.mocked(processStopAudit).mockReturnValue({});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.exitCode = undefined;
  });

  // ---- Routing tests ----

  describe('pre-commit hook', () => {
    it('outputs pre-commit message JSON without reading stdin', async () => {
      await runHook('pre-commit');

      expect(readStdin).not.toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.hook).toBe('pre-commit');
      expect(parsed.message).toContain('LESSON CAPTURE CHECKPOINT');
    });
  });

  describe('user-prompt hook', () => {
    it('reads stdin and calls processUserPrompt', async () => {
      vi.mocked(readStdin).mockResolvedValue(JSON.stringify({ prompt: 'test prompt' }));
      vi.mocked(processUserPrompt).mockReturnValue({
        hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: 'test' },
      });

      await runHook('user-prompt');

      expect(readStdin).toHaveBeenCalled();
      expect(processUserPrompt).toHaveBeenCalledWith('test prompt');
    });

    it('outputs {} when no prompt provided', async () => {
      vi.mocked(readStdin).mockResolvedValue(JSON.stringify({}));

      await runHook('user-prompt');

      expect(processUserPrompt).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify({}));
    });
  });

  describe('post-tool-failure hook', () => {
    it('reads stdin and calls processToolFailure with stateDir', async () => {
      vi.mocked(readStdin).mockResolvedValue(
        JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } })
      );
      vi.mocked(processToolFailure).mockReturnValue({});

      await runHook('post-tool-failure');

      expect(readStdin).toHaveBeenCalled();
      expect(processToolFailure).toHaveBeenCalledWith(
        'Bash',
        { command: 'ls' },
        expect.stringContaining('.claude')
      );
    });

    it('outputs {} when no tool_name provided', async () => {
      vi.mocked(readStdin).mockResolvedValue(JSON.stringify({}));

      await runHook('post-tool-failure');

      expect(processToolFailure).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify({}));
    });
  });

  describe('post-tool-success hook', () => {
    it('reads stdin and calls processToolSuccess with stateDir', async () => {
      vi.mocked(readStdin).mockResolvedValue(JSON.stringify({}));

      await runHook('post-tool-success');

      expect(readStdin).toHaveBeenCalled();
      expect(processToolSuccess).toHaveBeenCalledWith(
        expect.stringContaining('.claude')
      );
    });
  });

  describe('phase-guard hook', () => {
    it('reads stdin and calls processPhaseGuard', async () => {
      vi.mocked(readStdin).mockResolvedValue(
        JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: '/some/file.ts' } })
      );

      await runHook('phase-guard');

      expect(readStdin).toHaveBeenCalled();
      expect(processPhaseGuard).toHaveBeenCalledWith(
        '/fake/repo',
        'Edit',
        { file_path: '/some/file.ts' }
      );
    });

    it('outputs {} when no tool_name provided', async () => {
      vi.mocked(readStdin).mockResolvedValue(JSON.stringify({}));

      await runHook('phase-guard');

      expect(processPhaseGuard).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify({}));
    });
  });

  describe('post-read hook', () => {
    it('reads stdin and calls processReadTracker', async () => {
      vi.mocked(readStdin).mockResolvedValue(
        JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '/some/file.ts' } })
      );

      await runHook('post-read');

      expect(readStdin).toHaveBeenCalled();
      expect(processReadTracker).toHaveBeenCalledWith(
        '/fake/repo',
        'Read',
        { file_path: '/some/file.ts' }
      );
    });

    it('also works with read-tracker alias', async () => {
      vi.mocked(readStdin).mockResolvedValue(
        JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '/f.ts' } })
      );

      await runHook('read-tracker');

      expect(processReadTracker).toHaveBeenCalledWith(
        '/fake/repo',
        'Read',
        { file_path: '/f.ts' }
      );
    });
  });

  describe('phase-audit hook', () => {
    it('reads stdin and calls processStopAudit', async () => {
      vi.mocked(readStdin).mockResolvedValue(
        JSON.stringify({ stop_hook_active: true })
      );

      await runHook('phase-audit');

      expect(readStdin).toHaveBeenCalled();
      expect(processStopAudit).toHaveBeenCalledWith('/fake/repo', true);
    });

    it('defaults stop_hook_active to false when not provided', async () => {
      vi.mocked(readStdin).mockResolvedValue(JSON.stringify({}));

      await runHook('phase-audit');

      expect(processStopAudit).toHaveBeenCalledWith('/fake/repo', false);
    });

    it('also works with stop-audit alias', async () => {
      vi.mocked(readStdin).mockResolvedValue(
        JSON.stringify({ stop_hook_active: false })
      );

      await runHook('stop-audit');

      expect(processStopAudit).toHaveBeenCalledWith('/fake/repo', false);
    });
  });

  // ---- Error handling ----

  describe('unknown hook', () => {
    it('sets exitCode = 1 and outputs error JSON', async () => {
      await runHook('nonexistent-hook');

      expect(process.exitCode).toBe(1);
      const output = consoleLogSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.error).toContain('Unknown hook');
      expect(parsed.error).toContain('nonexistent-hook');
    });
  });

  describe('missing hook argument', () => {
    it('sets exitCode = 1 when hook is undefined', async () => {
      await runHook(undefined as unknown as string);

      expect(process.exitCode).toBe(1);
    });
  });

  describe('error recovery', () => {
    it('outputs {} and does not throw when readStdin fails', async () => {
      vi.mocked(readStdin).mockRejectedValue(new Error('stdin timeout'));

      await runHook('user-prompt');

      // Should not throw, should output {}
      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify({}));
      expect(process.exitCode).toBeUndefined();
    });

    it('outputs {} when JSON parsing fails', async () => {
      vi.mocked(readStdin).mockResolvedValue('not json');

      await runHook('user-prompt');

      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify({}));
    });
  });
});
