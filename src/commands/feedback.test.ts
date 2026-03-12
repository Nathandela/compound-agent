/**
 * Tests for feedback command — print and optionally open GitHub Discussions.
 */

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Must be hoisted before the module under test is imported.
vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}));

import { registerFeedbackCommand } from './feedback.js';

describe('feedback command', () => {
  let program: Command;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Command registration
  // ==========================================================================

  it('registers "feedback" command on the program', () => {
    registerFeedbackCommand(program);
    const cmd = program.commands.find((c) => c.name() === 'feedback');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toBeTruthy();
  });

  // ==========================================================================
  // Output content
  // ==========================================================================

  it('outputs GitHub Discussions URL', async () => {
    registerFeedbackCommand(program);
    await program.parseAsync(['node', 'test', 'feedback']);

    const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('https://github.com/Nathandela/compound-agent/discussions');
  });

  it('outputs repo URL', async () => {
    registerFeedbackCommand(program);
    await program.parseAsync(['node', 'test', 'feedback']);

    const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('https://github.com/Nathandela/compound-agent');
  });

  // ==========================================================================
  // Browser open (TTY only, --open flag)
  // ==========================================================================

  it('does not open browser when stdout is not a TTY', async () => {
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

    const { spawn } = await import('node:child_process');
    const spawnMock = vi.mocked(spawn);
    spawnMock.mockClear();

    registerFeedbackCommand(program);
    await program.parseAsync(['node', 'test', 'feedback']);

    expect(spawnMock).not.toHaveBeenCalled();

    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
  });

  it('opens browser when --open flag is passed in TTY mode', async () => {
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

    const { spawn } = await import('node:child_process');
    const spawnMock = vi.mocked(spawn);
    spawnMock.mockClear();

    registerFeedbackCommand(program);
    await program.parseAsync(['node', 'test', 'feedback', '--open']);

    expect(spawnMock).toHaveBeenCalledOnce();
    const [, args] = spawnMock.mock.calls[0];
    expect(args).toContain('https://github.com/Nathandela/compound-agent/discussions');

    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
  });
});
