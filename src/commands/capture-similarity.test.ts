/**
 * Unit tests for similarity warning in `ca learn` command.
 *
 * These are unit tests (not integration) so we can mock the embedding/search modules.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDb } from '../memory/storage/sqlite/index.js';

// Mock dynamic imports used by the similarity check
vi.mock('../memory/embeddings/model.js', () => ({
  isModelAvailable: vi.fn(() => true),
}));
vi.mock('../memory/search/vector.js', () => ({
  findSimilarLessons: vi.fn(async () => []),
}));
vi.mock('../memory/storage/sqlite/sync.js', () => ({
  syncIfNeeded: vi.fn(async () => false),
}));
vi.mock('../memory/embeddings/nomic.js', () => ({
  embedText: vi.fn(async () => new Array(768).fill(0)),
  unloadEmbedding: vi.fn(),
  withEmbedding: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

// Must import after vi.mock declarations
const { isModelAvailable } = await import('../memory/embeddings/model.js');
const { findSimilarLessons } = await import('../memory/search/vector.js');

describe('learn similarity warning', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ca-sim-'));
    process.env['COMPOUND_AGENT_ROOT'] = tempDir;
    vi.clearAllMocks();
    // Reset defaults
    vi.mocked(isModelAvailable).mockReturnValue(true);
    vi.mocked(findSimilarLessons).mockResolvedValue([]);
  });

  afterEach(async () => {
    closeDb();
    delete process.env['COMPOUND_AGENT_ROOT'];
    await rm(tempDir, { recursive: true, force: true });
  });

  async function runLearn(insight: string): Promise<string> {
    const { Command } = await import('commander');
    const { registerCaptureCommands } = await import('./capture.js');

    const program = new Command();
    program.option('-v, --verbose', 'verbose');
    program.option('-q, --quiet', 'quiet');
    registerCaptureCommands(program);

    const output: string[] = [];
    const origLog = console.log;
    const origErr = console.error;
    console.log = (...args: unknown[]) => output.push(args.map(String).join(' '));
    console.error = (...args: unknown[]) => output.push(args.map(String).join(' '));

    try {
      await program.parseAsync(['node', 'ca', 'learn', insight, '--yes']);
    } finally {
      console.log = origLog;
      console.error = origErr;
    }

    return output.join('\n');
  }

  it('outputs similarity warning when similar lessons exist', async () => {
    vi.mocked(findSimilarLessons).mockResolvedValue([
      {
        item: {
          id: 'Ldeadbeef',
          type: 'lesson',
          trigger: 'trigger',
          insight: 'Use Polars instead of pandas for large datasets',
          tags: [],
          source: 'manual',
          context: { tool: 'cli', intent: 'manual' },
          created: new Date().toISOString(),
          confirmed: true,
          supersedes: [],
          related: [],
        },
        score: 0.92,
      },
    ]);

    const output = await runLearn('Use Polars for big data processing');

    expect(output).toContain('Similar lessons found');
    expect(output).toContain('Ldeadbeef');
  });

  it('succeeds without warning when no matches', async () => {
    vi.mocked(findSimilarLessons).mockResolvedValue([]);

    const output = await runLearn('A unique insight with no duplicates');

    expect(output).toContain('Learned');
    expect(output).not.toContain('Similar lessons found');
  });

  it('succeeds when model unavailable', async () => {
    vi.mocked(isModelAvailable).mockReturnValue(false);

    const output = await runLearn('Lesson when model is not available');

    expect(output).toContain('Learned');
    expect(output).not.toContain('Similar lessons found');
    expect(findSimilarLessons).not.toHaveBeenCalled();
  });

  it('succeeds when findSimilarLessons throws', async () => {
    vi.mocked(findSimilarLessons).mockRejectedValue(new Error('embedding crash'));

    const output = await runLearn('Lesson despite search error');

    expect(output).toContain('Learned');
    // Should not crash -- similarity check is best-effort
    expect(output).not.toContain('embedding crash');
  });
});
