/**
 * Tests for install-beads command — install the beads CLI via curl script.
 *
 * TDD: Tests written BEFORE implementation.
 */

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Must be hoisted before the module under test is imported.
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0, error: undefined })),
}));

import { spawnSync } from 'node:child_process';
import { registerInstallBeadsCommand } from './install-beads.js';

const INSTALL_URL =
  'https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh';

describe('install-beads command', () => {
  let program: Command;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  const spawnMock = vi.mocked(spawnSync);
  let originalPlatform: string;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    spawnMock.mockClear();
    spawnMock.mockReturnValue({ status: 0, error: undefined } as any);
    originalPlatform = process.platform;
    originalIsTTY = process.stdout.isTTY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
  });

  // ==========================================================================
  // Command registration
  // ==========================================================================

  it('registers "install-beads" command on the program', () => {
    registerInstallBeadsCommand(program);
    const cmd = program.commands.find((c) => c.name() === 'install-beads');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toBeTruthy();
  });

  // ==========================================================================
  // Windows guard
  // ==========================================================================

  it('prints "not supported on Windows" and does not call spawnSync on win32', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    registerInstallBeadsCommand(program);
    await program.parseAsync(['node', 'test', 'install-beads', '--yes']);

    const allOutput = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .map((c) => c.join(' '))
      .join('\n');
    expect(allOutput.toLowerCase()).toContain('not supported');
    expect(allOutput.toLowerCase()).toContain('windows');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // Non-TTY without --yes
  // ==========================================================================

  it('prints the install hint URL and does not call spawnSync when non-TTY without --yes', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

    registerInstallBeadsCommand(program);
    await program.parseAsync(['node', 'test', 'install-beads']);

    const allOutput = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(allOutput).toContain(INSTALL_URL);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // --yes flag (TTY mode)
  // ==========================================================================

  it('calls spawnSync with the curl URL when --yes is passed in TTY mode', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

    registerInstallBeadsCommand(program);
    await program.parseAsync(['node', 'test', 'install-beads', '--yes']);

    expect(spawnMock).toHaveBeenCalledOnce();
    const callArgs = spawnMock.mock.calls[0];
    const fullCommand = JSON.stringify(callArgs);
    expect(fullCommand).toContain(INSTALL_URL);
  });

  it('passes a timeout option of 60000ms to spawnSync', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

    registerInstallBeadsCommand(program);
    await program.parseAsync(['node', 'test', 'install-beads', '--yes']);

    expect(spawnMock).toHaveBeenCalledOnce();
    const options = spawnMock.mock.calls[0][2] as Record<string, unknown> | undefined;
    expect(options).toBeDefined();
    expect(options!.timeout).toBe(60_000);
  });

  // ==========================================================================
  // --yes flag (non-TTY mode)
  // ==========================================================================

  it('calls spawnSync when --yes is passed even in non-TTY mode', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

    registerInstallBeadsCommand(program);
    await program.parseAsync(['node', 'test', 'install-beads', '--yes']);

    expect(spawnMock).toHaveBeenCalledOnce();
  });

  // ==========================================================================
  // Failed install
  // ==========================================================================

  it('prints an error message and does not throw when spawnSync returns non-zero status', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    spawnMock.mockReturnValue({ status: 1, error: undefined } as any);

    registerInstallBeadsCommand(program);
    // Should not throw
    await program.parseAsync(['node', 'test', 'install-beads', '--yes']);

    const allOutput = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .map((c) => c.join(' '))
      .join('\n')
      .toLowerCase();
    expect(allOutput).toContain('error');
  });

  it('prints an error message and does not throw when spawnSync throws', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    spawnMock.mockReturnValue({ status: null, error: new Error('ENOENT') } as any);

    registerInstallBeadsCommand(program);
    // Should not throw
    await program.parseAsync(['node', 'test', 'install-beads', '--yes']);

    const allOutput = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .map((c) => c.join(' '))
      .join('\n')
      .toLowerCase();
    expect(allOutput).toContain('error');
  });

  // ==========================================================================
  // Post-install shell reload warning
  // ==========================================================================

  it('prints a shell reload message after successful install', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    spawnMock.mockReturnValue({ status: 0, error: undefined } as any);

    registerInstallBeadsCommand(program);
    await program.parseAsync(['node', 'test', 'install-beads', '--yes']);

    const allOutput = logSpy.mock.calls.map((c) => c.join(' ')).join('\n').toLowerCase();
    expect(allOutput).toMatch(/reload|restart|source|new.*(shell|terminal)/);
  });

  // ==========================================================================
  // URL constant in output
  // ==========================================================================

  it('includes the install script URL in output when printing hint', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

    registerInstallBeadsCommand(program);
    await program.parseAsync(['node', 'test', 'install-beads']);

    const allOutput = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(allOutput).toContain(INSTALL_URL);
  });
});
