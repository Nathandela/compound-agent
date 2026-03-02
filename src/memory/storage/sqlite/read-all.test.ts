/**
 * Tests for readAllFromSqlite — reads all non-invalidated MemoryItems from
 * the SQLite cache (avoiding a redundant JSONL parse).
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { MemoryItem } from '../../types.js';
import { appendMemoryItem } from '../jsonl.js';

import { closeDb } from './connection.js';
import { rebuildIndex } from './sync.js';
import { readAllFromSqlite } from './search.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createLesson(id: string, insight: string, extra: Partial<MemoryItem> = {}): MemoryItem {
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
    ...extra,
  } as MemoryItem;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('readAllFromSqlite', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'compound-agent-readall-'));
  });

  afterEach(async () => {
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns items matching what is in the JSONL after sync', async () => {
    await appendMemoryItem(tempDir, createLesson('L001', 'always write tests'));
    await appendMemoryItem(tempDir, createLesson('L002', 'prefer Polars over pandas'));
    await rebuildIndex(tempDir);

    const items = readAllFromSqlite(tempDir);

    expect(items).toHaveLength(2);
    const ids = items.map((item) => item.id).sort();
    expect(ids).toEqual(['L001', 'L002']);

    // Verify shape matches MemoryItem
    const l001 = items.find((item) => item.id === 'L001')!;
    expect(l001.type).toBe('lesson');
    expect(l001.trigger).toBe('trigger for always write tests');
    expect(l001.insight).toBe('always write tests');
    expect(l001.tags).toEqual(['test']);
    expect(l001.source).toBe('manual');
    expect(l001.confirmed).toBe(true);
    expect(l001.supersedes).toEqual([]);
    expect(l001.related).toEqual([]);
  });

  it('excludes invalidated items', async () => {
    await appendMemoryItem(tempDir, createLesson('L001', 'valid lesson'));
    await appendMemoryItem(
      tempDir,
      createLesson('L002', 'outdated lesson', {
        invalidatedAt: '2026-01-15T10:30:00.000Z',
        invalidationReason: 'no longer accurate',
      })
    );
    await rebuildIndex(tempDir);

    const items = readAllFromSqlite(tempDir);

    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe('L001');
  });

  it('returns empty array when no items exist', async () => {
    await rebuildIndex(tempDir);
    const items = readAllFromSqlite(tempDir);
    expect(items).toEqual([]);
  });

  it('returns all memory item types (lesson, solution, pattern, preference)', async () => {
    await appendMemoryItem(tempDir, createLesson('L001', 'a lesson'));
    await appendMemoryItem(tempDir, {
      ...createLesson('S001', 'a solution'),
      type: 'solution',
    } as MemoryItem);
    await appendMemoryItem(tempDir, {
      ...createLesson('P001', 'a pattern'),
      type: 'pattern',
      pattern: { bad: 'var x', good: 'const x' },
    } as MemoryItem);
    await appendMemoryItem(tempDir, {
      ...createLesson('R001', 'a preference'),
      type: 'preference',
    } as MemoryItem);
    await rebuildIndex(tempDir);

    const items = readAllFromSqlite(tempDir);
    const types = items.map((item) => item.type).sort();
    expect(types).toEqual(['lesson', 'pattern', 'preference', 'solution']);
  });

  it('preserves optional fields like evidence, severity, and citation', async () => {
    await appendMemoryItem(
      tempDir,
      createLesson('L001', 'detailed lesson', {
        evidence: 'I saw this happen twice',
        severity: 'high',
        citation: { file: 'src/main.ts', line: 42, commit: 'abc123' },
      })
    );
    await rebuildIndex(tempDir);

    const items = readAllFromSqlite(tempDir);
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.evidence).toBe('I saw this happen twice');
    expect(item.severity).toBe('high');
    expect(item.citation).toEqual({ file: 'src/main.ts', line: 42, commit: 'abc123' });
  });

  it('preserves pattern field (bad -> good)', async () => {
    await appendMemoryItem(tempDir, {
      ...createLesson('P001', 'use const'),
      type: 'pattern',
      pattern: { bad: 'let x = 1', good: 'const x = 1' },
    } as MemoryItem);
    await rebuildIndex(tempDir);

    const items = readAllFromSqlite(tempDir);
    expect(items).toHaveLength(1);
    expect(items[0]!.pattern).toEqual({ bad: 'let x = 1', good: 'const x = 1' });
  });
});
