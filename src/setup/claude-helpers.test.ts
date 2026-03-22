/**
 * Unit tests for Claude settings hook helpers.
 */

import { describe, expect, it } from 'vitest';

import {
  addAllCompoundAgentHooks,
  getCompoundAgentHookStatus,
  removeCompoundAgentHook,
} from './claude-helpers.js';

function createLegacySettings(): Record<string, unknown> {
  return {
    hooks: {
      SessionStart: [
        { matcher: '', hooks: [{ type: 'command', command: 'npx ca load-session 2>/dev/null || true' }] },
      ],
      PreCompact: [
        { matcher: '', hooks: [{ type: 'command', command: 'npx ca load-session 2>/dev/null || true' }] },
      ],
      UserPromptSubmit: [
        { matcher: '', hooks: [{ type: 'command', command: 'npx ca hooks run user-prompt 2>/dev/null || true' }] },
      ],
      PostToolUseFailure: [
        { matcher: 'Bash|Edit|Write', hooks: [{ type: 'command', command: 'npx ca hooks run post-tool-failure 2>/dev/null || true' }] },
      ],
      PostToolUse: [
        { matcher: 'Bash|Edit|Write', hooks: [{ type: 'command', command: 'npx ca hooks run post-tool-success 2>/dev/null || true' }] },
        { matcher: 'Read', hooks: [{ type: 'command', command: 'npx ca hooks run read-tracker 2>/dev/null || true' }] },
      ],
      PreToolUse: [
        { matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'npx ca hooks run phase-guard 2>/dev/null || true' }] },
      ],
      Stop: [
        { matcher: '', hooks: [{ type: 'command', command: 'npx ca hooks run stop-audit 2>/dev/null || true' }] },
      ],
    },
  };
}

describe('addAllCompoundAgentHooks', () => {
  it('upgrades managed hooks to the current commands when hook-runner is available', () => {
    const settings = createLegacySettings();
    const hookRunnerPath = '/tmp/dist/hook-runner.js';

    addAllCompoundAgentHooks(settings, hookRunnerPath);

    const hooks = settings.hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    expect(hooks.SessionStart[0]!.hooks[0]!.command).toBe('npx ca prime 2>/dev/null || true');
    expect(hooks.PreCompact[0]!.hooks[0]!.command).toBe('npx ca prime 2>/dev/null || true');
    expect(hooks.UserPromptSubmit[0]!.hooks[0]!.command).toBe(`node "${hookRunnerPath}" user-prompt 2>/dev/null || true`);
    expect(hooks.PostToolUseFailure[0]!.hooks[0]!.command).toBe(`node "${hookRunnerPath}" post-tool-failure 2>/dev/null || true`);
    expect(hooks.PostToolUse[0]!.hooks[0]!.command).toBe(`node "${hookRunnerPath}" post-tool-success 2>/dev/null || true`);
    expect(hooks.PostToolUse[1]!.hooks[0]!.command).toBe(`node "${hookRunnerPath}" post-read 2>/dev/null || true`);
    expect(hooks.PreToolUse[0]!.hooks[0]!.command).toBe(`node "${hookRunnerPath}" phase-guard 2>/dev/null || true`);
    expect(hooks.Stop[0]!.hooks[0]!.command).toBe(`node "${hookRunnerPath}" phase-audit 2>/dev/null || true`);
  });

  it('preserves unrelated commands that share an entry with a managed hook', () => {
    const settings = {
      hooks: {
        PostToolUse: [
          {
            matcher: 'Read',
            hooks: [
              { type: 'command', command: 'npx ca hooks run read-tracker 2>/dev/null || true' },
              { type: 'command', command: 'echo "custom read audit"' },
            ],
          },
        ],
      },
    };

    addAllCompoundAgentHooks(settings, '/tmp/dist/hook-runner.js');

    const hooks = settings.hooks as Record<string, Array<{ matcher: string; hooks: Array<{ command: string }> }>>;
    expect(hooks.PostToolUse).toHaveLength(3);
    expect(hooks.PostToolUse[0]).toEqual({
      matcher: 'Read',
      hooks: [{ type: 'command', command: 'echo "custom read audit"' }],
    });
    expect(hooks.PostToolUse[1]!.hooks[0]!.command).toContain('post-tool-success');
    expect(hooks.PostToolUse[2]!.hooks[0]!.command).toContain('post-read');
  });

  it('does not treat wrapped shell commands as owned managed hooks', () => {
    const settings = {
      hooks: {
        PostToolUse: [
          {
            matcher: 'Read',
            hooks: [
              {
                type: 'command',
                command: "bash -lc 'echo pre; npx ca hooks run post-read 2>/dev/null || true; echo post'",
              },
            ],
          },
        ],
      },
    };

    addAllCompoundAgentHooks(settings, '/tmp/dist/hook-runner.js');

    const hooks = settings.hooks as Record<string, Array<{ matcher: string; hooks: Array<{ command: string }> }>>;
    expect(hooks.PostToolUse[0]).toEqual({
      matcher: 'Read',
      hooks: [
        {
          type: 'command',
          command: "bash -lc 'echo pre; npx ca hooks run post-read 2>/dev/null || true; echo post'",
        },
      ],
    });
    expect(hooks.PostToolUse.some((entry) => entry.hooks.some((hook) => hook.command.includes('hook-runner.js') && hook.command.includes('post-read')))).toBe(true);
  });

  it('collapses duplicate managed hook commands down to one desired command', () => {
    const hookRunnerPath = '/tmp/dist/hook-runner.js';
    const settings = {
      hooks: {
        SessionStart: [
          { matcher: '', hooks: [{ type: 'command', command: 'npx ca prime 2>/dev/null || true' }] },
        ],
        PreCompact: [
          { matcher: '', hooks: [{ type: 'command', command: 'npx ca prime 2>/dev/null || true' }] },
        ],
        UserPromptSubmit: [
          { matcher: '', hooks: [{ type: 'command', command: 'node "/tmp/dist/hook-runner.js" user-prompt 2>/dev/null || true' }] },
        ],
        PostToolUseFailure: [
          { matcher: 'Bash|Edit|Write', hooks: [{ type: 'command', command: 'node "/tmp/dist/hook-runner.js" post-tool-failure 2>/dev/null || true' }] },
        ],
        PostToolUse: [
          { matcher: 'Bash|Edit|Write', hooks: [{ type: 'command', command: 'node "/tmp/dist/hook-runner.js" post-tool-success 2>/dev/null || true' }] },
          { matcher: 'Read', hooks: [{ type: 'command', command: 'npx ca hooks run read-tracker 2>/dev/null || true' }] },
          { matcher: 'Read', hooks: [{ type: 'command', command: 'node "/tmp/dist/hook-runner.js" post-read 2>/dev/null || true' }] },
        ],
        PreToolUse: [
          { matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'node "/tmp/dist/hook-runner.js" phase-guard 2>/dev/null || true' }] },
        ],
        Stop: [
          { matcher: '', hooks: [{ type: 'command', command: 'npx ca hooks run stop-audit 2>/dev/null || true' }] },
          { matcher: '', hooks: [{ type: 'command', command: 'node "/tmp/dist/hook-runner.js" phase-audit 2>/dev/null || true' }] },
        ],
      },
    };

    addAllCompoundAgentHooks(settings, hookRunnerPath);

    const hooks = settings.hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    expect(hooks.PostToolUse).toHaveLength(2);
    expect(hooks.PostToolUse.filter((entry) => entry.hooks[0]!.command.includes('post-read'))).toHaveLength(1);
    expect(hooks.Stop).toHaveLength(1);
    expect(hooks.Stop[0]!.hooks[0]!.command).toBe(`node "${hookRunnerPath}" phase-audit 2>/dev/null || true`);
  });
});

