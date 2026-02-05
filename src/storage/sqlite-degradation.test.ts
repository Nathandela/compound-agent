/**
 * Tests for SQLite graceful degradation when better-sqlite3 fails to load.
 *
 * This test suite verifies that the learning agent continues to function
 * in JSONL-only mode when SQLite is unavailable (e.g., due to native
 * binding compilation failures in downstream projects).
 *
 * Invariants tested:
 * 1. No crash on module load failure
 * 2. No data loss (JSONL operations work)
 * 3. No silent failures (warning logged exactly once)
 * 4. Proper degradation patterns for each function
 *
 * NOTE: Uses _setForceUnavailable to simulate SQLite unavailability.
 * This is more reliable than mocking require() calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createQuickLesson, createFullLesson } from '../test-utils.js';
import { appendLesson, readLessons, LESSONS_PATH } from './jsonl.js';
import type { Lesson, Severity, Source } from '../types.js';
import {
  setCachedEmbedding,
  getCachedEmbedding,
  getRetrievalStats,
  searchKeyword,
  rebuildIndex,
  syncIfNeeded,
  closeDb,
} from './sqlite.js';
import { _resetSqliteState, _setForceUnavailable } from './sqlite/test-helpers.js';

describe('SQLite graceful degradation', () => {
  let tempDir: string;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    // Reset SQLite state and force unavailability for degradation tests
    _resetSqliteState();
    _setForceUnavailable(true);
    tempDir = await mkdtemp(join(tmpdir(), 'learning-agent-degradation-'));
    // Spy on console.warn to verify warning is logged
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    closeDb();
    _resetSqliteState(); // This also resets _forceUnavailable
    consoleWarnSpy.mockRestore();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('Invariant 1: No crash on module load failure', () => {
    it('imports sqlite module without crashing', () => {
      // If we got here, the import succeeded despite better-sqlite3 failure
      expect(setCachedEmbedding).toBeDefined();
      expect(getCachedEmbedding).toBeDefined();
      expect(getRetrievalStats).toBeDefined();
      expect(searchKeyword).toBeDefined();
      expect(rebuildIndex).toBeDefined();
      expect(syncIfNeeded).toBeDefined();
    });
  });

  describe('Invariant 2: No data loss (JSONL operations work)', () => {
    it('reads lessons from JSONL regardless of SQLite availability', async () => {
      // Create JSONL file with test data
      const lesson1 = createQuickLesson('L001', 'pandas was slow', {
        trigger: 'Use Polars for large files',
      });
      const lesson2 = createQuickLesson('L002', 'caught bugs earlier', {
        trigger: 'Always write tests first',
      });

      await appendLesson(tempDir, lesson1);
      await appendLesson(tempDir, lesson2);

      // Verify JSONL read still works
      const { lessons } = await readLessons(tempDir);
      expect(lessons).toHaveLength(2);
      expect(lessons[0]!.trigger).toBe('Use Polars for large files');
      expect(lessons[1]!.trigger).toBe('Always write tests first');
    });

    it('appends lessons to JSONL regardless of SQLite availability', async () => {
      const lesson = createQuickLesson('L003', 'prevented runtime bugs', {
        trigger: 'TypeScript strict mode catches errors',
      });

      await appendLesson(tempDir, lesson);

      // Verify lesson was written
      const { lessons } = await readLessons(tempDir);
      expect(lessons).toHaveLength(1);
      expect(lessons[0]!.trigger).toBe('TypeScript strict mode catches errors');
      expect(lessons[0]!.insight).toBe('prevented runtime bugs');
    });

    it('handles multiple JSONL operations sequentially', async () => {
      const lesson1 = createQuickLesson('L004', 'first insight', { trigger: 'First lesson' });
      const lesson2 = createQuickLesson('L005', 'second insight', { trigger: 'Second lesson' });
      const lesson3 = createQuickLesson('L006', 'third insight', { trigger: 'Third lesson' });

      await appendLesson(tempDir, lesson1);
      await appendLesson(tempDir, lesson2);
      await appendLesson(tempDir, lesson3);

      const { lessons } = await readLessons(tempDir);
      expect(lessons).toHaveLength(3);
      expect(lessons.map((l) => l.trigger)).toEqual([
        'First lesson',
        'Second lesson',
        'Third lesson',
      ]);
    });

    it('preserves lesson metadata in JSONL-only mode', async () => {
      const lesson = createQuickLesson('L007', 'Test insight', {
        trigger: 'Test trigger',
        tags: ['testing', 'tdd'],
        confirmed: true,
      });

      await appendLesson(tempDir, lesson);

      const { lessons } = await readLessons(tempDir);
      expect(lessons[0]!.tags).toEqual(['testing', 'tdd']);
      expect(lessons[0]!.confirmed).toBe(true);
    });
  });

  describe('Invariant 3: No silent failures (warning logged)', () => {
    it('logs warning exactly once when SQLite is first accessed', async () => {
      // First SQLite operation should trigger warning
      await setCachedEmbedding(tempDir, 'test-id', new Float32Array([0.1, 0.2]), 'hash123');

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('SQLite unavailable')
      );
    });

    it('does not log duplicate warnings on subsequent operations', async () => {
      // Multiple operations should only log warning once
      await setCachedEmbedding(tempDir, 'id1', new Float32Array([0.1]), 'hash1');
      const result1 = getCachedEmbedding(tempDir, 'id1', 'hash1');
      const stats = getRetrievalStats(tempDir);

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(result1).toBeNull();
      expect(stats).toEqual([]);
    });

    it('warning message indicates JSONL-only mode', async () => {
      await rebuildIndex(tempDir);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/JSONL-only mode/i)
      );
    });
  });

  describe('Invariant 4: Degradation patterns', () => {
    describe('setCachedEmbedding - silent no-op', () => {
      it('returns without error when SQLite unavailable', async () => {
        // Should not throw
        expect(() => {
          setCachedEmbedding(tempDir, 'lesson-123', new Float32Array([0.1, 0.2, 0.3]), 'hash-abc');
        }).not.toThrow();
      });

      it('accepts Float32Array embedding', async () => {
        const embedding = new Float32Array([0.5, 0.6, 0.7]);
        setCachedEmbedding(tempDir, 'test-id', embedding, 'content-hash');
        // Should complete without error
      });

      it('accepts number array embedding', async () => {
        const embedding = [0.1, 0.2, 0.3, 0.4];
        setCachedEmbedding(tempDir, 'test-id', embedding, 'content-hash');
        // Should complete without error
      });
    });

    describe('getCachedEmbedding - returns null', () => {
      it('returns null when SQLite unavailable', async () => {
        const result = getCachedEmbedding(tempDir, 'any-id');
        expect(result).toBeNull();
      });

      it('returns null even with expected hash provided', async () => {
        const result = getCachedEmbedding(tempDir, 'any-id', 'expected-hash-123');
        expect(result).toBeNull();
      });

      it('returns null for all lesson IDs', async () => {
        const ids = ['id1', 'id2', 'id3'];
        for (const id of ids) {
          expect(getCachedEmbedding(tempDir, id)).toBeNull();
        }
      });
    });

    describe('getRetrievalStats - returns empty array', () => {
      it('returns empty array when SQLite unavailable', async () => {
        const stats = getRetrievalStats(tempDir);
        expect(stats).toEqual([]);
      });

      it('returns empty array even when lessons exist in JSONL', async () => {
        // Add lessons to JSONL
        await appendLesson(tempDir, createQuickLesson('L100', 'Insight 1'));
        await appendLesson(tempDir, createQuickLesson('L101', 'Insight 2'));

        // Stats should still be empty (not tracked without SQLite)
        const stats = getRetrievalStats(tempDir);
        expect(stats).toEqual([]);
      });
    });

    describe('searchKeyword - throws clear error', () => {
      it('throws error indicating FTS5 is required', async () => {
        await expect(searchKeyword(tempDir, 'typescript', 10)).rejects.toThrow(
          /FTS5 required/i
        );
      });

      it('error message suggests vector search alternative', async () => {
        await expect(searchKeyword(tempDir, 'test query', 5)).rejects.toThrow(
          /vector search/i
        );
      });

      it('error message mentions SQLite requirement', async () => {
        await expect(searchKeyword(tempDir, 'query', 10)).rejects.toThrow(
          /SQLite/i
        );
      });

      it('throws for various query strings', async () => {
        const queries = ['simple', 'multi word query', 'special-chars!@#'];
        for (const query of queries) {
          await expect(searchKeyword(tempDir, query, 10)).rejects.toThrow();
        }
      });
    });

    describe('rebuildIndex - no-op with warning', () => {
      it('completes without error when SQLite unavailable', async () => {
        await expect(rebuildIndex(tempDir)).resolves.toBeUndefined();
      });

      it('does not create SQLite database file', async () => {
        await rebuildIndex(tempDir);

        // Verify .claude/.cache directory was not created
        const dbPath = join(tempDir, '.claude', '.cache', 'lessons.sqlite');
        await expect(async () => {
          const { access } = await import('node:fs/promises');
          await access(dbPath);
        }).rejects.toThrow();
      });

      it('logs warning about degraded mode', async () => {
        await rebuildIndex(tempDir);

        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('SQLite unavailable')
        );
      });

      it('completes quickly (no actual rebuild work)', async () => {
        const start = Date.now();
        await rebuildIndex(tempDir);
        const duration = Date.now() - start;

        // Should complete in < 100ms (no DB operations)
        expect(duration).toBeLessThan(100);
      });
    });

    describe('syncIfNeeded - returns false immediately', () => {
      it('returns false when SQLite unavailable', async () => {
        const result = await syncIfNeeded(tempDir);
        expect(result).toBe(false);
      });

      it('returns false even when JSONL exists', async () => {
        // Create JSONL file
        await appendLesson(tempDir, createQuickLesson('Test', 'Test insight'));

        const result = await syncIfNeeded(tempDir);
        expect(result).toBe(false);
      });

      it('returns false with force option', async () => {
        const result = await syncIfNeeded(tempDir, { force: true });
        expect(result).toBe(false);
      });

      it('does not attempt to open database', async () => {
        await syncIfNeeded(tempDir);

        // Verify no DB file was created
        const dbPath = join(tempDir, '.claude', '.cache', 'lessons.sqlite');
        await expect(async () => {
          const { access } = await import('node:fs/promises');
          await access(dbPath);
        }).rejects.toThrow();
      });

      it('completes quickly without DB operations', async () => {
        const start = Date.now();
        await syncIfNeeded(tempDir);
        const duration = Date.now() - start;

        expect(duration).toBeLessThan(50);
      });
    });
  });

  describe('Edge cases', () => {
    it('handles empty JSONL file in degraded mode', async () => {
      // Create empty JSONL file with proper directory structure
      const { mkdir } = await import('node:fs/promises');
      const { dirname } = await import('node:path');
      const jsonlPath = join(tempDir, LESSONS_PATH);
      await mkdir(dirname(jsonlPath), { recursive: true });
      await writeFile(jsonlPath, '', 'utf-8');

      const { lessons } = await readLessons(tempDir);
      expect(lessons).toEqual([]);
    });

    it('handles missing JSONL file in degraded mode', async () => {
      // Don't create JSONL file
      const { lessons } = await readLessons(tempDir);
      expect(lessons).toEqual([]);
    });

    it('operates correctly when switching between operations', async () => {
      // Mix of various operations
      await appendLesson(tempDir, createQuickLesson('L200', 'Insight 1'));
      const stats1 = getRetrievalStats(tempDir);
      const cached1 = getCachedEmbedding(tempDir, 'test-id');
      await rebuildIndex(tempDir);
      const synced = await syncIfNeeded(tempDir);
      await appendLesson(tempDir, createQuickLesson('L201', 'Insight 2'));
      const { lessons } = await readLessons(tempDir);

      expect(stats1).toEqual([]);
      expect(cached1).toBeNull();
      expect(synced).toBe(false);
      expect(lessons).toHaveLength(2);
    });

    it('closeDb does not crash in degraded mode', () => {
      expect(() => closeDb()).not.toThrow();
    });

    it('multiple closeDb calls are safe', () => {
      closeDb();
      closeDb();
      closeDb();
      // Should not throw
    });
  });

  describe('Performance in degraded mode', () => {
    it('JSONL operations remain fast', async () => {
      const lessons = Array.from({ length: 100 }, (_, i) =>
        createQuickLesson(`L${1000 + i}`, `Insight ${i}`)
      );

      const start = Date.now();
      for (const lesson of lessons) {
        await appendLesson(tempDir, lesson);
      }
      const writeTime = Date.now() - start;

      const readStart = Date.now();
      const { lessons: allLessons } = await readLessons(tempDir);
      const readTime = Date.now() - readStart;

      // Even with 100 lessons, operations should be fast
      expect(writeTime).toBeLessThan(5000); // 5s for 100 writes
      expect(readTime).toBeLessThan(500); // 500ms for read
      expect(allLessons).toHaveLength(100);
    });

    it('no-op operations complete instantly', async () => {
      const start = Date.now();

      // All these should be no-ops
      setCachedEmbedding(tempDir, 'id1', [0.1, 0.2], 'hash1');
      setCachedEmbedding(tempDir, 'id2', [0.3, 0.4], 'hash2');
      setCachedEmbedding(tempDir, 'id3', [0.5, 0.6], 'hash3');
      await rebuildIndex(tempDir);
      await syncIfNeeded(tempDir);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100); // All no-ops complete in < 100ms
    });
  });

  describe('Error messages quality', () => {
    it('searchKeyword error is actionable', async () => {
      try {
        await searchKeyword(tempDir, 'test', 10);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        const message = (err as Error).message;

        // Error should mention:
        // 1. What's needed (SQLite/FTS5)
        // 2. Alternative (vector search)
        expect(message).toMatch(/SQLite|FTS5/i);
        expect(message).toMatch(/vector/i);
      }
    });

    it('warning message is informative', async () => {
      await rebuildIndex(tempDir);

      const warnCall = consoleWarnSpy.mock.calls[0];
      expect(warnCall).toBeDefined();

      const message = warnCall![0] as string;
      expect(message).toMatch(/SQLite.*unavailable/i);
      expect(message).toMatch(/JSONL-only/i);
    });
  });
});

// ============================================================================
// Property-Based Tests (fast-check)
// ============================================================================
//
// These property-based tests validate the SQLite graceful degradation invariants:
// 1. Data integrity - all lessons written to JSONL are readable
// 2. No data loss - JSONL round-trip preserves all lesson fields
// 3. Idempotent degradation - multiple calls produce consistent results
// 4. Performance bounded - operations complete within reasonable time
//
// See: doc/invariants/sqlite_graceful_degradation_invariants.md
// ============================================================================

describe('Property-Based Tests: SQLite Graceful Degradation', () => {
  let tempDir: string;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  // Number of fast-check iterations: 100 in CI, 20 locally for faster feedback
  const FC_RUNS = process.env.CI ? 100 : 20;

  beforeEach(async () => {
    // Reset SQLite state and force unavailability for degradation tests
    _resetSqliteState();
    _setForceUnavailable(true);
    tempDir = await mkdtemp(join(tmpdir(), 'learning-agent-prop-'));
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    closeDb();
    _resetSqliteState(); // This also resets _forceUnavailable
    consoleWarnSpy.mockRestore();
    await rm(tempDir, { recursive: true, force: true });
  });

  // Arbitraries for generating random lesson data
  const sourceArb = fc.constantFrom<Source>(
    'user_correction',
    'self_correction',
    'test_failure',
    'manual'
  );

  const severityArb = fc.constantFrom<Severity>('high', 'medium', 'low');

  const contextArb = fc.record({
    tool: fc.string({ minLength: 1, maxLength: 50 }),
    intent: fc.string({ minLength: 1, maxLength: 100 }),
  });

  // Helper to generate hex ID (L + 8 hex chars)
  const lessonIdArb = fc
    .integer({ min: 0, max: 0xffffffff })
    .map((n) => `L${n.toString(16).padStart(8, '0')}`);

  // Base lesson fields common to all lessons
  const baseLessonFieldsArb = fc.record({
    id: lessonIdArb,
    trigger: fc.string({ minLength: 1, maxLength: 500 }),
    insight: fc.string({ minLength: 1, maxLength: 1000 }),
    tags: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 10 }),
    source: sourceArb,
    context: contextArb,
    created: fc
      .integer({ min: new Date('2020-01-01').getTime(), max: new Date('2030-12-31').getTime() })
      .map((timestamp) => new Date(timestamp).toISOString()),
    confirmed: fc.boolean(),
    supersedes: fc.array(lessonIdArb, { maxLength: 5 }),
    related: fc.array(lessonIdArb, { maxLength: 5 }),
  });

  // Quick lesson arbitrary
  const quickLessonArb = baseLessonFieldsArb.map((base) => ({
    ...base,
    type: 'quick' as const,
  }));

  // Full lesson arbitrary
  const fullLessonArb = baseLessonFieldsArb.chain((base) =>
    fc
      .record({
        evidence: fc.string({ minLength: 1, maxLength: 500 }),
        severity: severityArb,
      })
      .map((extra) => ({
        ...base,
        type: 'full' as const,
        ...extra,
      }))
  );

  // Combined lesson arbitrary
  const lessonArb = fc.oneof(quickLessonArb, fullLessonArb);

  describe('Property 1: Data Integrity (Sequence Write/Read)', () => {
    // Helper to clean JSONL file for each property iteration
    const cleanJsonl = async () => {
      const jsonlPath = join(tempDir, LESSONS_PATH);
      try {
        await rm(jsonlPath, { force: true });
      } catch {
        // File may not exist, that's fine
      }
    };

    test.prop([fc.array(lessonArb, { minLength: 1, maxLength: 50 })], { numRuns: FC_RUNS })(
      'for any sequence of lessons written to JSONL, all lessons are readable',
      async (lessons) => {
        await cleanJsonl();

        // Write all lessons sequentially
        for (const lesson of lessons) {
          await appendLesson(tempDir, lesson);
        }

        // Read all lessons back
        const { lessons: readBack, skippedCount } = await readLessons(tempDir);

        // Should have read all lessons successfully
        expect(skippedCount).toBe(0);

        // Build expected lesson map (last-write-wins by ID)
        const expectedMap = new Map<string, Lesson>();
        for (const lesson of lessons) {
          expectedMap.set(lesson.id, lesson);
        }

        // Verify count matches
        expect(readBack.length).toBe(expectedMap.size);

        // Verify all expected lessons are present
        const expectedLessons = Array.from(expectedMap.values());
        for (const expectedLesson of expectedLessons) {
          const found = readBack.find((l) => l.id === expectedLesson.id);
          expect(found).toBeDefined();
          expect(found).toEqual(expectedLesson);
        }
      }
    );

    test.prop([fc.array(lessonArb, { minLength: 1, maxLength: 20 })], { numRuns: FC_RUNS })(
      'JSONL operations work even when SQLite operations are called',
      async (lessons) => {
        await cleanJsonl();

        // Mix JSONL writes with attempted SQLite operations
        for (let i = 0; i < lessons.length; i++) {
          await appendLesson(tempDir, lessons[i]!);

          // Try SQLite operations (should no-op without crashing)
          if (i % 3 === 0) {
            setCachedEmbedding(tempDir, lessons[i]!.id, [0.1, 0.2, 0.3], 'hash');
          }
          if (i % 5 === 0) {
            getCachedEmbedding(tempDir, lessons[i]!.id);
          }
        }

        // Read should still work
        const { lessons: readBack, skippedCount } = await readLessons(tempDir);
        expect(skippedCount).toBe(0);
        expect(readBack.length).toBeGreaterThan(0);
      }
    );

    test.prop([fc.array(lessonArb, { minLength: 1, maxLength: 30 })], { numRuns: FC_RUNS })(
      'deleted lessons are properly filtered out',
      async (lessons) => {
        await cleanJsonl();

        // Deduplicate by ID (last-write-wins) before testing
        const uniqueMap = new Map<string, Lesson>();
        for (const lesson of lessons) {
          uniqueMap.set(lesson.id, lesson);
        }
        const uniqueLessons = Array.from(uniqueMap.values());

        // Write all lessons
        for (const lesson of uniqueLessons) {
          await appendLesson(tempDir, lesson);
        }

        // Mark some as deleted (append tombstones)
        const deleteCount = Math.floor(uniqueLessons.length / 3);
        const toDelete = uniqueLessons.slice(0, deleteCount);
        for (const lesson of toDelete) {
          await appendLesson(tempDir, { ...lesson, deleted: true });
        }

        // Read back
        const { lessons: readBack } = await readLessons(tempDir);

        // Deleted lessons should not appear
        for (const deleted of toDelete) {
          const found = readBack.find((l) => l.id === deleted.id);
          expect(found).toBeUndefined();
        }

        // Non-deleted lessons should appear
        const notDeleted = uniqueLessons.slice(deleteCount);
        expect(readBack.length).toBe(notDeleted.length);
      }
    );
  });

  describe('Property 2: No Data Loss (Round-Trip)', () => {
    // Helper to clean JSONL file for each property iteration
    const cleanJsonl = async () => {
      const jsonlPath = join(tempDir, LESSONS_PATH);
      try {
        await rm(jsonlPath, { force: true });
      } catch {
        // File may not exist, that's fine
      }
    };

    test.prop([lessonArb], { numRuns: FC_RUNS })(
      'JSONL round-trip preserves all lesson fields',
      async (lesson) => {
        await cleanJsonl();

        // Write lesson
        await appendLesson(tempDir, lesson);

        // Read back
        const { lessons: readBack, skippedCount } = await readLessons(tempDir);

        // Should have exactly one lesson with all fields preserved
        expect(skippedCount).toBe(0);
        expect(readBack).toHaveLength(1);
        expect(readBack[0]).toEqual(lesson);
      }
    );

    test.prop([quickLessonArb], { numRuns: FC_RUNS })(
      'quick lessons preserve all fields through JSONL round-trip',
      async (quickLesson) => {
        await cleanJsonl();

        await appendLesson(tempDir, quickLesson);
        const { lessons: readBack } = await readLessons(tempDir);

        expect(readBack).toHaveLength(1);
        const retrieved = readBack[0]!;

        // Verify all required fields
        expect(retrieved.id).toBe(quickLesson.id);
        expect(retrieved.type).toBe('quick');
        expect(retrieved.trigger).toBe(quickLesson.trigger);
        expect(retrieved.insight).toBe(quickLesson.insight);
        expect(retrieved.tags).toEqual(quickLesson.tags);
        expect(retrieved.source).toBe(quickLesson.source);
        expect(retrieved.context).toEqual(quickLesson.context);
        expect(retrieved.created).toBe(quickLesson.created);
        expect(retrieved.confirmed).toBe(quickLesson.confirmed);
        expect(retrieved.supersedes).toEqual(quickLesson.supersedes);
        expect(retrieved.related).toEqual(quickLesson.related);
      }
    );

    test.prop([fullLessonArb], { numRuns: FC_RUNS })(
      'full lessons preserve all fields including evidence and severity',
      async (fullLesson) => {
        await cleanJsonl();

        await appendLesson(tempDir, fullLesson);
        const { lessons: readBack } = await readLessons(tempDir);

        expect(readBack).toHaveLength(1);
        const retrieved = readBack[0]!;

        // Verify full lesson specific fields
        expect(retrieved.type).toBe('full');
        expect(retrieved.evidence).toBe(fullLesson.evidence);
        expect(retrieved.severity).toBe(fullLesson.severity);

        // Verify all other fields preserved
        expect(retrieved).toEqual(fullLesson);
      }
    );

    test.prop([
      lessonArb,
      fc.integer({ min: 1, max: 5 }),
    ], { numRuns: FC_RUNS })(
      'multiple writes with same ID preserve last write (last-write-wins)',
      async (lesson, updateCount) => {
        await cleanJsonl();

        // Write lesson multiple times with modified insight
        const versions: Lesson[] = [];
        for (let i = 0; i < updateCount; i++) {
          const updated = {
            ...lesson,
            insight: `${lesson.insight} - version ${i}`,
          };
          versions.push(updated);
          await appendLesson(tempDir, updated);
        }

        // Read back
        const { lessons: readBack } = await readLessons(tempDir);

        // Should have only one lesson (last write wins)
        expect(readBack).toHaveLength(1);
        expect(readBack[0]).toEqual(versions[versions.length - 1]);
      }
    );
  });

  describe('Property 3: Idempotent Degradation', () => {
    test.prop([fc.string(), fc.nat(10)], { numRuns: FC_RUNS })(
      'getCachedEmbedding always returns null, regardless of calls',
      (lessonId, callCount) => {
        // Call multiple times
        for (let i = 0; i < callCount; i++) {
          const result = getCachedEmbedding(tempDir, lessonId);
          expect(result).toBeNull();
        }
      }
    );

    test.prop([fc.array(fc.tuple(lessonIdArb, fc.array(fc.float(), { minLength: 3, maxLength: 10 })))], { numRuns: FC_RUNS })(
      'setCachedEmbedding is idempotent (multiple calls do not crash)',
      (embeddings) => {
        // Should not throw for any number of calls
        for (const [id, embedding] of embeddings) {
          expect(() => {
            setCachedEmbedding(tempDir, id, embedding, 'hash');
          }).not.toThrow();
        }

        // All subsequent getCachedEmbedding calls return null
        for (const [id] of embeddings) {
          expect(getCachedEmbedding(tempDir, id)).toBeNull();
        }
      }
    );

    test.prop([fc.nat(10)], { numRuns: FC_RUNS })(
      'getRetrievalStats always returns empty array, regardless of calls',
      (callCount) => {
        for (let i = 0; i < callCount; i++) {
          const stats = getRetrievalStats(tempDir);
          expect(stats).toEqual([]);
        }
      }
    );

    test.prop([fc.nat(5)], { numRuns: FC_RUNS })(
      'rebuildIndex is idempotent (multiple calls do not crash or change state)',
      async (callCount) => {
        for (let i = 0; i < callCount; i++) {
          await expect(rebuildIndex(tempDir)).resolves.toBeUndefined();
        }
      }
    );

    test.prop([fc.nat(5)], { numRuns: FC_RUNS })(
      'syncIfNeeded always returns false, regardless of calls',
      async (callCount) => {
        for (let i = 0; i < callCount; i++) {
          const result = await syncIfNeeded(tempDir);
          expect(result).toBe(false);
        }
      }
    );

    test.prop([fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 10 })], { numRuns: FC_RUNS })(
      'searchKeyword always throws same error, regardless of query',
      async (queries) => {
        // Reset state for each property iteration
        _resetSqliteState();
        _setForceUnavailable(true);

        for (const query of queries) {
          await expect(searchKeyword(tempDir, query, 10)).rejects.toThrow(/FTS5 required/i);
        }
      }
    );
  });

  describe('Property 4: Performance Bounded', () => {
    test.prop([fc.array(lessonArb, { minLength: 1, maxLength: 100 })], { numRuns: FC_RUNS })(
      'JSONL write operations complete within reasonable time',
      async (lessons) => {
        const start = Date.now();

        for (const lesson of lessons) {
          await appendLesson(tempDir, lesson);
        }

        const duration = Date.now() - start;

        // Should complete in reasonable time: < 100ms per lesson
        expect(duration).toBeLessThan(lessons.length * 100);
      }
    );

    test.prop([fc.array(lessonArb, { minLength: 1, maxLength: 100 })], { numRuns: FC_RUNS })(
      'JSONL read operations complete within reasonable time',
      async (lessons) => {
        // Write lessons first
        for (const lesson of lessons) {
          await appendLesson(tempDir, lesson);
        }

        // Measure read time
        const start = Date.now();
        const { lessons: readBack } = await readLessons(tempDir);
        const duration = Date.now() - start;

        // Should complete quickly: < 1000ms for up to 100 lessons
        expect(duration).toBeLessThan(1000);
        expect(readBack.length).toBeGreaterThan(0);
      }
    );

    test.prop([fc.nat(100)], { numRuns: FC_RUNS })(
      'degraded SQLite operations complete instantly',
      (operationCount) => {
        const start = Date.now();

        // Mix of various no-op operations
        for (let i = 0; i < operationCount; i++) {
          setCachedEmbedding(tempDir, `id-${i}`, [0.1, 0.2], 'hash');
          getCachedEmbedding(tempDir, `id-${i}`);
          getRetrievalStats(tempDir);
        }

        const duration = Date.now() - start;

        // All no-ops should complete very quickly
        expect(duration).toBeLessThan(100);
      }
    );

    test.prop([fc.nat(10)], { numRuns: FC_RUNS })(
      'rebuildIndex completes quickly without actual work',
      async (callCount) => {
        const start = Date.now();

        for (let i = 0; i < callCount; i++) {
          await rebuildIndex(tempDir);
        }

        const duration = Date.now() - start;

        // Should be instant (no DB operations)
        expect(duration).toBeLessThan(100);
      }
    );
  });

  describe('Property 5: Warning Logged Exactly Once', () => {
    test.prop([fc.array(lessonIdArb, { minLength: 1, maxLength: 20 })], { numRuns: FC_RUNS })(
      'warning logged exactly once regardless of number of SQLite operations',
      async (ids) => {
        // Reset state for each property iteration (beforeEach only runs once for all iterations)
        _resetSqliteState();
        _setForceUnavailable(true);
        consoleWarnSpy.mockClear();

        // Perform various SQLite operations
        for (const id of ids) {
          setCachedEmbedding(tempDir, id, [0.1, 0.2], 'hash');
          getCachedEmbedding(tempDir, id);
          getRetrievalStats(tempDir);
        }

        await rebuildIndex(tempDir);
        await syncIfNeeded(tempDir);

        // Should have logged warning exactly once
        expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('SQLite unavailable')
        );
      }
    );
  });
});
