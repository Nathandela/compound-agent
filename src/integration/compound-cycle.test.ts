/**
 * Compound Memory Cycle Integration Tests
 *
 * Validates the MCP memory pipeline:
 * - Capture via memory_capture -> JSONL storage verification
 * - Cross-phase search round-trip (embedding-gated)
 *
 * Tests use real MCP server + real JSONL storage, no mocked business logic.
 */

import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMcpServer } from '../mcp.js';
import type { CompoundAgentMcpServer } from '../mcp.js';
import { isModelUsable } from '../memory/embeddings/model.js';
import { isModelAvailable } from '../memory/embeddings/nomic.js';
import { closeDb, getRetrievalStats } from '../memory/storage/index.js';
import { retrieveForPlan } from '../memory/retrieval/plan.js';
import { readMemoryItems } from '../memory/storage/jsonl.js';
import { shouldSkipEmbeddingTests } from '../test-utils.js';

// Check if embedding tests should be skipped (env var, model unavailable, or runtime unusable)
const modelAvailable = isModelAvailable();
const modelUsability = modelAvailable ? await isModelUsable() : { usable: false as const };
const skipEmbeddings = shouldSkipEmbeddingTests(modelAvailable, modelUsability.usable);

let tempDir: string;
let mcp: CompoundAgentMcpServer;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'compound-cycle-'));
  await mkdir(join(tempDir, '.claude', 'lessons'), { recursive: true });
  mcp = createMcpServer(tempDir);
});

