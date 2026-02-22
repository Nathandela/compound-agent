/**
 * Tests for knowledge DB connection management.
 *
 * Validates singleton pattern, cross-repo isolation, WAL mode,
 * auto-migration, and closeKnowledgeDb cleanup.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  openKnowledgeDb,
  closeKnowledgeDb,
  KNOWLEDGE_DB_PATH,
} from './connection.js';

describe('openKnowledgeDb', () => {
  let repoA: string;
  let repoB: string;

  beforeEach(async () => {
    repoA = await mkdtemp(join(tmpdir(), 'knowledge-repoA-'));
    repoB = await mkdtemp(join(tmpdir(), 'knowledge-repoB-'));
  });

  afterEach(async () => {
    closeKnowledgeDb();
    await rm(repoA, { recursive: true, force: true });
    await rm(repoB, { recursive: true, force: true });
  });

  it('returns a database instance', () => {
    const db = openKnowledgeDb(repoA, { inMemory: true });
    expect(db).toBeDefined();
  });

  it('returns the same instance for the same repo root (singleton)', () => {
    const db1 = openKnowledgeDb(repoA, { inMemory: true });
    const db2 = openKnowledgeDb(repoA, { inMemory: true });
    expect(db1).toBe(db2);
  });

  it('returns different instances for different repo roots', () => {
    const dbA = openKnowledgeDb(repoA, { inMemory: true });
    const dbB = openKnowledgeDb(repoB, { inMemory: true });
    expect(dbA).not.toBe(dbB);
  });

  it('does not share data between repos', () => {
    const dbA = openKnowledgeDb(repoA, { inMemory: true });
    dbA.prepare(
      `INSERT INTO chunks (id, file_path, start_line, end_line, content_hash, text, updated_at)
       VALUES ('C001', 'test.md', 1, 10, 'abc', 'hello', '2026-01-01')`
    ).run();

    const dbB = openKnowledgeDb(repoB, { inMemory: true });
    const count = dbB.prepare('SELECT COUNT(*) as cnt FROM chunks').get() as { cnt: number };
    expect(count.cnt).toBe(0);
  });

  it('in-memory DB is isolated from file-based DB', () => {
    const dbFile = openKnowledgeDb(repoA);
    const dbMem = openKnowledgeDb(repoA, { inMemory: true });
    expect(dbFile).not.toBe(dbMem);
  });

  it('creates the chunks table with expected columns', () => {
    const db = openKnowledgeDb(repoA, { inMemory: true });
    const info = db.prepare("PRAGMA table_info('chunks')").all() as Array<{ name: string }>;
    const cols = info.map((r) => r.name);
    expect(cols).toContain('id');
    expect(cols).toContain('file_path');
    expect(cols).toContain('start_line');
    expect(cols).toContain('end_line');
    expect(cols).toContain('content_hash');
    expect(cols).toContain('text');
    expect(cols).toContain('embedding');
    expect(cols).toContain('model');
    expect(cols).toContain('updated_at');
  });

  it('exports KNOWLEDGE_DB_PATH constant', () => {
    expect(KNOWLEDGE_DB_PATH).toBe('.claude/.cache/knowledge.sqlite');
  });
});

describe('closeKnowledgeDb', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'knowledge-close-'));
  });

  afterEach(async () => {
    closeKnowledgeDb();
    await rm(repo, { recursive: true, force: true });
  });

  it('closes all connections so re-open returns new instance', () => {
    const dbBefore = openKnowledgeDb(repo, { inMemory: true });
    closeKnowledgeDb();
    const dbAfter = openKnowledgeDb(repo, { inMemory: true });
    expect(dbAfter).not.toBe(dbBefore);
  });

  it('can be called when no connections are open', () => {
    expect(() => closeKnowledgeDb()).not.toThrow();
  });
});

describe('cross-process persistence', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'knowledge-persist-'));
  });

  afterEach(async () => {
    closeKnowledgeDb();
    await rm(repo, { recursive: true, force: true });
  });

  it('data written to file-based DB survives close + reopen', () => {
    // "Process 1": write a chunk
    const db1 = openKnowledgeDb(repo);
    db1.prepare(
      `INSERT INTO chunks (id, file_path, start_line, end_line, content_hash, text, updated_at)
       VALUES ('P001', 'docs/persist.md', 1, 20, 'hashP', 'persistent content', '2026-01-01')`
    ).run();

    // Close all connections (simulates process exit)
    closeKnowledgeDb();

    // "Process 2": reopen and verify data persists
    const db2 = openKnowledgeDb(repo);
    const row = db2.prepare("SELECT id, text FROM chunks WHERE id = 'P001'").get() as { id: string; text: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.id).toBe('P001');
    expect(row!.text).toBe('persistent content');
  });

  it('FTS index persists across close + reopen', () => {
    // "Process 1": insert chunk (FTS auto-indexed by trigger)
    const db1 = openKnowledgeDb(repo);
    db1.prepare(
      `INSERT INTO chunks (id, file_path, start_line, end_line, content_hash, text, updated_at)
       VALUES ('F001', 'docs/fts.md', 1, 10, 'hashF', 'TypeScript compiler architecture', '2026-01-01')`
    ).run();
    closeKnowledgeDb();

    // "Process 2": reopen and search FTS
    const db2 = openKnowledgeDb(repo);
    const results = db2
      .prepare("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH 'TypeScript'")
      .all() as Array<{ rowid: number }>;
    expect(results).toHaveLength(1);
  });

  it('embeddings persist across close + reopen', () => {
    // "Process 1": insert chunk with embedding
    const db1 = openKnowledgeDb(repo);
    const embedding = new Float32Array([0.1, 0.2, 0.3]);
    const embBuffer = Buffer.from(embedding.buffer);
    db1.prepare(
      `INSERT INTO chunks (id, file_path, start_line, end_line, content_hash, text, updated_at, embedding, model)
       VALUES ('E001', 'docs/emb.md', 1, 5, 'hashE', 'embedding test', '2026-01-01', ?, 'test-model')`
    ).run(embBuffer);
    closeKnowledgeDb();

    // "Process 2": reopen and verify embedding
    const db2 = openKnowledgeDb(repo);
    const row = db2.prepare("SELECT embedding, model FROM chunks WHERE id = 'E001'").get() as { embedding: Buffer; model: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.model).toBe('test-model');
    const recovered = new Float32Array(row!.embedding.buffer, row!.embedding.byteOffset, row!.embedding.byteLength / 4);
    expect(recovered[0]).toBeCloseTo(0.1);
    expect(recovered[1]).toBeCloseTo(0.2);
    expect(recovered[2]).toBeCloseTo(0.3);
  });
});

describe('WAL mode for file-based DB', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'knowledge-wal-'));
  });

  afterEach(async () => {
    closeKnowledgeDb();
    await rm(repo, { recursive: true, force: true });
  });

  it('uses WAL journal mode for file-based DBs', () => {
    const db = openKnowledgeDb(repo);
    const mode = db.pragma('journal_mode', { simple: true });
    expect(mode).toBe('wal');
  });
});
