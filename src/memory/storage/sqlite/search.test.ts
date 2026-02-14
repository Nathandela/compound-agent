/**
 * Tests for FTS5 query sanitization and schema validation on reads.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { MemoryItem } from '../../types.js';
import { appendMemoryItem } from '../jsonl.js';

import { closeDb, openDb } from './connection.js';
import { rebuildIndex } from './sync.js';
import { searchKeyword, sanitizeFtsQuery } from './search.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createLesson(id: string, insight: string): MemoryItem {
  return {
    id,
    type: 'lesson',
    trigger: `trigger for ${insight}`,
    insight,
    tags: ['test'],
    source: 'manual' as const,
    context: { tool: 'test', intent: 'testing' },
    created: new Date().toISOString(),
    confirmed: true,
    supersedes: [],
    related: [],
  };
}

// ---------------------------------------------------------------------------
// FTS5 sanitization
// ---------------------------------------------------------------------------

describe('sanitizeFtsQuery', () => {
  it('passes through simple alphanumeric queries', () => {
    expect(sanitizeFtsQuery('hello world')).toBe('hello world');
  });

  it('strips double quotes', () => {
    expect(sanitizeFtsQuery('"unterminated')).not.toContain('"');
  });

  it('strips lone double quote', () => {
    const result = sanitizeFtsQuery('"');
    expect(result).toBe('');
  });

  it('strips FTS5 operators: * ^ ', () => {
    expect(sanitizeFtsQuery('hello* ^world')).toBe('hello world');
  });

  it('removes standalone AND OR NOT tokens', () => {
    expect(sanitizeFtsQuery('foo AND bar')).toBe('foo bar');
    expect(sanitizeFtsQuery('foo OR bar')).toBe('foo bar');
    expect(sanitizeFtsQuery('NOT foo')).toBe('foo');
  });

  it('removes prefix - and + characters', () => {
    expect(sanitizeFtsQuery('-excluded +required')).toBe('excluded required');
  });

  it('returns empty string for query with only special characters', () => {
    expect(sanitizeFtsQuery('"*^')).toBe('');
  });

  it('removes NEAR operator', () => {
    expect(sanitizeFtsQuery('foo NEAR bar')).toBe('foo bar');
  });

  it('handles mixed special chars and valid tokens', () => {
    const result = sanitizeFtsQuery('"hello* world" AND ^test');
    expect(result).not.toContain('"');
    expect(result).not.toContain('*');
    expect(result).not.toContain('^');
    expect(result).toContain('hello');
    expect(result).toContain('world');
    expect(result).toContain('test');
  });
});

// ---------------------------------------------------------------------------
// searchKeyword with bad FTS queries
// ---------------------------------------------------------------------------

describe('searchKeyword FTS error handling', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'compound-agent-fts-'));
    await appendMemoryItem(tempDir, createLesson('L001', 'always write tests'));
    await rebuildIndex(tempDir);
  });

  afterEach(async () => {
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('does not crash on lone double quote query', async () => {
    const results = await searchKeyword(tempDir, '"', 10);
    expect(results).toEqual([]);
  });

  it('does not crash on query with only special chars', async () => {
    const results = await searchKeyword(tempDir, '"*^', 10);
    expect(results).toEqual([]);
  });

  it('still returns results for valid queries', async () => {
    const results = await searchKeyword(tempDir, 'tests', 10);
    expect(results).toHaveLength(1);
  });

  it('sanitizes query before matching', async () => {
    const results = await searchKeyword(tempDir, '"tests"', 10);
    expect(results).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Schema validation on rowToMemoryItem
// ---------------------------------------------------------------------------

describe('rowToMemoryItem schema validation', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'compound-agent-schema-'));
  });

  afterEach(async () => {
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('filters out rows with invalid type field', async () => {
    const db = openDb(tempDir);
    // Insert a row with an invalid type (auto-triggers insert into FTS)
    db.prepare(
      `INSERT INTO lessons (id, type, trigger, insight, tags, source, context, supersedes, related, created, confirmed)
       VALUES ('LBAD001', 'INVALID_TYPE', 'test', 'bad row', '', 'manual', '{"tool":"t","intent":"i"}', '[]', '[]', '2026-01-01', 1)`
    ).run();

    // Also insert a valid row
    await appendMemoryItem(tempDir, createLesson('L001', 'valid lesson'));
    await rebuildIndex(tempDir);

    const results = await searchKeyword(tempDir, 'test OR lesson', 10);
    // Only the valid row should be returned; invalid type row is filtered
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain('LBAD001');
    expect(ids).toContain('L001');
  });

  it('filters out rows with invalid source field', async () => {
    const db = openDb(tempDir);
    // Insert a row with an invalid source (auto-triggers insert into FTS)
    db.prepare(
      `INSERT INTO lessons (id, type, trigger, insight, tags, source, context, supersedes, related, created, confirmed)
       VALUES ('LBAD002', 'lesson', 'test', 'bad source', '', 'INVALID_SOURCE', '{"tool":"t","intent":"i"}', '[]', '[]', '2026-01-01', 1)`
    ).run();

    const results = await searchKeyword(tempDir, 'test', 10);
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain('LBAD002');
  });
});
