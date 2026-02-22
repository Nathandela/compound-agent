/**
 * Tests for knowledge DB schema: tables, FTS5, triggers, metadata.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { openKnowledgeDb, closeKnowledgeDb } from './connection.js';
import { KNOWLEDGE_SCHEMA_VERSION } from './schema.js';

describe('KNOWLEDGE_SCHEMA_VERSION', () => {
  it('is a positive integer', () => {
    expect(KNOWLEDGE_SCHEMA_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(KNOWLEDGE_SCHEMA_VERSION)).toBe(true);
  });
});

describe('knowledge schema', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'knowledge-schema-'));
  });

  afterEach(async () => {
    closeKnowledgeDb();
    await rm(repo, { recursive: true, force: true });
  });

  it('creates chunks table', () => {
    const db = openKnowledgeDb(repo, { inMemory: true });
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chunks'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
  });

  it('creates chunks_fts virtual table', () => {
    const db = openKnowledgeDb(repo, { inMemory: true });
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chunks_fts'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
  });

  it('creates metadata table', () => {
    const db = openKnowledgeDb(repo, { inMemory: true });
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='metadata'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
  });

  it('creates index on file_path', () => {
    const db = openKnowledgeDb(repo, { inMemory: true });
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_chunks_file_path'")
      .all() as Array<{ name: string }>;
    expect(indexes).toHaveLength(1);
  });

  it('sets user_version to KNOWLEDGE_SCHEMA_VERSION', () => {
    const db = openKnowledgeDb(repo, { inMemory: true });
    const version = db.pragma('user_version', { simple: true }) as number;
    expect(version).toBe(KNOWLEDGE_SCHEMA_VERSION);
  });
});

describe('FTS5 triggers', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'knowledge-fts-'));
  });

  afterEach(async () => {
    closeKnowledgeDb();
    await rm(repo, { recursive: true, force: true });
  });

  it('auto-indexes on INSERT', () => {
    const db = openKnowledgeDb(repo, { inMemory: true });
    db.prepare(
      `INSERT INTO chunks (id, file_path, start_line, end_line, content_hash, text, updated_at)
       VALUES ('C001', 'docs/readme.md', 1, 10, 'hash1', 'typescript compiler options', '2026-01-01')`
    ).run();

    const results = db
      .prepare("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH 'typescript'")
      .all() as Array<{ rowid: number }>;
    expect(results).toHaveLength(1);
  });

  it('auto-removes from FTS on DELETE', () => {
    const db = openKnowledgeDb(repo, { inMemory: true });
    db.prepare(
      `INSERT INTO chunks (id, file_path, start_line, end_line, content_hash, text, updated_at)
       VALUES ('C001', 'docs/readme.md', 1, 10, 'hash1', 'typescript compiler options', '2026-01-01')`
    ).run();

    db.prepare("DELETE FROM chunks WHERE id = 'C001'").run();

    const results = db
      .prepare("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH 'typescript'")
      .all() as Array<{ rowid: number }>;
    expect(results).toHaveLength(0);
  });

  it('auto-updates FTS on UPDATE', () => {
    const db = openKnowledgeDb(repo, { inMemory: true });
    db.prepare(
      `INSERT INTO chunks (id, file_path, start_line, end_line, content_hash, text, updated_at)
       VALUES ('C001', 'docs/readme.md', 1, 10, 'hash1', 'typescript compiler', '2026-01-01')`
    ).run();

    db.prepare("UPDATE chunks SET text = 'python interpreter' WHERE id = 'C001'").run();

    const oldResults = db
      .prepare("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH 'typescript'")
      .all() as Array<{ rowid: number }>;
    expect(oldResults).toHaveLength(0);

    const newResults = db
      .prepare("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH 'python'")
      .all() as Array<{ rowid: number }>;
    expect(newResults).toHaveLength(1);
  });
});