afterEach(async () => {
  closeDb();
  await rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Capture -> Storage verification
// ---------------------------------------------------------------------------

describe('compound capture -> storage', () => {
  it('captured item appears in JSONL with correct fields', async () => {
    const result = await mcp.callTool('memory_capture', {
      insight: 'Use Polars instead of pandas for large files',
      trigger: 'user corrected tool choice',
      tags: ['data', 'performance'],
      type: 'lesson',
      severity: 'high',
      confirmed: true,
      supersedes: [],
      related: [],
    });

    const { items } = await readMemoryItems(tempDir);
    expect(items.length).toBe(1);

    const stored = items[0]!;
    expect(stored.id).toBe(result.item.id);
    expect(stored.insight).toBe('Use Polars instead of pandas for large files');
    expect(stored.trigger).toBe('user corrected tool choice');
    expect(stored.tags).toEqual(['data', 'performance']);
    expect(stored.type).toBe('lesson');
    expect(stored.source).toBe('manual');
    expect(stored.confirmed).toBe(true);
    expect(stored.supersedes).toEqual([]);
    expect(stored.related).toEqual([]);
    expect(new Date(stored.created).toISOString()).toBe(stored.created);
  });

  it('severity is stored at top-level, not inside context', async () => {
    await mcp.callTool('memory_capture', {
      insight: 'Always validate config before deploying to prod',
      severity: 'high',
    });

    const { items } = await readMemoryItems(tempDir);
    const stored = items[0]!;

    expect(stored.severity).toBe('high');
    // severity must NOT be nested inside context
    expect((stored.context as Record<string, unknown>)['severity']).toBeUndefined();
  });

  it('stores lesson type correctly', async () => {
    await mcp.callTool('memory_capture', {
      insight: 'This is a lesson about testing practices',
      type: 'lesson',
    });

    const { items } = await readMemoryItems(tempDir);
    expect(items[0]!.type).toBe('lesson');
    expect(items[0]!.id).toMatch(/^L/);
  });

  it('stores solution type correctly', async () => {
    await mcp.callTool('memory_capture', {
      insight: 'When the DB hangs, restart the connection pool',
      type: 'solution',
    });

    const { items } = await readMemoryItems(tempDir);
    expect(items[0]!.type).toBe('solution');
    expect(items[0]!.id).toMatch(/^S/);
  });

  it('stores pattern type correctly', async () => {
    await mcp.callTool('memory_capture', {
      insight: 'Use Polars instead of pandas for large CSVs',
      type: 'pattern',
      pattern: { bad: 'import pandas as pd', good: 'import polars as pl' },
    });

    const { items } = await readMemoryItems(tempDir);
    expect(items[0]!.type).toBe('pattern');
    expect(items[0]!.id).toMatch(/^P/);
    expect(items[0]!.pattern).toEqual({
      bad: 'import pandas as pd',
      good: 'import polars as pl',
    });
  });

  it('stores preference type correctly', async () => {
    await mcp.callTool('memory_capture', {
      insight: 'Always use pnpm instead of npm in this project',
      type: 'preference',
    });

    const { items } = await readMemoryItems(tempDir);
    expect(items[0]!.type).toBe('preference');
    expect(items[0]!.id).toMatch(/^R/);
  });

  it('persists supersedes and related arrays', async () => {
    await mcp.callTool('memory_capture', {
      insight: 'Improved version of the pandas migration rule',
      supersedes: ['L001aaaaa'],
      related: ['L002bbbbb'],
    });

    const { items } = await readMemoryItems(tempDir);
    expect(items[0]!.supersedes).toEqual(['L001aaaaa']);
    expect(items[0]!.related).toEqual(['L002bbbbb']);
  });

  it('stores confirmed=true when set', async () => {
    await mcp.callTool('memory_capture', {
      insight: 'This insight is confirmed by the user',
      confirmed: true,
    });

    const { items } = await readMemoryItems(tempDir);
    expect(items[0]!.confirmed).toBe(true);
  });

  it('stores confirmed=false when set', async () => {
    await mcp.callTool('memory_capture', {
      insight: 'This insight is not yet confirmed',
      confirmed: false,
    });

    const { items } = await readMemoryItems(tempDir);
    expect(items[0]!.confirmed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Quality filter independence
// ---------------------------------------------------------------------------

describe('quality filter independence', () => {
  it('MCP memory_capture stores vague insights without filtering', async () => {
    // Quality filters are agent-side, NOT in MCP layer.
    // Even a vague insight (>= 10 chars) should be stored.
    const result = await mcp.callTool('memory_capture', {
      insight: 'something about code quality maybe',
    });

    expect(result.item.insight).toBe('something about code quality maybe');

    const { items } = await readMemoryItems(tempDir);
    expect(items.some((i) => i.insight === 'something about code quality maybe')).toBe(true);
  });

  it('stores insight with no tags, no trigger, no severity', async () => {
    const result = await mcp.callTool('memory_capture', {
      insight: 'bare minimum capture test item',
    });

    const { items } = await readMemoryItems(tempDir);
    const stored = items.find((i) => i.id === result.item.id)!;
    expect(stored.tags).toEqual([]);
    expect(stored.trigger).toBe('Manual capture via MCP');
    expect(stored.severity).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Cross-phase: capture -> search round-trip (requires embeddings)
// ---------------------------------------------------------------------------

describe.skipIf(skipEmbeddings)('cross-phase: capture -> search round-trip', () => {
  it('captured item is retrievable via memory_search', async () => {
    await mcp.callTool('memory_capture', {
      insight: 'Use Polars instead of pandas for data processing performance',
      tags: ['data', 'performance'],
      type: 'lesson',
      severity: 'high',
      confirmed: true,
      supersedes: [],
      related: [],
    });

    const searchResult = await mcp.callTool('memory_search', {
      query: 'data processing library choice',
      maxResults: 5,
    });

    expect(searchResult.lessons.length).toBeGreaterThan(0);
    const found = searchResult.lessons.some(
      (r: { lesson: { insight: string } }) =>
        r.lesson.insight.includes('Polars')
    );
    expect(found).toBe(true);
  });

  it('search returns scored results with finalScore', async () => {
    await mcp.callTool('memory_capture', {
      insight: 'Always check API version in documentation before calling',
      type: 'lesson',
    });

    const searchResult = await mcp.callTool('memory_search', {
      query: 'API version documentation',
    });

    for (const r of searchResult.lessons) {
      expect(typeof r.score).toBe('number');
      expect(typeof r.finalScore).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// Plan-influence: capture -> retrieveForPlan (requires embeddings)
// ---------------------------------------------------------------------------

describe.skipIf(skipEmbeddings)('plan-influence: capture -> retrieveForPlan', () => {
  it('item captured via MCP surfaces in plan-time retrieval', async () => {
    // Compound phase captures a high-severity lesson
    await mcp.callTool('memory_capture', {
      insight: 'Always validate JWT expiry before trusting authentication tokens',
      type: 'lesson',
      severity: 'high',
      tags: ['security', 'auth'],
      confirmed: true,
    });

    // Plan phase retrieves relevant items
    const result = await retrieveForPlan(tempDir, 'implement user authentication with JWT tokens');

    expect(result.lessons.length).toBeGreaterThan(0);
    const found = result.lessons.some(
      (r) => r.lesson.insight.includes('JWT')
    );
    expect(found).toBe(true);
  });

  it('retrieveForPlan increments retrieval count for surfaced items', async () => {
    const captured = await mcp.callTool('memory_capture', {
      insight: 'Use parameterized queries to prevent SQL injection attacks',
      type: 'lesson',
      severity: 'high',
      tags: ['security', 'database'],
      confirmed: true,
    });

    const result = await retrieveForPlan(tempDir, 'implement database query layer with SQL');
    expect(result.lessons.length).toBeGreaterThan(0);

    // Retrieval count is tracked in SQLite, not JSONL
    const stats = getRetrievalStats(tempDir);
    const stat = stats.find((s) => s.id === captured.item.id);
    expect(stat).toBeDefined();
    expect(stat!.count).toBeGreaterThanOrEqual(1);
  });
});
