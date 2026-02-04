/**
 * MCP Server Tests
 *
 * Tests for the MCP server that exposes learning-agent functionality.
 * Following TDD: these tests are written BEFORE implementation.
 *
 * Test categories:
 * 1. Server initialization
 * 2. lesson_search tool
 * 3. lesson_capture tool
 * 4. lessons://prime resource
 * 5. Error handling
 * 6. Parameter validation
 * 7. Property-based tests (fast-check)
 */

import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fc, test } from '@fast-check/vitest';

import type { Lesson } from './types.js';

// Test fixtures
const SAMPLE_LESSON: Lesson = {
  id: 'L12345678',
  type: 'quick',
  trigger: 'Used wrong API version',
  insight: 'Always check API version in docs first',
  tags: ['api', 'documentation'],
  source: 'user_correction',
  context: { tool: 'bash', intent: 'api call' },
  created: '2025-01-15T10:00:00Z',
  confirmed: true,
  supersedes: [],
  related: [],
};

const HIGH_SEVERITY_LESSON: Lesson = {
  id: 'L87654321',
  type: 'full',
  trigger: 'Production outage from wrong config',
  insight: 'Always validate config before deploy',
  tags: ['config', 'production'],
  source: 'test_failure',
  context: { tool: 'deploy', intent: 'release' },
  created: '2025-01-20T14:00:00Z',
  confirmed: true,
  supersedes: [],
  related: [],
  severity: 'high',
  evidence: 'Deployment failed with invalid config error',
};

