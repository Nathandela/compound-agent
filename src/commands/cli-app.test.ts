import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

vi.mock('../memory/embeddings/index.js', () => ({
  unloadEmbeddingResources: vi.fn(async () => {}),
}));

vi.mock('../memory/storage/index.js', () => ({
  closeDb: vi.fn(),
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

  it('releases resources after a successful command', async () => {
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