describe('getCompoundAgentHookStatus', () => {
  it('marks legacy hooks as needing migration when hook-runner is available', () => {
    const hookStatus = getCompoundAgentHookStatus(createLegacySettings(), '/tmp/dist/hook-runner.js');

    expect(hookStatus.hasAnyManagedHooks).toBe(true);
    expect(hookStatus.hasAllRequiredHooks).toBe(true);
    expect(hookStatus.hasAllDesiredHooks).toBe(false);
    expect(hookStatus.hasIncompleteHooks).toBe(false);
    expect(hookStatus.needsMigration).toBe(true);
  });

  it('marks partial hook installs as incomplete instead of migration-only', () => {
    const hookStatus = getCompoundAgentHookStatus({
      hooks: {
        SessionStart: [
          { matcher: '', hooks: [{ type: 'command', command: 'npx ca prime 2>/dev/null || true' }] },
        ],
        UserPromptSubmit: [
          { matcher: '', hooks: [{ type: 'command', command: 'npx ca hooks run user-prompt 2>/dev/null || true' }] },
        ],
      },
    }, '/tmp/dist/hook-runner.js');

    expect(hookStatus.hasAnyManagedHooks).toBe(true);
    expect(hookStatus.hasAllRequiredHooks).toBe(false);
    expect(hookStatus.hasIncompleteHooks).toBe(true);
    expect(hookStatus.needsMigration).toBe(false);
  });
});

describe('removeCompoundAgentHook', () => {
  it('removes managed commands while preserving unrelated commands in the same entry', () => {
    const settings = {
      hooks: {
        PostToolUse: [
          {
            matcher: 'Read',
            hooks: [
              { type: 'command', command: 'node "/tmp/dist/hook-runner.js" post-read 2>/dev/null || true' },
              { type: 'command', command: 'echo "custom read audit"' },
            ],
          },
        ],
      },
    };

    const removed = removeCompoundAgentHook(settings);

    expect(removed).toBe(true);
    const hooks = settings.hooks as Record<string, Array<{ matcher: string; hooks: Array<{ command: string }> }>>;
    expect(hooks.PostToolUse).toEqual([
      {
        matcher: 'Read',
        hooks: [{ type: 'command', command: 'echo "custom read audit"' }],
      },
    ]);
  });

  it('does not remove wrapped shell commands that merely embed a managed command substring', () => {
    const settings = {
      hooks: {
        PostToolUse: [
          {
            matcher: 'Read',
            hooks: [
              {
                type: 'command',
                command: "bash -lc 'echo pre; npx ca hooks run post-read 2>/dev/null || true; echo post'",
              },
            ],
          },
        ],
      },
    };

    const removed = removeCompoundAgentHook(settings);

    expect(removed).toBe(false);
    const hooks = settings.hooks as Record<string, Array<{ matcher: string; hooks: Array<{ command: string }> }>>;
    expect(hooks.PostToolUse[0]).toEqual({
      matcher: 'Read',
      hooks: [
        {
          type: 'command',
          command: "bash -lc 'echo pre; npx ca hooks run post-read 2>/dev/null || true; echo post'",
        },
      ],
    });
  });
});
