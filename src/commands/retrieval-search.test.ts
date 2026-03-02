/**
 * Unit tests for search command: isModelAvailable preflight + embedding fallback.
 *
 * Verifies that searchAction uses isModelAvailable() (fs-only check) instead of
 * isModelUsable() (heavy native model probe), and falls back to keyword-only
 * search when the embedding model fails at runtime.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

import { createQuickLesson } from '../test-utils.js';
import type { MemoryItem } from '../memory/types.js';
import type { ScoredLesson } from '../memory/search/vector.js';

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

// Mock the index.js barrel -- retrieval.ts imports isModelAvailable from here
vi.mock('../index.js', async () => ({
  isModelUsable: vi.fn(),
  isModelAvailable: vi.fn(() => true),
  loadSessionLessons: vi.fn(async () => []),
  retrieveForPlan: vi.fn(async () => ({ lessons: [], message: '' })),
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
  syncIfNeeded: vi.fn(async () => false),
  searchKeyword: vi.fn(async () => []),
  searchKeywordScored: vi.fn(async () => []),
  incrementRetrievalCount: vi.fn(),
  readLessons: vi.fn(async () => ({ lessons: [] })),
  readMemoryItems: vi.fn(async () => ({ items: [], errors: [] })),
}));

vi.mock('../memory/search/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../memory/search/index.js')>();
  return {
    ...actual,
    searchVector: vi.fn(async () => []),
  };
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('search command: preflight and fallback', () => {
  let program: Command;
  let logs: string[];
  let errors: string[];
  let originalLog: typeof console.log;
  let originalError: typeof console.error;

  beforeEach(() => {
    program = new Command();
    program.option('-v, --verbose', 'verbose');
    program.option('-q, --quiet', 'quiet');
    program.exitOverride(); // Prevent Commander from calling process.exit

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

  async function register(): Promise<void> {
    const { registerRetrievalCommands } = await import('./retrieval.js');
    registerRetrievalCommands(program);
  }

  it('uses isModelAvailable (not isModelUsable) for preflight check', async () => {
    const { isModelAvailable } = await import('../index.js');
    vi.mocked(isModelAvailable).mockReturnValue(true);

    const { searchVector } = await import('../memory/search/index.js');
    const lesson = createQuickLesson('L001', 'test lesson');
    vi.mocked(searchVector).mockResolvedValue([{ lesson, score: 0.9 }]);

    const { searchKeywordScored } = await import('../memory/storage/index.js');
    vi.mocked(searchKeywordScored).mockResolvedValue([]);

    await register();
    await program.parseAsync(['node', 'ca', 'search', 'test query']);

    // isModelAvailable should have been called
    expect(isModelAvailable).toHaveBeenCalled();

    // isModelUsable should NOT have been called (the whole point of this change)
    const { isModelUsable } = await import('../index.js');
    expect(isModelUsable).not.toHaveBeenCalled();
  });

  it('uses hybrid search when model is available', async () => {
    const { isModelAvailable } = await import('../index.js');
    vi.mocked(isModelAvailable).mockReturnValue(true);

    const lesson = createQuickLesson('L001', 'use Polars for data');
    const { searchVector } = await import('../memory/search/index.js');
    vi.mocked(searchVector).mockResolvedValue([{ lesson, score: 0.9 }]);

    const { searchKeywordScored } = await import('../memory/storage/index.js');
    vi.mocked(searchKeywordScored).mockResolvedValue([]);

    await register();
    await program.parseAsync(['node', 'ca', 'search', 'Polars']);

    // searchVector should have been called (hybrid path)
    expect(searchVector).toHaveBeenCalled();
  });

  it('falls back to keyword-only when model is unavailable', async () => {
    const { isModelAvailable } = await import('../index.js');
    vi.mocked(isModelAvailable).mockReturnValue(false);

    const lesson = createQuickLesson('L001', 'use Polars for data');
    const { searchKeyword } = await import('../memory/storage/index.js');
    vi.mocked(searchKeyword).mockResolvedValue([lesson]);

    const { searchVector } = await import('../memory/search/index.js');

    await register();
    await program.parseAsync(['node', 'ca', 'search', 'Polars']);

    // searchVector should NOT be called
    expect(searchVector).not.toHaveBeenCalled();
    // searchKeyword (FTS-only) should have been called
    expect(searchKeyword).toHaveBeenCalled();
  });

  it('falls back to keyword-only when searchVector throws at runtime', async () => {
    const { isModelAvailable } = await import('../index.js');
    vi.mocked(isModelAvailable).mockReturnValue(true);

    // searchVector throws (model fails to load at runtime)
    const { searchVector } = await import('../memory/search/index.js');
    vi.mocked(searchVector).mockRejectedValue(new Error('Failed to load model'));

    const lesson = createQuickLesson('L001', 'use Polars for data');
    const { searchKeyword } = await import('../memory/storage/index.js');
    vi.mocked(searchKeyword).mockResolvedValue([lesson]);

    await register();
    await program.parseAsync(['node', 'ca', 'search', 'Polars']);

    // Should have tried vector search
    expect(searchVector).toHaveBeenCalled();
    // Should have fallen back to keyword search
    expect(searchKeyword).toHaveBeenCalled();
    // Should NOT set error exit code (graceful fallback)
    expect(process.exitCode).not.toBe(1);
    // Should show the keyword results
    const output = logs.join('\n');
    expect(output).toContain('Polars');
  });

  it('shows results from keyword fallback after embedding failure', async () => {
    const { isModelAvailable } = await import('../index.js');
    vi.mocked(isModelAvailable).mockReturnValue(true);

    const { searchVector } = await import('../memory/search/index.js');
    vi.mocked(searchVector).mockRejectedValue(new Error('Native backend crash'));

    const lesson = createQuickLesson('L001', 'always test your code');
    const { searchKeyword } = await import('../memory/storage/index.js');
    vi.mocked(searchKeyword).mockResolvedValue([lesson]);

    await register();
    await program.parseAsync(['node', 'ca', 'search', 'testing']);

    const output = logs.join('\n');
    expect(output).toContain('always test your code');
  });
});
