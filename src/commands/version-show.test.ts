/**
 * Tests for version-show command — version display and changelog output.
 */

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerVersionShowCommand } from './version-show.js';

// Mock the banner module — we don't want real terminal animation in tests.
vi.mock('../setup/index.js', () => ({
  playInstallBanner: vi.fn().mockResolvedValue(undefined),
}));

describe('version-show command', () => {
  let program: Command;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    program = new Command();
    program.exitOverride(); // throw instead of process.exit
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Command registration
  // ==========================================================================

  it('registers "version-show" command on the program', () => {
    registerVersionShowCommand(program);
    const cmd = program.commands.find((c) => c.name() === 'version-show');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toContain('version');
  });

  // ==========================================================================
  // Non-TTY output
  // ==========================================================================

  it('outputs plain version string when stdout is not a TTY', async () => {
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

    registerVersionShowCommand(program);
    await program.parseAsync(['node', 'test', 'version-show']);

    const calls = logSpy.mock.calls.map((c) => c[0]);
    const versionLine = calls.find(
      (line) => typeof line === 'string' && line.startsWith('compound-agent v')
    );
    expect(versionLine).toBeDefined();

    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
  });

  // ==========================================================================
  // Changelog display
  // ==========================================================================

  it('outputs changelog content', async () => {
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

    registerVersionShowCommand(program);
    await program.parseAsync(['node', 'test', 'version-show']);

    const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
    // Changelog should contain version headers from the embedded data
    expect(allOutput).toMatch(/## \[\d+\.\d+\.\d+\]/);

    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
  });
});
