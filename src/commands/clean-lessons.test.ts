/**
 * Tests for the `ca clean-lessons` CLI command.
 *
 * Uses mocked dependencies to test output formatting and deduplication logic
 * independently of the embedding model.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

import type { MemoryItem } from '../memory/types.js';

import { createQuickLesson } from '../test-utils.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../cli-utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cli-utils.js')>();
  return {
    ...actual,
    getRepoRoot: vi.fn(() => '/tmp/test-repo'),
  };
});

vi.mock('../memory/embeddings/nomic.js', () => ({
  embedText: vi.fn(async () => new Array(768).fill(0)),
  unloadEmbedding: vi.fn(),
  isModelAvailable: vi.fn(() => true),
  getEmbedding: vi.fn(),
  embedTexts: vi.fn(),
}));

vi.mock('../memory/embeddings/model.js', () => ({
  isModelAvailable: vi.fn(() => true),
  isModelUsable: vi.fn(),
  resolveModel: vi.fn(),
  clearUsabilityCache: vi.fn(),
  MODEL_URI: 'test',
  MODEL_FILENAME: 'test.gguf',
}));

vi.mock('../memory/storage/index.js', () => ({
  readMemoryItems: vi.fn(async () => ({ items: [], errors: [] })),
  syncIfNeeded: vi.fn(async () => false),
}));

vi.mock('../memory/search/vector.js', () => ({
  findSimilarLessons: vi.fn(async () => []),
}));

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('clean-lessons command', () => {
  let program: Command;
  let logs: string[];
  let errors: string[];
  let originalLog: typeof console.log;
  let originalError: typeof console.error;

  beforeEach(() => {
    program = new Command();
    program.option('-v, --verbose', 'verbose');
    program.option('-q, --quiet', 'quiet');

    logs = [];
    errors = [];
    originalLog = console.log;
    originalError = console.error;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    console.error = (...args: unknown[]) => errors.push(args.map(String).join(' '));
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    vi.restoreAllMocks();
  });

  // Lazy import so mocks are applied first
  async function register(): Promise<void> {
    const { registerCleanLessonsCommand } = await import('./clean-lessons.js');
    registerCleanLessonsCommand(program);
  }

  it('outputs clean message when no similar pairs', async () => {
    const items: MemoryItem[] = [
      createQuickLesson('L001', 'first lesson'),
      createQuickLesson('L002', 'second lesson'),
    ];

    const { readMemoryItems } = await import('../memory/storage/index.js');
    vi.mocked(readMemoryItems).mockResolvedValue({ items, errors: [] });

    const { findSimilarLessons } = await import('../memory/search/vector.js');
    vi.mocked(findSimilarLessons).mockResolvedValue([]);

    await register();
    await program.parseAsync(['node', 'ca', 'clean-lessons']);

    const output = logs.join('\n');
    expect(output.toLowerCase()).toContain('clean');
  });

  it('outputs flagged pairs when similar lessons exist', async () => {
    const itemA = createQuickLesson('L001', 'use Polars for data manipulation');
    const itemB = createQuickLesson('L002', 'prefer Polars over pandas');
    const items: MemoryItem[] = [itemA, itemB];

    const { readMemoryItems } = await import('../memory/storage/index.js');
    vi.mocked(readMemoryItems).mockResolvedValue({ items, errors: [] });

    const { findSimilarLessons } = await import('../memory/search/vector.js');
    vi.mocked(findSimilarLessons).mockImplementation(async (_root, _text, options) => {
      if (options?.excludeId === 'L001') {
        return [{ item: itemB, score: 0.92 }];
      }
      return [];
    });

    await register();
    await program.parseAsync(['node', 'ca', 'clean-lessons']);

    const output = logs.join('\n');
    expect(output).toContain('L001');
    expect(output).toContain('L002');
    expect(output).toContain('92%');
  });

  it('deduplicates symmetric pairs', async () => {
    const itemA = createQuickLesson('L001', 'insight A');
    const itemB = createQuickLesson('L002', 'insight B');
    const items: MemoryItem[] = [itemA, itemB];

    const { readMemoryItems } = await import('../memory/storage/index.js');
    vi.mocked(readMemoryItems).mockResolvedValue({ items, errors: [] });

    const { findSimilarLessons } = await import('../memory/search/vector.js');
    // A finds B, B finds A -- should be deduplicated to one pair
    vi.mocked(findSimilarLessons).mockImplementation(async (_root, _text, options) => {
      if (options?.excludeId === 'L001') {
        return [{ item: itemB, score: 0.85 }];
      }
      if (options?.excludeId === 'L002') {
        return [{ item: itemA, score: 0.85 }];
      }
      return [];
    });

    await register();
    await program.parseAsync(['node', 'ca', 'clean-lessons']);

    const output = logs.join('\n');
    // Should show "1 similar lesson pair" not "2"
    expect(output).toContain('1 similar lesson pair');
  });

  it('outputs reviewer instructions', async () => {
    const itemA = createQuickLesson('L001', 'insight A');
    const itemB = createQuickLesson('L002', 'insight B');
    const items: MemoryItem[] = [itemA, itemB];

    const { readMemoryItems } = await import('../memory/storage/index.js');
    vi.mocked(readMemoryItems).mockResolvedValue({ items, errors: [] });

    const { findSimilarLessons } = await import('../memory/search/vector.js');
    vi.mocked(findSimilarLessons).mockImplementation(async (_root, _text, options) => {
      if (options?.excludeId === 'L001') {
        return [{ item: itemB, score: 0.90 }];
      }
      return [];
    });

    await register();
    await program.parseAsync(['node', 'ca', 'clean-lessons']);

    const output = logs.join('\n');
    expect(output).toContain('/lessons-reviewer');
  });

  it('fails with error when model unavailable', async () => {
    const { isModelAvailable } = await import('../memory/embeddings/nomic.js');
    vi.mocked(isModelAvailable).mockReturnValue(false);

    await register();
    await program.parseAsync(['node', 'ca', 'clean-lessons']);

    const errorOutput = errors.join('\n');
    expect(errorOutput).toContain('MODEL_UNAVAILABLE');
    expect(process.exitCode).toBe(1);

    // Reset exitCode for other tests
    process.exitCode = undefined;
  });
});