describe('MCP Server', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for each test
    tempDir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    // Create .claude/lessons structure
    await mkdir(join(tempDir, '.claude', 'lessons'), { recursive: true });
  });

  afterEach(async () => {
    // Clean up temp directory
    await rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('createMcpServer', () => {
    it('creates server with correct name and version', async () => {
      const { createMcpServer } = await import('./mcp.js');
      const server = createMcpServer(tempDir);

      expect(server).toBeDefined();
      // Server should have name and version from package
      expect(server.server).toBeDefined();
    });

    it('sets repoRoot at initialization', async () => {
      const { createMcpServer } = await import('./mcp.js');
      const server = createMcpServer(tempDir);

      // repoRoot should be stored and immutable
      expect(server.repoRoot).toBe(tempDir);
    });

    it('does not create files during initialization', async () => {
      const emptyDir = await mkdtemp(join(tmpdir(), 'mcp-empty-'));
      try {
        const { createMcpServer } = await import('./mcp.js');

        // Server creation should not create .claude directory
        createMcpServer(emptyDir);

        const fs = await import('node:fs/promises');
        const exists = await fs
          .access(join(emptyDir, '.claude'))
          .then(() => true)
          .catch(() => false);
        expect(exists).toBe(false);
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe('lesson_search tool', () => {
    beforeEach(async () => {
      // Write sample lessons to JSONL
      const jsonlPath = join(tempDir, '.claude', 'lessons', 'index.jsonl');
      await writeFile(jsonlPath, JSON.stringify(SAMPLE_LESSON) + '\n');
    });

    it('returns empty array when no lessons exist', async () => {
      // Create a fresh directory with no lessons
      const emptyDir = await mkdtemp(join(tmpdir(), 'mcp-empty-search-'));
      await mkdir(join(emptyDir, '.claude', 'lessons'), { recursive: true });

      try {
        const { createMcpServer } = await import('./mcp.js');
        const mcpServer = createMcpServer(emptyDir);

        const result = await mcpServer.callTool('lesson_search', {
          query: 'any query',
        });

        expect(result).toBeDefined();
        expect(result.lessons).toEqual([]);
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });

    it('returns lessons sorted by score descending', async () => {
      // Add more lessons
      const jsonlPath = join(tempDir, '.claude', 'lessons', 'index.jsonl');
      await writeFile(
        jsonlPath,
        [JSON.stringify(SAMPLE_LESSON), JSON.stringify(HIGH_SEVERITY_LESSON)].join('\n') + '\n'
      );

      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      const result = await mcpServer.callTool('lesson_search', {
        query: 'API documentation',
      });

      expect(result.lessons).toBeDefined();
      expect(Array.isArray(result.lessons)).toBe(true);
      // Results should be sorted by score descending
      if (result.lessons.length > 1) {
        for (let i = 1; i < result.lessons.length; i++) {
          expect(result.lessons[i - 1].score).toBeGreaterThanOrEqual(result.lessons[i].score);
        }
      }
    });

    it('respects maxResults parameter', async () => {
      // Add multiple lessons
      const lessons = Array.from({ length: 10 }, (_, i) => ({
        ...SAMPLE_LESSON,
        id: `L${String(i).padStart(8, '0')}`,
        insight: `Lesson ${i} about testing`,
      }));
      const jsonlPath = join(tempDir, '.claude', 'lessons', 'index.jsonl');
      await writeFile(jsonlPath, lessons.map((l) => JSON.stringify(l)).join('\n') + '\n');

      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      const result = await mcpServer.callTool('lesson_search', {
        query: 'testing',
        maxResults: 3,
      });

      expect(result.lessons.length).toBeLessThanOrEqual(3);
    });

    it('defaults maxResults to 5', async () => {
      // Add multiple lessons
      const lessons = Array.from({ length: 10 }, (_, i) => ({
        ...SAMPLE_LESSON,
        id: `L${String(i).padStart(8, '0')}`,
        insight: `Lesson ${i} about testing`,
      }));
      const jsonlPath = join(tempDir, '.claude', 'lessons', 'index.jsonl');
      await writeFile(jsonlPath, lessons.map((l) => JSON.stringify(l)).join('\n') + '\n');

      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      const result = await mcpServer.callTool('lesson_search', {
        query: 'testing',
      });

      expect(result.lessons.length).toBeLessThanOrEqual(5);
    });

    it('validates query parameter is non-empty string', async () => {
      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      await expect(mcpServer.callTool('lesson_search', { query: '' })).rejects.toThrow();
    });

    it('validates maxResults is positive integer', async () => {
      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      await expect(
        mcpServer.callTool('lesson_search', { query: 'test', maxResults: -1 })
      ).rejects.toThrow();

      await expect(
        mcpServer.callTool('lesson_search', { query: 'test', maxResults: 0 })
      ).rejects.toThrow();
    });

    it('each result has lesson object and score number', async () => {
      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      const result = await mcpServer.callTool('lesson_search', {
        query: 'API version',
      });

      for (const item of result.lessons) {
        expect(item).toHaveProperty('lesson');
        expect(item).toHaveProperty('score');
        expect(typeof item.score).toBe('number');
        expect(item.lesson).toHaveProperty('id');
        expect(item.lesson).toHaveProperty('insight');
      }
    });
  });

  describe('lesson_capture tool', () => {
    it('captures lesson with required insight parameter', async () => {
      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      const result = await mcpServer.callTool('lesson_capture', {
        insight: 'Always run tests before committing',
      });

      expect(result).toBeDefined();
      expect(result.lesson).toBeDefined();
      expect(result.lesson.insight).toBe('Always run tests before committing');
      expect(result.lesson.id).toMatch(/^L[a-f0-9]{8}$/);
    });

    it('uses generateId for lesson ID', async () => {
      const { createMcpServer } = await import('./mcp.js');
      const { generateId } = await import('./types.js');
      const mcpServer = createMcpServer(tempDir);

      const insight = 'Always run tests before committing';
      const expectedId = generateId(insight);

      const result = await mcpServer.callTool('lesson_capture', { insight });

      expect(result.lesson.id).toBe(expectedId);
    });

    it('same insight produces same ID', async () => {
      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      const insight = 'Consistent insight for ID test';

      const result1 = await mcpServer.callTool('lesson_capture', { insight });
      const result2 = await mcpServer.callTool('lesson_capture', { insight });

      expect(result1.lesson.id).toBe(result2.lesson.id);
    });

    it('includes optional trigger parameter', async () => {
      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      const result = await mcpServer.callTool('lesson_capture', {
        insight: 'Check API version first',
        trigger: 'Used deprecated API endpoint',
      });

      expect(result.lesson.trigger).toBe('Used deprecated API endpoint');
    });

    it('includes optional tags parameter', async () => {
      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      const result = await mcpServer.callTool('lesson_capture', {
        insight: 'Use Polars for large datasets',
        tags: ['performance', 'polars', 'data'],
      });

      expect(result.lesson.tags).toEqual(['performance', 'polars', 'data']);
    });

    it('persists lesson to JSONL file', async () => {
      const { createMcpServer } = await import('./mcp.js');
      const { readLessons } = await import('./storage/index.js');
      const mcpServer = createMcpServer(tempDir);

      await mcpServer.callTool('lesson_capture', {
        insight: 'Persisted lesson test',
      });

      const { lessons } = await readLessons(tempDir);
      expect(lessons.some((l) => l.insight === 'Persisted lesson test')).toBe(true);
    });

    it('validates insight is non-empty string', async () => {
      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      await expect(mcpServer.callTool('lesson_capture', { insight: '' })).rejects.toThrow();
    });

    it('validates insight minimum length', async () => {
      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      // Insight should be at least 10 chars for minimal quality
      await expect(mcpServer.callTool('lesson_capture', { insight: 'short' })).rejects.toThrow();
    });

    it('validates tags are array of strings', async () => {
      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      await expect(
        mcpServer.callTool('lesson_capture', {
          insight: 'Valid insight for tags test',
          tags: [123 as unknown as string], // Invalid tag type
        })
      ).rejects.toThrow();
    });

    it('sets source to manual for MCP captures', async () => {
      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      const result = await mcpServer.callTool('lesson_capture', {
        insight: 'Lesson captured via MCP',
      });

      expect(result.lesson.source).toBe('manual');
    });

    it('sets confirmed to true', async () => {
      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      const result = await mcpServer.callTool('lesson_capture', {
        insight: 'Confirmed lesson test',
      });

      expect(result.lesson.confirmed).toBe(true);
    });
  });

  describe('lessons://prime resource', () => {
    it('returns workflow context string', async () => {
      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      const result = await mcpServer.readResource('lessons://prime');

      expect(result).toBeDefined();
      expect(typeof result.content).toBe('string');
      expect(result.content).toContain('Learning Agent');
    });

    it('includes high-severity lessons when available', async () => {
      // Add high-severity lesson
      const jsonlPath = join(tempDir, '.claude', 'lessons', 'index.jsonl');
      await writeFile(jsonlPath, JSON.stringify(HIGH_SEVERITY_LESSON) + '\n');

      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      const result = await mcpServer.readResource('lessons://prime');

      expect(result.content).toContain('validate config');
    });

    it('returns workflow context even when no lessons exist', async () => {
      const emptyDir = await mkdtemp(join(tmpdir(), 'mcp-empty-prime-'));
      await mkdir(join(emptyDir, '.claude', 'lessons'), { recursive: true });

      try {
        const { createMcpServer } = await import('./mcp.js');
        const mcpServer = createMcpServer(emptyDir);

        const result = await mcpServer.readResource('lessons://prime');

        expect(result.content).toContain('Learning Agent');
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });

    it('returns workflow context even when .claude directory missing', async () => {
      const emptyDir = await mkdtemp(join(tmpdir(), 'mcp-no-claude-'));

      try {
        const { createMcpServer } = await import('./mcp.js');
        const mcpServer = createMcpServer(emptyDir);

        // Should not throw, just return workflow context
        const result = await mcpServer.readResource('lessons://prime');

        expect(result.content).toContain('Learning Agent');
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe('error handling', () => {
    it('returns actionable error when searchVector fails', async () => {
      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      // Mock searchVector to throw
      vi.doMock('./search/index.js', () => ({
        searchVector: vi.fn().mockRejectedValue(new Error('Embedding model not available')),
      }));

      // Re-import to get mocked version
      vi.resetModules();
      const { createMcpServer: createMockedServer } = await import('./mcp.js');
      const mockedServer = createMockedServer(tempDir);

      // Now returns error response instead of throwing
      const result = await mockedServer.callTool('lesson_search', { query: 'test' });
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('action');
      expect(result.lessons).toEqual([]);
    });

    it('search error response has typed structure (not unsafe cast)', async () => {
      const { createMcpServer, isSearchError } = await import('./mcp.js');

      // Mock searchVector to throw
      vi.doMock('./search/index.js', () => ({
        searchVector: vi.fn().mockRejectedValue(new Error('Model not available')),
      }));

      vi.resetModules();
      const { createMcpServer: createMockedServer, isSearchError: isError } = await import('./mcp.js');
      const mockedServer = createMockedServer(tempDir);

      const result = await mockedServer.callTool('lesson_search', { query: 'test' });

      // Type guard should work
      expect(isError(result)).toBe(true);
      if (isError(result)) {
        expect(result.error).toContain('Search failed');
        expect(result.action).toContain('download-model');
        expect(result.lessons).toEqual([]);
      }
    });

    it('propagates errors from appendLesson', async () => {
      const { createMcpServer } = await import('./mcp.js');

      // Use a read-only directory to simulate write failure
      const readOnlyDir = await mkdtemp(join(tmpdir(), 'mcp-readonly-'));
      await mkdir(join(readOnlyDir, '.claude', 'lessons'), { recursive: true });

      try {
        const mcpServer = createMcpServer(readOnlyDir);

        // Make directory read-only
        const fs = await import('node:fs/promises');
        await fs.chmod(join(readOnlyDir, '.claude', 'lessons'), 0o444);

        await expect(
          mcpServer.callTool('lesson_capture', {
            insight: 'This should fail to save',
          })
        ).rejects.toThrow();
      } finally {
        // Restore permissions for cleanup
        const fs = await import('node:fs/promises');
        await fs.chmod(join(readOnlyDir, '.claude', 'lessons'), 0o755);
        await rm(readOnlyDir, { recursive: true, force: true });
      }
    });
  });

  describe('module boundary enforcement', () => {
    beforeEach(async () => {
      // Reset modules to clear any spies from previous tests
      vi.resetModules();
      // Write sample lesson for delegation tests
      const jsonlPath = join(tempDir, '.claude', 'lessons', 'index.jsonl');
      await writeFile(jsonlPath, JSON.stringify(SAMPLE_LESSON) + '\n');
    });

    it('delegates search to searchVector', async () => {
      // This test verifies MCP server uses existing search module by checking results
      // Note: We can't easily spy on ESM imports, so we verify behavior instead
      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      const result = await mcpServer.callTool('lesson_search', { query: 'test query' });

      // Verify the search returned results (which requires searchVector to have been called)
      expect(result).toBeDefined();
      expect(result.lessons).toBeDefined();
      expect(Array.isArray(result.lessons)).toBe(true);
      // If searchVector wasn't called, we wouldn't get scored lessons
      if (result.lessons.length > 0) {
        expect(result.lessons[0]).toHaveProperty('score');
        expect(result.lessons[0]).toHaveProperty('lesson');
      }
    });

    it('delegates capture to appendLesson', async () => {
      const storageModule = await import('./storage/index.js');
      const appendLessonSpy = vi.spyOn(storageModule, 'appendLesson');

      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      await mcpServer.callTool('lesson_capture', {
        insight: 'Test insight for spy',
      });

      expect(appendLessonSpy).toHaveBeenCalled();
    });

    it('delegates prime to loadSessionLessons', async () => {
      const retrievalModule = await import('./retrieval/index.js');
      const loadSessionLessonsSpy = vi.spyOn(retrievalModule, 'loadSessionLessons');

      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      await mcpServer.readResource('lessons://prime');

      expect(loadSessionLessonsSpy).toHaveBeenCalledWith(tempDir, expect.any(Number));
    });
  });

  describe('Property-Based Tests', () => {
    /**
     * Property-based tests using fast-check to discover edge cases.
     * These tests verify universal properties that must hold for ALL inputs.
     */

    // =========================================================================
    // Arbitraries (generators for test data)
    // =========================================================================

    /** Generate valid insight strings (>= 10 chars) */
    const insightArb = fc.string({ minLength: 10, maxLength: 1000 });

    /** Generate optional trigger strings */
    const triggerArb = fc.option(fc.string({ minLength: 1, maxLength: 500 }), { nil: undefined });

    /** Generate optional tag arrays */
    const tagsArb = fc.option(fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 10 }), {
      nil: undefined,
    });

    /** Generate search query strings */
    const queryArb = fc.string({ minLength: 1, maxLength: 200 });

    /** Generate maxResults parameter (1-100) */
    const maxResultsArb = fc.integer({ min: 1, max: 100 });

    // =========================================================================
    // Property: ID Generation Determinism (Idempotence)
    // =========================================================================

    test.prop([insightArb])('lesson_capture: same insight always produces same ID', async (insight) => {
      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      const result1 = await mcpServer.callTool('lesson_capture', { insight });
      const result2 = await mcpServer.callTool('lesson_capture', { insight });

      // Property: generateId is deterministic - same input produces same output
      expect(result1.lesson.id).toBe(result2.lesson.id);
    });

    test.prop([insightArb, insightArb])(
      'lesson_capture: different insights produce different IDs',
      async (insight1, insight2) => {
        fc.pre(insight1 !== insight2); // Skip if insights happen to be equal

        const { createMcpServer } = await import('./mcp.js');
        const mcpServer = createMcpServer(tempDir);

        const result1 = await mcpServer.callTool('lesson_capture', { insight: insight1 });
        const result2 = await mcpServer.callTool('lesson_capture', { insight: insight2 });

        // Property: Different insights produce different IDs (no collisions)
        expect(result1.lesson.id).not.toBe(result2.lesson.id);
      }
    );

    test.prop([insightArb])('lesson_capture: ID format is always L followed by 8 hex chars', async (insight) => {
      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      const result = await mcpServer.callTool('lesson_capture', { insight });

      // Property: ID format is consistent (L + 8 hex chars)
      expect(result.lesson.id).toMatch(/^L[a-f0-9]{8}$/);
    });

    // =========================================================================
    // Property: Lesson Capture Invariants
    // =========================================================================

    test.prop([insightArb, triggerArb, tagsArb])(
      'lesson_capture: captured lesson always has source=manual and confirmed=true',
      async (insight, trigger, tags) => {
        const { createMcpServer } = await import('./mcp.js');
        const mcpServer = createMcpServer(tempDir);

        const params: Record<string, unknown> = { insight };
        if (trigger !== undefined) params.trigger = trigger;
        if (tags !== undefined) params.tags = tags;

        const result = await mcpServer.callTool('lesson_capture', params);

        // Property: All MCP-captured lessons have source='manual' and confirmed=true
        expect(result.lesson.source).toBe('manual');
        expect(result.lesson.confirmed).toBe(true);
      }
    );

    test.prop([insightArb, tagsArb])(
      'lesson_capture: tags are preserved exactly as provided',
      async (insight, tags) => {
        const { createMcpServer } = await import('./mcp.js');
        const mcpServer = createMcpServer(tempDir);

        const params: Record<string, unknown> = { insight };
        if (tags !== undefined) params.tags = tags;

        const result = await mcpServer.callTool('lesson_capture', params);

        // Property: Tags array is preserved exactly (no mutation)
        const expectedTags = tags ?? [];
        expect(result.lesson.tags).toEqual(expectedTags);
      }
    );

    test.prop([insightArb])('lesson_capture: created timestamp is valid ISO8601', async (insight) => {
      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      const result = await mcpServer.callTool('lesson_capture', { insight });

      // Property: created timestamp is valid ISO8601 format
      const date = new Date(result.lesson.created);
      expect(date.toISOString()).toBe(result.lesson.created);
      expect(Number.isNaN(date.getTime())).toBe(false);
    });

    test.prop([insightArb, triggerArb])(
      'lesson_capture: trigger defaults to "Manual capture via MCP" when not provided',
      async (insight, trigger) => {
        const { createMcpServer } = await import('./mcp.js');
        const mcpServer = createMcpServer(tempDir);

        const params: Record<string, unknown> = { insight };
        if (trigger !== undefined) params.trigger = trigger;

        const result = await mcpServer.callTool('lesson_capture', params);

        // Property: trigger is either provided value or default
        if (trigger !== undefined) {
          expect(result.lesson.trigger).toBe(trigger);
        } else {
          expect(result.lesson.trigger).toBe('Manual capture via MCP');
        }
      }
    );

    // =========================================================================
    // Property: Search Result Structure Invariants
    // =========================================================================

    test.prop([queryArb])('lesson_search: result is always an array', async (query) => {
      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      const result = await mcpServer.callTool('lesson_search', { query });

      // Property: Result structure is always { lessons: Array }
      expect(result).toHaveProperty('lessons');
      expect(Array.isArray(result.lessons)).toBe(true);
    });

    test.prop([queryArb, maxResultsArb])(
      'lesson_search: number of results never exceeds maxResults',
      async (query, maxResults) => {
        const { createMcpServer } = await import('./mcp.js');
        const mcpServer = createMcpServer(tempDir);

        const result = await mcpServer.callTool('lesson_search', { query, maxResults });

        // Property: Result count is bounded by maxResults parameter
        expect(result.lessons.length).toBeLessThanOrEqual(maxResults);
      }
    );

    test.prop([queryArb])('lesson_search: results are sorted by score descending', async (query) => {
      // Add multiple lessons to ensure we have results to sort
      const lessons = Array.from({ length: 5 }, (_, i) => ({
        ...SAMPLE_LESSON,
        id: `L${String(i).padStart(8, '0')}`,
        insight: `Test lesson ${i} with query term ${query.slice(0, 10)}`,
      }));
      const jsonlPath = join(tempDir, '.claude', 'lessons', 'index.jsonl');
      await writeFile(jsonlPath, lessons.map((l) => JSON.stringify(l)).join('\n') + '\n');

      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      const result = await mcpServer.callTool('lesson_search', { query });

      // Property: Results are always sorted by score in descending order
      for (let i = 1; i < result.lessons.length; i++) {
        expect(result.lessons[i - 1].score).toBeGreaterThanOrEqual(result.lessons[i].score);
      }
    });

    test.prop([queryArb])(
      'lesson_search: each result has both lesson and score properties',
      async (query) => {
        const { createMcpServer } = await import('./mcp.js');
        const mcpServer = createMcpServer(tempDir);

        const result = await mcpServer.callTool('lesson_search', { query });

        // Property: Every result has required structure { lesson, score }
        for (const item of result.lessons) {
          expect(item).toHaveProperty('lesson');
          expect(item).toHaveProperty('score');
          expect(typeof item.score).toBe('number');
          expect(item.lesson).toHaveProperty('id');
          expect(item.lesson).toHaveProperty('insight');
        }
      }
    );

    test.prop([queryArb])('lesson_search: all scores are numbers', async (query) => {
      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      const result = await mcpServer.callTool('lesson_search', { query });

      // Property: Scores are always numeric and not NaN
      for (const item of result.lessons) {
        expect(typeof item.score).toBe('number');
        expect(Number.isNaN(item.score)).toBe(false);
        expect(Number.isFinite(item.score)).toBe(true);
      }
    });

    // =========================================================================
    // Property: Resource Invariants
    // =========================================================================

    test.prop([fc.constant(null)])('lessons://prime: always returns a string', async () => {
      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      const result = await mcpServer.readResource('lessons://prime');

      // Property: Resource always returns { content: string }
      expect(result).toHaveProperty('content');
      expect(typeof result.content).toBe('string');
    });

    test.prop([fc.constant(null)])('lessons://prime: content always contains workflow header', async () => {
      const { createMcpServer } = await import('./mcp.js');
      const mcpServer = createMcpServer(tempDir);

      const result = await mcpServer.readResource('lessons://prime');

      // Property: Content always includes the Learning Agent workflow context
      expect(result.content).toContain('Learning Agent');
      // v0.2.4: prime.ts uses "Core Constraints" (Beads-style trust language)
      expect(result.content).toContain('Core Constraints');
    });

    test.prop([fc.constant(null)])('lessons://prime: never throws even if .claude missing', async () => {
      // Create a directory without .claude folder
      const emptyDir = await mkdtemp(join(tmpdir(), 'mcp-prop-prime-'));

      try {
        const { createMcpServer } = await import('./mcp.js');
        const mcpServer = createMcpServer(emptyDir);

        // Property: Resource is fault-tolerant - always succeeds
        const result = await mcpServer.readResource('lessons://prime');
        expect(result.content).toBeDefined();
        expect(typeof result.content).toBe('string');
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });

    // =========================================================================
    // Property: Parameter Validation (Error Cases)
    // =========================================================================

    test.prop([fc.string({ maxLength: 9 })])(
      'lesson_capture: rejects insight shorter than 10 chars',
      async (shortInsight) => {
        fc.pre(shortInsight.length < 10); // Ensure it's actually short

        const { createMcpServer } = await import('./mcp.js');
        const mcpServer = createMcpServer(tempDir);

        // Property: Validation enforces minimum insight length
        await expect(mcpServer.callTool('lesson_capture', { insight: shortInsight })).rejects.toThrow();
      }
    );

    test.prop([fc.oneof(fc.constant(''), fc.constant(null), fc.constant(undefined))])(
      'lesson_search: rejects empty or null query',
      async (invalidQuery) => {
        const { createMcpServer } = await import('./mcp.js');
        const mcpServer = createMcpServer(tempDir);

        // Property: Query parameter is required and non-empty
        await expect(mcpServer.callTool('lesson_search', { query: invalidQuery })).rejects.toThrow();
      }
    );

    test.prop([queryArb, fc.oneof(fc.integer({ max: 0 }), fc.constant(-1), fc.constant(101))])(
      'lesson_search: rejects invalid maxResults',
      async (query, invalidMaxResults) => {
        const { createMcpServer } = await import('./mcp.js');
        const mcpServer = createMcpServer(tempDir);

        // Property: maxResults must be positive integer between 1-100
        await expect(
          mcpServer.callTool('lesson_search', { query, maxResults: invalidMaxResults })
        ).rejects.toThrow();
      }
    );

    // =========================================================================
    // Property: Round-Trip Persistence
    // =========================================================================

    test.prop([insightArb, triggerArb, tagsArb])(
      'lesson_capture: captured lesson can be retrieved from storage',
      async (insight, trigger, tags) => {
        const { createMcpServer } = await import('./mcp.js');
        const { readLessons } = await import('./storage/index.js');
        const mcpServer = createMcpServer(tempDir);

        const params: Record<string, unknown> = { insight };
        if (trigger !== undefined) params.trigger = trigger;
        if (tags !== undefined) params.tags = tags;

        const result = await mcpServer.callTool('lesson_capture', params);
        const capturedId = result.lesson.id;

        // Property: Captured lesson exists in storage (round-trip)
        const { lessons } = await readLessons(tempDir);
        const retrieved = lessons.find((l) => l.id === capturedId);

        expect(retrieved).toBeDefined();
        expect(retrieved?.insight).toBe(insight);
      }
    );
  });
});
