/**
 * Tests for the knowledge index-docs CLI command.
 *
 * Written BEFORE implementation (TDD).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { unloadEmbeddingResources } from '../memory/embeddings/index.js';
import { openKnowledgeDb, closeKnowledgeDb } from '../memory/storage/sqlite-knowledge/connection.js';
import { registerKnowledgeIndexCommand } from './knowledge-index.js';

let program: Command;
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let repoRoot: string;

// Mock getRepoRoot to return our temp directory
vi.mock('../cli-utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cli-utils.js')>();
  return {
    ...actual,
    getRepoRoot: () => repoRoot,
  };
});

beforeEach(async () => {
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  repoRoot = await mkdtemp(join(tmpdir(), 'knowledge-cli-'));
  openKnowledgeDb(repoRoot, { inMemory: true });

  program = new Command();
  program.exitOverride();
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  await unloadEmbeddingResources();
  closeKnowledgeDb();
  vi.restoreAllMocks();
  const { rm } = await import('node:fs/promises');
  await rm(repoRoot, { recursive: true, force: true });
});

/** Helper: create a doc file in temp repo */
async function createDocFile(relativePath: string, content: string): Promise<void> {
  const fullPath = join(repoRoot, relativePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  await mkdir(dir, { recursive: true });
  await writeFile(fullPath, content, 'utf-8');
}

describe('embed-worker command', () => {
  it('registers hidden embed-worker command that calls runBackgroundEmbed', async () => {
    // Mock runBackgroundEmbed to avoid actual embedding
    const embedBgModule = await import('../memory/knowledge/embed-background.js');
    const runBgSpy = vi.spyOn(embedBgModule, 'runBackgroundEmbed').mockResolvedValue();

    registerKnowledgeIndexCommand(program);

    // Command should exist but be hidden
    const cmd = program.commands.find((c) => c.name() === 'embed-worker');
    expect(cmd).toBeDefined();

    // Parse and invoke (use repoRoot which is a real temp directory)
    await program.parseAsync(['node', 'test', 'embed-worker', repoRoot]);
    expect(runBgSpy).toHaveBeenCalledWith(repoRoot);

    runBgSpy.mockRestore();
  });
});

describe('index-docs command', () => {
  it('registers the index-docs command', () => {
    registerKnowledgeIndexCommand(program);
    const cmd = program.commands.find((c) => c.name() === 'index-docs');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toContain('docs');
  });

  it('outputs summary stats after indexing', async () => {
    await createDocFile('docs/test.md', '# Test\n\nSome content.');
    registerKnowledgeIndexCommand(program);
    await program.parseAsync(['node', 'test', 'index-docs']);

    const allOutput = logSpy.mock.calls.map((c) => String(c.join(' '))).join('\n');
    expect(allOutput).toContain('Indexing');
    expect(allOutput).toMatch(/\d+ file/);
    expect(allOutput).toMatch(/\d+ chunk/);
  });

  it('accepts --force flag', async () => {
    await createDocFile('docs/test.md', '# Test');
    registerKnowledgeIndexCommand(program);

    // First index
    await program.parseAsync(['node', 'test', 'index-docs']);
    logSpy.mockClear();

    // Force re-index via new program instance
    const program2 = new Command();
    program2.exitOverride();
    registerKnowledgeIndexCommand(program2);
    await program2.parseAsync(['node', 'test', 'index-docs', '--force']);

    const allOutput = logSpy.mock.calls.map((c) => String(c.join(' '))).join('\n');
    // Should show files indexed (not skipped)
    expect(allOutput).toMatch(/1 file/);
  });

  it('handles missing docs/ gracefully', async () => {
    registerKnowledgeIndexCommand(program);
    await program.parseAsync(['node', 'test', 'index-docs']);

    const allOutput = logSpy.mock.calls.map((c) => String(c.join(' '))).join('\n');
    // Should complete without errors, showing 0 files
    expect(allOutput).toMatch(/0 file/);
  });

  it('accepts --embed flag without error', async () => {
    // Mock indexDocs to avoid loading native embedding model in thread pool
    const indexingModule = await import('../memory/knowledge/index.js');
    vi.spyOn(indexingModule, 'indexDocs').mockResolvedValueOnce({
      filesIndexed: 1, filesSkipped: 0, filesErrored: 0,
      chunksCreated: 2, chunksDeleted: 0, chunksEmbedded: 0, durationMs: 50,
    });

    registerKnowledgeIndexCommand(program);
    // Should not throw
    await program.parseAsync(['node', 'test', 'index-docs', '--embed']);
  });

  it('displays embedding count when chunks are embedded', async () => {
    // Mock indexDocs to return a result with chunksEmbedded > 0
    const indexingModule = await import('../memory/knowledge/index.js');
    vi.spyOn(indexingModule, 'indexDocs').mockResolvedValueOnce({
      filesIndexed: 1, filesSkipped: 0, filesErrored: 0,
      chunksCreated: 2, chunksDeleted: 0, chunksEmbedded: 5, durationMs: 100,
    });

    registerKnowledgeIndexCommand(program);
    await program.parseAsync(['node', 'test', 'index-docs', '--embed']);

    const allOutput = logSpy.mock.calls.map((c) => String(c.join(' '))).join('\n');
    expect(allOutput).toContain('embedded');
  });

  it('does not display embedding count when zero', async () => {
    await createDocFile('docs/test.md', '# Test');
    registerKnowledgeIndexCommand(program);
    await program.parseAsync(['node', 'test', 'index-docs']);  // no --embed

    const allOutput = logSpy.mock.calls.map((c) => String(c.join(' '))).join('\n');
    expect(allOutput).not.toContain('embedded');
  });
});

describe('index-docs conditional withEmbedding (R3)', () => {
  it('R3.1: without --embed, indexDocs is called directly without withEmbedding', async () => {
    const indexingModule = await import('../memory/knowledge/index.js');
    const embeddingModule = await import('../memory/embeddings/index.js');

    const indexDocsSpy = vi.spyOn(indexingModule, 'indexDocs').mockResolvedValueOnce({
      filesIndexed: 1, filesSkipped: 0, filesErrored: 0,
      chunksCreated: 2, chunksDeleted: 0, chunksEmbedded: 0, durationMs: 50,
    });
    const withEmbeddingSpy = vi.spyOn(embeddingModule, 'withEmbedding');

    registerKnowledgeIndexCommand(program);
    await program.parseAsync(['node', 'test', 'index-docs']);

    expect(indexDocsSpy).toHaveBeenCalledOnce();
    expect(withEmbeddingSpy).not.toHaveBeenCalled();

    indexDocsSpy.mockRestore();
    withEmbeddingSpy.mockRestore();
  });

  it('R3.2: with --embed, indexDocs is wrapped in withEmbedding', async () => {
    const indexingModule = await import('../memory/knowledge/index.js');
    const embeddingModule = await import('../memory/embeddings/index.js');

    const indexDocsSpy = vi.spyOn(indexingModule, 'indexDocs').mockResolvedValueOnce({
      filesIndexed: 1, filesSkipped: 0, filesErrored: 0,
      chunksCreated: 2, chunksDeleted: 0, chunksEmbedded: 3, durationMs: 100,
    });
    const withEmbeddingSpy = vi.spyOn(embeddingModule, 'withEmbedding').mockImplementation(
      async (fn) => fn(),
    );

    registerKnowledgeIndexCommand(program);
    await program.parseAsync(['node', 'test', 'index-docs', '--embed']);

    expect(withEmbeddingSpy).toHaveBeenCalledOnce();
    expect(indexDocsSpy).toHaveBeenCalledOnce();
    // Verify embed: true is passed to indexDocs
    expect(indexDocsSpy).toHaveBeenCalledWith(expect.any(String), { force: undefined, embed: true });

    indexDocsSpy.mockRestore();
    withEmbeddingSpy.mockRestore();
  });

  it('R3.3: closeKnowledgeDb is called in finally for both paths', async () => {
    const indexingModule = await import('../memory/knowledge/index.js');
    const knowledgeDbModule = await import('../memory/storage/sqlite-knowledge/connection.js');

    const indexDocsSpy = vi.spyOn(indexingModule, 'indexDocs').mockResolvedValueOnce({
      filesIndexed: 0, filesSkipped: 0, filesErrored: 0,
      chunksCreated: 0, chunksDeleted: 0, chunksEmbedded: 0, durationMs: 10,
    });
    const closeDbSpy = vi.spyOn(knowledgeDbModule, 'closeKnowledgeDb');

    // Test without --embed
    registerKnowledgeIndexCommand(program);
    await program.parseAsync(['node', 'test', 'index-docs']);

    expect(closeDbSpy).toHaveBeenCalled();
    closeDbSpy.mockClear();

    // Test with --embed (new program instance)
    const program2 = new Command();
    program2.exitOverride();

    const embeddingModule = await import('../memory/embeddings/index.js');
    vi.spyOn(embeddingModule, 'withEmbedding').mockImplementation(async (fn) => fn());
    indexDocsSpy.mockResolvedValueOnce({
      filesIndexed: 0, filesSkipped: 0, filesErrored: 0,
      chunksCreated: 0, chunksDeleted: 0, chunksEmbedded: 0, durationMs: 10,
    });

    registerKnowledgeIndexCommand(program2);
    await program2.parseAsync(['node', 'test', 'index-docs', '--embed']);

    expect(closeDbSpy).toHaveBeenCalled();

    indexDocsSpy.mockRestore();
    closeDbSpy.mockRestore();
  });

  it('R3.1+: without --embed, withEmbedding is not called at all', async () => {
    const indexingModule = await import('../memory/knowledge/index.js');
    const embeddingModule = await import('../memory/embeddings/index.js');

    vi.spyOn(indexingModule, 'indexDocs').mockResolvedValueOnce({
      filesIndexed: 1, filesSkipped: 0, filesErrored: 0,
      chunksCreated: 1, chunksDeleted: 0, chunksEmbedded: 0, durationMs: 20,
    });
    const withEmbeddingSpy = vi.spyOn(embeddingModule, 'withEmbedding');

    registerKnowledgeIndexCommand(program);
    await program.parseAsync(['node', 'test', 'index-docs']);

    // withEmbedding should NOT have been called — no ONNX overhead
    expect(withEmbeddingSpy).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('R3.1: without --embed, embed option is passed as false to indexDocs', async () => {
    const indexingModule = await import('../memory/knowledge/index.js');

    const indexDocsSpy = vi.spyOn(indexingModule, 'indexDocs').mockResolvedValueOnce({
      filesIndexed: 0, filesSkipped: 0, filesErrored: 0,
      chunksCreated: 0, chunksDeleted: 0, chunksEmbedded: 0, durationMs: 10,
    });

    registerKnowledgeIndexCommand(program);
    await program.parseAsync(['node', 'test', 'index-docs']);

    expect(indexDocsSpy).toHaveBeenCalledWith(expect.any(String), { force: undefined, embed: false });

    indexDocsSpy.mockRestore();
  });
});
