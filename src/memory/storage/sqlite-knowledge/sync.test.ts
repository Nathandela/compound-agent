/**
 * Tests for knowledge chunk sync operations:
 * upsert, delete stale, metadata tracking.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { KnowledgeChunk } from './types.js';
import { openKnowledgeDb, closeKnowledgeDb } from './connection.js';
import {
  upsertChunks,
  deleteChunksByFilePath,
  getIndexedFilePaths,
  getLastIndexTime,
  setLastIndexTime,
} from './sync.js';

function makeChunk(id: string, filePath: string, text: string): KnowledgeChunk {
  return {
    id,
    filePath,
    startLine: 1,
    endLine: 10,
    contentHash: `hash_${id}`,
    text,
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('upsertChunks', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'knowledge-upsert-'));
    openKnowledgeDb(repo);
  });

  afterEach(async () => {
    closeKnowledgeDb();
    await rm(repo, { recursive: true, force: true });
  });

  it('inserts new chunks', () => {
    const chunks = [
      makeChunk('C001', 'docs/api.md', 'authentication tokens'),
      makeChunk('C002', 'docs/setup.md', 'install dependencies'),
    ];
    upsertChunks(repo, chunks);

    const db = openKnowledgeDb(repo);
    const count = db.prepare('SELECT COUNT(*) as cnt FROM chunks').get() as { cnt: number };
    expect(count.cnt).toBe(2);
  });

  it('replaces existing chunks on conflict', () => {
    upsertChunks(repo, [makeChunk('C001', 'docs/api.md', 'old content')]);
    upsertChunks(repo, [makeChunk('C001', 'docs/api.md', 'new content')]);

    const db = openKnowledgeDb(repo);
    const row = db.prepare('SELECT text FROM chunks WHERE id = ?').get('C001') as { text: string };
    expect(row.text).toBe('new content');
  });

  it('handles empty chunks array', () => {
    expect(() => upsertChunks(repo, [])).not.toThrow();
  });

  it('stores embeddings when provided', () => {
    const chunks = [makeChunk('C001', 'docs/api.md', 'test content')];
    const embeddings = new Map<string, Float32Array>();
    embeddings.set('C001', new Float32Array([0.1, 0.2, 0.3]));

    upsertChunks(repo, chunks, embeddings);

    const db = openKnowledgeDb(repo);
    const row = db.prepare('SELECT embedding FROM chunks WHERE id = ?').get('C001') as {
      embedding: Buffer | null;
    };
    expect(row.embedding).not.toBeNull();
  });

  it('indexes text in FTS on upsert', () => {
    upsertChunks(repo, [makeChunk('C001', 'docs/api.md', 'authentication with JWT tokens')]);

    const db = openKnowledgeDb(repo);
    const results = db
      .prepare("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH 'authentication'")
      .all() as Array<{ rowid: number }>;
    expect(results).toHaveLength(1);
  });
});

describe('deleteChunksByFilePath', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'knowledge-delete-'));
    openKnowledgeDb(repo);
  });

  afterEach(async () => {
    closeKnowledgeDb();
    await rm(repo, { recursive: true, force: true });
  });

  it('deletes chunks for specified file paths', () => {
    upsertChunks(repo, [
      makeChunk('C001', 'docs/api.md', 'api content'),
      makeChunk('C002', 'docs/setup.md', 'setup content'),
      makeChunk('C003', 'docs/api.md', 'more api content'),
    ]);

    deleteChunksByFilePath(repo, ['docs/api.md']);

    const db = openKnowledgeDb(repo);
    const count = db.prepare('SELECT COUNT(*) as cnt FROM chunks').get() as { cnt: number };
    expect(count.cnt).toBe(1);

    const remaining = db.prepare('SELECT id FROM chunks').get() as { id: string };
    expect(remaining.id).toBe('C002');
  });

  it('handles empty file paths array', () => {
    upsertChunks(repo, [makeChunk('C001', 'docs/api.md', 'content')]);
    expect(() => deleteChunksByFilePath(repo, [])).not.toThrow();

    const db = openKnowledgeDb(repo);
    const count = db.prepare('SELECT COUNT(*) as cnt FROM chunks').get() as { cnt: number };
    expect(count.cnt).toBe(1);
  });

  it('removes deleted chunks from FTS index', () => {
    upsertChunks(repo, [makeChunk('C001', 'docs/api.md', 'authentication tokens')]);
    deleteChunksByFilePath(repo, ['docs/api.md']);

    const db = openKnowledgeDb(repo);
    const results = db
      .prepare("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH 'authentication'")
      .all() as Array<{ rowid: number }>;
    expect(results).toHaveLength(0);
  });
});

describe('getIndexedFilePaths', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'knowledge-paths-'));
    openKnowledgeDb(repo);
  });

  afterEach(async () => {
    closeKnowledgeDb();
    await rm(repo, { recursive: true, force: true });
  });

  it('returns empty array for empty database', () => {
    const paths = getIndexedFilePaths(repo);
    expect(paths).toEqual([]);
  });

  it('returns distinct file paths', () => {
    upsertChunks(repo, [
      makeChunk('C001', 'docs/api.md', 'content 1'),
      makeChunk('C002', 'docs/api.md', 'content 2'),
      makeChunk('C003', 'docs/setup.md', 'content 3'),
    ]);

    const paths = getIndexedFilePaths(repo);
    expect(paths).toHaveLength(2);
    expect(paths).toContain('docs/api.md');
    expect(paths).toContain('docs/setup.md');
  });
});

describe('getLastIndexTime / setLastIndexTime', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'knowledge-meta-'));
    openKnowledgeDb(repo);
  });

  afterEach(async () => {
    closeKnowledgeDb();
    await rm(repo, { recursive: true, force: true });
  });

  it('returns null when never set', () => {
    const time = getLastIndexTime(repo);
    expect(time).toBeNull();
  });

  it('stores and retrieves index time', () => {
    const timestamp = '2026-01-15T12:00:00Z';
    setLastIndexTime(repo, timestamp);
    const result = getLastIndexTime(repo);
    expect(result).toBe(timestamp);
  });

  it('overwrites previous index time', () => {
    setLastIndexTime(repo, '2026-01-01T00:00:00Z');
    setLastIndexTime(repo, '2026-02-01T00:00:00Z');
    const result = getLastIndexTime(repo);
    expect(result).toBe('2026-02-01T00:00:00Z');
  });
});
