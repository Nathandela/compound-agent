/**
 * Tests for knowledge chunk FTS5 search operations.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { openKnowledgeDb, closeKnowledgeDb } from './connection.js';
import { searchChunksKeywordScored } from './search.js';

/** Insert a test chunk directly into the DB */
function insertChunk(
  repo: string,
  id: string,
  filePath: string,
  text: string,
  startLine = 1,
  endLine = 10
): void {
  const db = openKnowledgeDb(repo);
  db.prepare(
    `INSERT INTO chunks (id, file_path, start_line, end_line, content_hash, text, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, filePath, startLine, endLine, `hash_${id}`, text, '2026-01-01T00:00:00Z');
}

describe('searchChunksKeywordScored', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'knowledge-scored-'));
    openKnowledgeDb(repo);
  });

  afterEach(async () => {
    closeKnowledgeDb();
    await rm(repo, { recursive: true, force: true });
  });

  it('returns scored results with BM25 scores in [0, 1]', () => {
    insertChunk(repo, 'C001', 'docs/a.md', 'typescript compiler options and flags');
    insertChunk(repo, 'C002', 'docs/b.md', 'typescript runtime configuration');

    const results = searchChunksKeywordScored(repo, 'typescript', 10);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
      expect(r.chunk).toBeDefined();
      expect(r.chunk.id).toBeDefined();
    }
  });

  it('returns empty array for empty database', () => {
    const results = searchChunksKeywordScored(repo, 'anything', 10);
    expect(results).toEqual([]);
  });

  it('returns empty for sanitized-away query', () => {
    insertChunk(repo, 'C001', 'docs/a.md', 'some content');
    const results = searchChunksKeywordScored(repo, '"*^', 10);
    expect(results).toEqual([]);
  });

  it('returns ScoredChunk objects with chunk and score', () => {
    insertChunk(repo, 'C001', 'docs/a.md', 'authentication with JWT');

    const results = searchChunksKeywordScored(repo, 'authentication', 10);
    expect(results).toHaveLength(1);
    expect(results[0]!.chunk.id).toBe('C001');
    expect(typeof results[0]!.score).toBe('number');
  });

  it('returns matching chunks by keyword', () => {
    insertChunk(repo, 'C001', 'docs/api.md', 'authentication with JWT tokens');
    insertChunk(repo, 'C002', 'docs/setup.md', 'install dependencies with npm');

    const results = searchChunksKeywordScored(repo, 'authentication', 10);
    expect(results).toHaveLength(1);
    expect(results[0]!.chunk.id).toBe('C001');
  });

  it('respects the limit parameter', () => {
    insertChunk(repo, 'C001', 'docs/a.md', 'typescript compiler options');
    insertChunk(repo, 'C002', 'docs/b.md', 'typescript runtime configuration');
    insertChunk(repo, 'C003', 'docs/c.md', 'typescript type system');

    const results = searchChunksKeywordScored(repo, 'typescript', 2);
    expect(results).toHaveLength(2);
  });

  it('does not crash on special FTS5 characters', () => {
    insertChunk(repo, 'C001', 'docs/a.md', 'test content');
    const results = searchChunksKeywordScored(repo, '"hello* ^world"', 10);
    // Should not throw, just returns whatever matches after sanitization
    expect(Array.isArray(results)).toBe(true);
  });

  it('returns complete KnowledgeChunk objects', () => {
    insertChunk(repo, 'C001', 'docs/api.md', 'authentication tokens', 5, 15);

    const results = searchChunksKeywordScored(repo, 'authentication', 10);
    expect(results).toHaveLength(1);
    const chunk = results[0]!.chunk;
    expect(chunk.id).toBe('C001');
    expect(chunk.filePath).toBe('docs/api.md');
    expect(chunk.startLine).toBe(5);
    expect(chunk.endLine).toBe(15);
    expect(chunk.contentHash).toBe('hash_C001');
    expect(chunk.text).toBe('authentication tokens');
    expect(chunk.updatedAt).toBe('2026-01-01T00:00:00Z');
  });
});
