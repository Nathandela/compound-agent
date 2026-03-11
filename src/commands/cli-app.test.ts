import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

vi.mock('../memory/embeddings/index.js', () => ({
  unloadEmbeddingResources: vi.fn(async () => {}),
}));

vi.mock('../memory/storage/index.js', () => ({
  closeDb: vi.fn(),
}));

vi.mock('../update-check.js', () => ({
  checkForUpdate: vi.fn().mockResolvedValue(null),
  formatUpdateNotification: vi.fn(
    (current: string, latest: string) => `Update available: ${current} -> ${latest}\nRun: pnpm update --latest compound-agent`,
  ),
}));

describe('runProgram', () => {
  let originalExitCode: number | undefined;

  beforeEach(() => {
    originalExitCode = process.exitCode;
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it('releases resources after a successful command', { timeout: 10_000 }, async () => {
    const { runProgram } = await import('../cli-app.js');

    const program = new Command();
    program.exitOverride();
    program.command('test').action(async () => {});

    await runProgram(program, ['node', 'ca', 'test']);

    const { unloadEmbeddingResources } = await import('../memory/embeddings/index.js');
    const { closeDb } = await import('../memory/storage/index.js');
    expect(unloadEmbeddingResources).toHaveBeenCalledTimes(1);
    expect(closeDb).toHaveBeenCalledTimes(1);
  });

  it('prints update notification when TTY and update available', async () => {
    const { checkForUpdate } = await import('../update-check.js');
    vi.mocked(checkForUpdate).mockResolvedValue({
      current: '1.5.0',
      latest: '2.0.0',
      updateAvailable: true,
    });

    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runProgram } = await import('../cli-app.js');
    const program = new Command();
    program.exitOverride();
    program.command('test').action(async () => {});

    await runProgram(program, ['node', 'ca', 'test']);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('pnpm update --latest compound-agent'));

    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
  });

  it('does not print notification when no update available', async () => {
    const { checkForUpdate } = await import('../update-check.js');
    vi.mocked(checkForUpdate).mockResolvedValue({
      current: '2.0.0',
      latest: '2.0.0',
      updateAvailable: false,
    });

    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runProgram } = await import('../cli-app.js');
    const program = new Command();
    program.exitOverride();
    program.command('test').action(async () => {});

    await runProgram(program, ['node', 'ca', 'test']);

    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('pnpm update'));

    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
  });

  it('swallows update check errors silently', async () => {
    const { checkForUpdate } = await import('../update-check.js');
    vi.mocked(checkForUpdate).mockRejectedValue(new Error('network failure'));

    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

    const { runProgram } = await import('../cli-app.js');
    const program = new Command();
    program.exitOverride();
    program.command('test').action(async () => {});

    // Should not throw despite checkForUpdate failing
    await expect(runProgram(program, ['node', 'ca', 'test'])).resolves.toBeUndefined();

    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
  });

  it('releases resources when a command fails', async () => {
    const { runProgram } = await import('../cli-app.js');

    const program = new Command();
    program.exitOverride();
    program.command('test').action(async () => {
      throw new Error('boom');
    });

    await expect(runProgram(program, ['node', 'ca', 'test'])).rejects.toThrow('boom');

    const { unloadEmbeddingResources } = await import('../memory/embeddings/index.js');
    const { closeDb } = await import('../memory/storage/index.js');
    expect(unloadEmbeddingResources).toHaveBeenCalledTimes(1);
    expect(closeDb).toHaveBeenCalledTimes(1);
  });
});
