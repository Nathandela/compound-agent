/**
 * Tests for the knowledge index-docs CLI command.
 *
 * Written BEFORE implementation (TDD).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
});
