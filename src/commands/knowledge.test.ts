/**
 * Tests for the `ca knowledge <query>` CLI command output formatting.
 *
 * Uses mocked search results to test output formatting independently
 * of the search implementation.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

import type { KnowledgeChunk } from '../memory/storage/sqlite-knowledge/types.js';
import type { GenericScoredItem } from '../memory/search/hybrid.js';

import { registerKnowledgeCommand } from './knowledge.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChunkResult(
  id: string,
  filePath: string,
  text: string,
  score: number,
  startLine = 1,
  endLine = 10
): GenericScoredItem<KnowledgeChunk> {
  return {
    item: {
      id,
      filePath,
      startLine,
      endLine,
      contentHash: `hash-${id}`,
      text,
      updatedAt: new Date().toISOString(),
    },
    score,
  };
}

// Mock modules
vi.mock('../cli-utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cli-utils.js')>();
  return {
    ...actual,
    getRepoRoot: vi.fn(() => '/tmp/test-repo'),
    parseLimit: actual.parseLimit,
  };
});

vi.mock('../memory/knowledge/search.js', () => ({
  searchKnowledge: vi.fn(async () => []),
}));

vi.mock('../memory/embeddings/index.js', () => ({
  unloadEmbeddingResources: vi.fn(async () => {}),
}));

vi.mock('../memory/storage/sqlite-knowledge/connection.js', () => ({
  openKnowledgeDb: vi.fn(() => ({
    prepare: vi.fn(() => ({ get: vi.fn(() => ({ cnt: 5 })) })),
  })),
  closeKnowledgeDb: vi.fn(),
}));

describe('knowledge command', () => {
  let program: Command;
  let logs: string[];
  let errors: string[];
  let originalLog: typeof console.log;
  let originalError: typeof console.error;

  beforeEach(() => {
    program = new Command();
    program.option('-v, --verbose', 'verbose');
    program.option('-q, --quiet', 'quiet');
    registerKnowledgeCommand(program);

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

  it('registers the knowledge command', () => {
    const cmd = program.commands.find((c) => c.name() === 'knowledge');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toMatch(/knowledge/i);
  });

  it('displays results in [file:lines] format', async () => {
    const { searchKnowledge } = await import('../memory/knowledge/search.js');
    vi.mocked(searchKnowledge).mockResolvedValue([
      makeChunkResult('C1', 'docs/ARCHITECTURE.md', 'Three-layer architecture consists of storage, search, and retrieval.', 0.82, 10, 25),
    ]);

    await program.parseAsync(['node', 'ca', 'knowledge', 'architecture']);

    const output = logs.join('\n');
    expect(output).toContain('[docs/ARCHITECTURE.md:L10-L25]');
    expect(output).toContain('Three-layer architecture');
  });

  it('truncates long chunk text to ~200 chars', async () => {
    const longText = 'A'.repeat(300);
    const { searchKnowledge } = await import('../memory/knowledge/search.js');
    vi.mocked(searchKnowledge).mockResolvedValue([
      makeChunkResult('C1', 'docs/a.md', longText, 0.9),
    ]);

    await program.parseAsync(['node', 'ca', 'knowledge', 'test']);

    const output = logs.join('\n');
    expect(output).toContain('...');
    // Truncated text should be around 200 chars, not 300
    expect(output.length).toBeLessThan(longText.length);
  });

  it('shows scores in verbose mode', async () => {
    const { searchKnowledge } = await import('../memory/knowledge/search.js');
    vi.mocked(searchKnowledge).mockResolvedValue([
      makeChunkResult('C1', 'docs/a.md', 'Some text', 0.82, 10, 25),
    ]);

    await program.parseAsync(['node', 'ca', 'knowledge', '--verbose', 'test']);

    const output = logs.join('\n');
    expect(output).toContain('0.82');
  });

  it('does not show scores without verbose', async () => {
    const { searchKnowledge } = await import('../memory/knowledge/search.js');
    vi.mocked(searchKnowledge).mockResolvedValue([
      makeChunkResult('C1', 'docs/a.md', 'Some text', 0.8234, 10, 25),
    ]);

    await program.parseAsync(['node', 'ca', 'knowledge', 'test']);

    const output = logs.join('\n');
    expect(output).not.toContain('score');
  });

  it('shows no results message when empty', async () => {
    const { searchKnowledge } = await import('../memory/knowledge/search.js');
    vi.mocked(searchKnowledge).mockResolvedValue([]);

    await program.parseAsync(['node', 'ca', 'knowledge', 'nonexistent']);

    const output = logs.join('\n');
    expect(output).toMatch(/no.*result|no.*match/i);
  });

  it('respects --limit option', async () => {
    const { searchKnowledge } = await import('../memory/knowledge/search.js');

    await program.parseAsync(['node', 'ca', 'knowledge', '-n', '3', 'test']);

    expect(searchKnowledge).toHaveBeenCalledWith(
      expect.any(String),
      'test',
      expect.objectContaining({ limit: 3 })
    );
  });

  it('releases embedding resources after command completion', async () => {
    const { searchKnowledge } = await import('../memory/knowledge/search.js');
    vi.mocked(searchKnowledge).mockResolvedValue([
      makeChunkResult('C1', 'docs/a.md', 'Some text', 0.82, 10, 25),
    ]);

    await program.parseAsync(['node', 'ca', 'knowledge', 'test']);

    const { unloadEmbeddingResources } = await import('../memory/embeddings/index.js');
    expect(unloadEmbeddingResources).toHaveBeenCalledTimes(1);
  });
});
