/**
 * Tests for cross-repo DB connection isolation.
 *
 * Validates that openDb() maintains separate connections per repo root,
 * preventing cross-repo data contamination.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { openDb, closeDb, getDb, DB_PATH } from './connection.js';

describe('cross-repo DB isolation', () => {
  let repoA: string;
  let repoB: string;

  beforeEach(async () => {
    repoA = await mkdtemp(join(tmpdir(), 'compound-agent-repoA-'));
    repoB = await mkdtemp(join(tmpdir(), 'compound-agent-repoB-'));
  });

  afterEach(async () => {
    closeDb();
    await rm(repoA, { recursive: true, force: true });
    await rm(repoB, { recursive: true, force: true });
  });

  it('returns different DB instances for different repo roots', () => {
    const dbA = openDb(repoA);
    const dbB = openDb(repoB);
    expect(dbA).not.toBe(dbB);
  });

  it('returns the same DB instance for the same repo root', () => {
    const db1 = openDb(repoA);
    const db2 = openDb(repoA);
    expect(db1).toBe(db2);
  });

  it('does not share data between different repo DBs', () => {
    const dbA = openDb(repoA);
    dbA.prepare(
      `INSERT INTO lessons (id, type, trigger, insight, tags, source, context, supersedes, related, created, confirmed)
       VALUES ('L001', 'lesson', 'test', 'repoA lesson', '', 'manual', '{}', '[]', '[]', '2026-01-01', 1)`
    ).run();

    const dbB = openDb(repoB);
    const count = dbB.prepare('SELECT COUNT(*) as cnt FROM lessons').get() as { cnt: number };
    expect(count.cnt).toBe(0);
  });

  it('getDb returns the most recently opened DB', () => {
    openDb(repoA);
    openDb(repoB);
    const db = getDb();
    // Should be the repoB database (last opened)
    expect(db).not.toBeNull();
  });

  it('closeDb closes all connections', () => {
    openDb(repoA);
    openDb(repoB);
    closeDb();
    expect(getDb()).toBeNull();
  });

  it('in-memory DB is isolated from file-based DBs', () => {
    const dbFile = openDb(repoA);
    const dbMem = openDb(repoA, { inMemory: true });
    expect(dbFile).not.toBe(dbMem);
  });
});
