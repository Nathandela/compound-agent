/**
 * Tests for prime command - Context recovery with Beads-style trust language.
 *
 * Follows TDD: These tests are written BEFORE implementation.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appendLesson } from '../memory/storage/jsonl.js';
import { closeDb } from '../memory/storage/sqlite/index.js';
import { syncIfNeeded } from '../memory/storage/sqlite/sync.js';
import { createFullLesson, createQuickLesson } from '../test-utils.js';
import { checkForUpdate } from '../update-check.js';
import { getPrimeContext } from './management-prime.js';

vi.mock('../update-check.js', () => ({
  checkForUpdate: vi.fn(),
}));

// Token estimation: ~4 chars per token for English text
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

describe('Prime Command', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'compound-agent-prime-'));
  });

  afterEach(async () => {
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
  });

  // ============================================================================
  // DI-1: Token Budget
  // ============================================================================

  describe('Token Budget (DI-1)', () => {
    it('output is under 2K tokens with zero lessons', async () => {
      const output = await getPrimeContext(tempDir);
      const tokens = estimateTokens(output);
      expect(tokens).toBeLessThan(2000);
    });

    it('output is under 2K tokens with 5 high-severity lessons', async () => {
      // Add 5 high-severity lessons
      for (let i = 1; i <= 5; i++) {
        await appendLesson(
          tempDir,
          createFullLesson(`L00${i}`, `Critical insight number ${i} about testing`, 'high', {
            tags: ['testing', 'important'],
          })
        );
      }

      const output = await getPrimeContext(tempDir);
      const tokens = estimateTokens(output);
      expect(tokens).toBeLessThan(2000);
    });

    it('output is under 2K tokens with long insights', async () => {
      // Add lessons with long insights (approaching 300 chars)
      const longInsight =
        'This is a very detailed lesson about a complex topic that requires extensive explanation ' +
        'including edge cases, error handling, and performance considerations that Claude needs to remember';

      for (let i = 1; i <= 3; i++) {
        await appendLesson(
          tempDir,
          createFullLesson(`L00${i}`, `${longInsight} variant ${i}`, 'high', {
            tags: ['testing', 'important', 'complex'],
          })
        );
      }

      const output = await getPrimeContext(tempDir);
      const tokens = estimateTokens(output);
      expect(tokens).toBeLessThan(2000);
    });
  });

  // ============================================================================
  // DI-2: Output Structure
  // ============================================================================

  describe('Output Structure (DI-2)', () => {
    it('includes trust language guidelines when no lessons exist', async () => {
      const output = await getPrimeContext(tempDir);

      // Trust language markers
      expect(output).toContain('Compound Agent');
      expect(output).toContain('ca learn');
      expect(output).toContain('ca search');
    });

    it('includes Emergency Recall section when high-severity lessons exist', async () => {
      await appendLesson(
        tempDir,
        createFullLesson('L001', 'Use Polars for large files', 'high', {
          tags: ['performance'],
        })
      );

      const output = await getPrimeContext(tempDir);

      expect(output).toContain('[CRITICAL]');
      expect(output).toContain('Mandatory Recall');
    });

    it('omits Emergency Recall section when no high-severity lessons', async () => {
      // Add only medium-severity lesson
      await appendLesson(tempDir, createFullLesson('L001', 'Some medium lesson', 'medium'));

      const output = await getPrimeContext(tempDir);

      // Should NOT contain the Emergency Recall section
      expect(output).not.toContain('[CRITICAL] Mandatory Recall');
      // But should still have trust language
      expect(output).toContain('ca learn');
    });
  });

  // ============================================================================
  // DI-3: Trust Language Patterns
  // ============================================================================

  describe('Trust Language Patterns (DI-3)', () => {
    it('includes explicit prohibitions with Default/Prohibited markers', async () => {
      const output = await getPrimeContext(tempDir);

      // Beads-style prohibition patterns
      expect(output).toMatch(/\*\*Default\*\*/);
      expect(output).toMatch(/\*\*Prohibited\*\*/);
    });

    it('includes NEVER statements for absolute constraints', async () => {
      const output = await getPrimeContext(tempDir);

      // NEVER (uppercase) for absolute constraints
      expect(output).toContain('NEVER');
    });

    it('includes MUST statements for requirements', async () => {
      const output = await getPrimeContext(tempDir);

      expect(output).toContain('MUST');
    });

    it('includes Workflow markers for sequences', async () => {
      const output = await getPrimeContext(tempDir);

      expect(output).toMatch(/\*\*Workflow\*\*/);
    });

    it('uses strong verbs not weak language', async () => {
      const output = await getPrimeContext(tempDir);

      // Should NOT contain weak language
      expect(output.toLowerCase()).not.toMatch(/\btry to\b/);
      expect(output.toLowerCase()).not.toMatch(/\bshould try\b/);
      expect(output.toLowerCase()).not.toMatch(/\bmight want to\b/);
    });
  });

  // ============================================================================
  // DI-4: Emergency Recall Section Format
  // ============================================================================

  describe('Emergency Recall Format (DI-4)', () => {
    it('formats lessons with insight, tags, and date', async () => {
      await appendLesson(
        tempDir,
        createFullLesson('L001', 'Use Polars for large files', 'high', {
          tags: ['performance', 'data'],
          created: '2025-01-28T10:00:00Z',
        })
      );

      const output = await getPrimeContext(tempDir);

      // Check insight appears
      expect(output).toContain('Use Polars for large files');
      // Check tags appear
      expect(output).toContain('performance');
      expect(output).toContain('data');
      // Check date appears (YYYY-MM-DD format)
      expect(output).toContain('2025-01-28');
    });

    it('omits tags section when lesson has no tags', async () => {
      await appendLesson(
        tempDir,
        createFullLesson('L001', 'No tags lesson', 'high', {
          tags: [],
        })
      );

      const output = await getPrimeContext(tempDir);

      expect(output).toContain('No tags lesson');
      // Should NOT have empty parentheses
      expect(output).not.toContain('()');
    });

    it('does NOT include lesson IDs in output', async () => {
      await appendLesson(tempDir, createFullLesson('Labc12345', 'Test lesson', 'high'));

      const output = await getPrimeContext(tempDir);

      // Lesson ID should NOT appear
      expect(output).not.toContain('Labc12345');
      expect(output).not.toContain('[L');
      expect(output).not.toMatch(/L[a-f0-9]{8}/);
    });
  });

  // ============================================================================
  // DI-5: Lesson Integration
  // ============================================================================

  describe('Lesson Integration (DI-5)', () => {
    it('only includes high-severity lessons', async () => {
      await appendLesson(tempDir, createFullLesson('L001', 'High severity insight', 'high'));
      await appendLesson(tempDir, createFullLesson('L002', 'Medium severity insight', 'medium'));
      await appendLesson(tempDir, createFullLesson('L003', 'Low severity insight', 'low'));

      const output = await getPrimeContext(tempDir);

      expect(output).toContain('High severity insight');
      expect(output).not.toContain('Medium severity insight');
      expect(output).not.toContain('Low severity insight');
    });

    it('only includes confirmed lessons', async () => {
      await appendLesson(
        tempDir,
        createFullLesson('L001', 'Confirmed lesson', 'high', { confirmed: true })
      );
      await appendLesson(
        tempDir,
        createFullLesson('L002', 'Unconfirmed lesson', 'high', { confirmed: false })
      );

      const output = await getPrimeContext(tempDir);

      expect(output).toContain('Confirmed lesson');
      expect(output).not.toContain('Unconfirmed lesson');
    });

    it('excludes invalidated lessons', async () => {
      // Add a valid lesson
      await appendLesson(tempDir, createFullLesson('L001', 'Valid lesson', 'high'));

      // Add an invalidated lesson (manually construct to add invalidatedAt)
      const invalidated = {
        ...createFullLesson('L002', 'Invalidated lesson', 'high'),
        invalidatedAt: new Date().toISOString(),
        invalidationReason: 'Was incorrect',
      };
      await appendLesson(tempDir, invalidated);

      const output = await getPrimeContext(tempDir);

      expect(output).toContain('Valid lesson');
      expect(output).not.toContain('Invalidated lesson');
    });

    it('returns most recent lessons first', async () => {
      await appendLesson(
        tempDir,
        createFullLesson('L001', 'Older lesson', 'high', { created: '2025-01-01T10:00:00Z' })
      );
      await appendLesson(
        tempDir,
        createFullLesson('L002', 'Newer lesson', 'high', { created: '2025-01-30T10:00:00Z' })
      );

      const output = await getPrimeContext(tempDir);

      // Newer lesson should appear before older lesson
      const newerIndex = output.indexOf('Newer lesson');
      const olderIndex = output.indexOf('Older lesson');
      expect(newerIndex).toBeLessThan(olderIndex);
    });

    it('limits to 5 lessons maximum', async () => {
      // Add 7 high-severity lessons
      for (let i = 1; i <= 7; i++) {
        await appendLesson(
          tempDir,
          createFullLesson(`L00${i}`, `Lesson number ${i}`, 'high', {
            created: `2025-01-${String(i).padStart(2, '0')}T10:00:00Z`,
          })
        );
      }

      const output = await getPrimeContext(tempDir);

      // Should only have the 5 most recent (lessons 3-7)
      expect(output).toContain('Lesson number 7');
      expect(output).toContain('Lesson number 6');
      expect(output).toContain('Lesson number 5');
      expect(output).toContain('Lesson number 4');
      expect(output).toContain('Lesson number 3');
      // Should NOT have the 2 oldest
      expect(output).not.toContain('Lesson number 1');
      expect(output).not.toContain('Lesson number 2');
    });
  });

  // ============================================================================
  // S3: Never Include Implementation Details
  // ============================================================================

  describe('No Implementation Details (S3)', () => {
    it('does not expose SQLite references', async () => {
      const output = await getPrimeContext(tempDir);
      expect(output.toLowerCase()).not.toContain('sqlite');
    });

    it('does not expose JSONL references', async () => {
      const output = await getPrimeContext(tempDir);
      expect(output.toLowerCase()).not.toContain('jsonl');
    });

    it('does not expose embedding references', async () => {
      const output = await getPrimeContext(tempDir);
      expect(output.toLowerCase()).not.toContain('embedding');
      expect(output.toLowerCase()).not.toContain('vector');
    });
  });

  // ============================================================================
  // S6: Zero Lessons Case
  // ============================================================================

  describe('Zero Lessons (S6)', () => {
    it('returns valid output with no lessons', async () => {
      const output = await getPrimeContext(tempDir);

      // Should still return useful trust language
      expect(output.length).toBeGreaterThan(100);
      expect(output).toContain('Compound Agent');
      expect(output).toContain('ca');
    });

    it('does not throw error with empty repo', async () => {
      await expect(getPrimeContext(tempDir)).resolves.not.toThrow();
    });
  });

  // ============================================================================
  // E5: Lessons Without Tags
  // ============================================================================

  describe('Lessons Without Tags (E5)', () => {
    it('does not show empty parentheses for tagless lessons', async () => {
      await appendLesson(
        tempDir,
        createFullLesson('L001', 'Tagless insight', 'high', { tags: [] })
      );

      const output = await getPrimeContext(tempDir);

      expect(output).toContain('Tagless insight');
      expect(output).not.toContain('()');
      expect(output).not.toContain('( )');
    });
  });

  // ============================================================================
  // CLI-First Mode
  // ============================================================================

  describe('CLI-First Mode', () => {
    it('includes CLI commands in trust language', async () => {
      const output = await getPrimeContext(tempDir);
      expect(output).toContain('npx ca search');
      expect(output).toContain('npx ca learn');
    });

    it('does NOT reference MCP tools', async () => {
      const output = await getPrimeContext(tempDir);
      expect(output).not.toContain('memory_search');
      expect(output).not.toContain('memory_capture');
    });
  });

  // ============================================================================
  // Auto-Sync: Memory index is fresh before loading lessons
  // ============================================================================

  describe('Auto-Sync on Prime (session start freshness)', () => {
    it('syncs SQLite index so searches have fresh data', async () => {
      // 1. Add a lesson and force-sync the SQLite index
      await appendLesson(tempDir, createFullLesson('L001', 'First lesson', 'high'));
      await syncIfNeeded(tempDir, { force: true });

      // 2. Simulate git pull adding a new JSONL entry
      await appendLesson(tempDir, createFullLesson('L002', 'Lesson from git pull', 'high'));

      // 3. Prime should call syncIfNeeded so SQLite is fresh
      await getPrimeContext(tempDir);

      // 4. Verify SQLite was synced — a subsequent syncIfNeeded should be a no-op
      const synced = await syncIfNeeded(tempDir);
      expect(synced).toBe(false); // false means already up-to-date
    });
  });

  describe('Active cook-it Session Injection', () => {
    it('injects phase context when phase state is active', async () => {
      const statePath = join(tempDir, '.claude', '.ca-phase-state.json');
      await mkdir(join(tempDir, '.claude'), { recursive: true });
      await writeFile(
        statePath,
        JSON.stringify({
          cookit_active: true,
          epic_id: 'learning_agent-5dfm',
          current_phase: 'work',
          phase_index: 3,
          skills_read: ['.claude/skills/compound/work/SKILL.md'],
          gates_passed: ['post-plan'],
          started_at: new Date().toISOString(),
        }),
        'utf-8'
      );

      const output = await getPrimeContext(tempDir);
      expect(output).toContain('ACTIVE COOK-IT SESSION');
      expect(output).toContain('learning_agent-5dfm');
      expect(output).toContain('work (3/5)');
      expect(output).toContain('npx ca phase-check start work');
      expect(output).toContain('.claude/skills/compound/work/SKILL.md');
    });

    it('does not inject phase context when cookit_active is false', async () => {
      const statePath = join(tempDir, '.claude', '.ca-phase-state.json');
      await mkdir(join(tempDir, '.claude'), { recursive: true });
      await writeFile(
        statePath,
        JSON.stringify({
          cookit_active: false,
          epic_id: 'learning_agent-5dfm',
          current_phase: 'work',
          phase_index: 3,
          skills_read: [],
          gates_passed: [],
          started_at: new Date().toISOString(),
        }),
        'utf-8'
      );

      const output = await getPrimeContext(tempDir);
      expect(output).not.toContain('ACTIVE COOK-IT SESSION');
    });
  });

  // ============================================================================
  // E6: Special Characters in Insight
  // ============================================================================

  describe('Special Characters (E6)', () => {
    it('handles markdown characters in insights', async () => {
      await appendLesson(
        tempDir,
        createFullLesson('L001', 'Use **Polars** for `large` files', 'high')
      );

      const output = await getPrimeContext(tempDir);

      // Special characters should appear as-is
      expect(output).toContain('Polars');
      expect(output).toContain('large');
    });

    it('handles quotes in insights', async () => {
      await appendLesson(
        tempDir,
        createFullLesson('L001', 'Never use "eval" in production', 'high')
      );

      const output = await getPrimeContext(tempDir);

      expect(output).toContain('Never use "eval" in production');
    });
  });

  // ============================================================================
  // L1: Performance
  // ============================================================================

  describe('Performance (L1)', () => {
    it('completes within 100ms for typical usage', async () => {
      // Add a few lessons
      for (let i = 1; i <= 3; i++) {
        await appendLesson(tempDir, createFullLesson(`L00${i}`, `Lesson ${i}`, 'high'));
      }

      const start = performance.now();
      await getPrimeContext(tempDir);
      const duration = performance.now() - start;

      // Allow 200ms to account for CI variability (target is 100ms)
      expect(duration).toBeLessThan(200);
    });
  });

  // ============================================================================
  // L3: API Stability
  // ============================================================================

  describe('getPrimeContext API (L3)', () => {
    it('returns a string', async () => {
      const output = await getPrimeContext(tempDir);
      expect(typeof output).toBe('string');
    });

    it('is async (returns Promise)', () => {
      const result = getPrimeContext(tempDir);
      expect(result).toBeInstanceOf(Promise);
    });

    it('accepts optional repoRoot parameter', async () => {
      // Should work with explicit repoRoot
      const output = await getPrimeContext(tempDir);
      expect(output).toBeDefined();
    });
  });

  // ============================================================================
  // DI-6: Character Encoding
  // ============================================================================

  describe('Character Encoding (DI-6)', () => {
    it('outputs valid UTF-8', async () => {
      await appendLesson(tempDir, createFullLesson('L001', 'Test lesson', 'high'));

      const output = await getPrimeContext(tempDir);

      // Roundtrip through UTF-8 should be identical
      const roundTripped = Buffer.from(output, 'utf-8').toString('utf-8');
      expect(roundTripped).toBe(output);
    });

    it('handles critical marker in output correctly', async () => {
      await appendLesson(tempDir, createFullLesson('L001', 'Test lesson', 'high'));

      const output = await getPrimeContext(tempDir);

      // Should contain the text-based critical marker from Mandatory Recall header
      expect(output).toContain('[CRITICAL]');
    });
  });

  // ============================================================================
  // Integration: Quick lessons should be excluded
  // ============================================================================

  describe('Quick Lessons Exclusion', () => {
    it('excludes quick lessons from Emergency Recall', async () => {
      // Add a quick lesson (not full)
      await appendLesson(tempDir, createQuickLesson('Q001', 'Quick insight', { tags: ['quick'] }));
      // Add a full high-severity lesson
      await appendLesson(tempDir, createFullLesson('F001', 'Full high insight', 'high'));

      const output = await getPrimeContext(tempDir);

      expect(output).toContain('Full high insight');
      expect(output).not.toContain('Quick insight');
    });
  });

  // ============================================================================
  // Update Notification in Prime
  // ============================================================================

  describe('update notification in prime', () => {
    afterEach(() => {
      vi.mocked(checkForUpdate).mockReset();
    });

    it('includes update section when update is available', async () => {
      vi.mocked(checkForUpdate).mockResolvedValue({
        current: '1.7.2',
        latest: '1.8.0',
        updateAvailable: true,
      });

      const output = await getPrimeContext(tempDir);

      expect(output).toContain('Update Available');
      expect(output).toContain('1.7.2');
      expect(output).toContain('1.8.0');
    });

    it('does not include update section when no update available', async () => {
      vi.mocked(checkForUpdate).mockResolvedValue({
        current: '1.8.0',
        latest: '1.8.0',
        updateAvailable: false,
      });

      const output = await getPrimeContext(tempDir);

      expect(output).not.toContain('Update Available');
    });

    it('does not include update section when check returns null (network error)', async () => {
      vi.mocked(checkForUpdate).mockResolvedValue(null);

      const output = await getPrimeContext(tempDir);

      expect(output).not.toContain('Update Available');
    });

    it('includes both versions and pnpm update command in update section', async () => {
      vi.mocked(checkForUpdate).mockResolvedValue({
        current: '1.7.2',
        latest: '1.8.0',
        updateAvailable: true,
      });

      const output = await getPrimeContext(tempDir);

      expect(output).toContain('1.7.2');
      expect(output).toContain('1.8.0');
      expect(output).toContain('pnpm update --latest compound-agent');
    });
  });
});

// ============================================================================
// Property-Based Tests (fast-check)
// ============================================================================
//
// These tests use fast-check to generate random inputs and verify invariants
// that must hold regardless of input data. Key properties tested:
//
// 1. Token Budget - Output always < 2K tokens (~8000 chars)
// 2. No Lesson IDs - Output never contains lesson ID patterns
// 3. UTF-8 Validity - Output roundtrips through UTF-8 encoding
// 4. Structure Stability - Output always contains trust language markers
// 5. Order Preservation - Lessons appear in recency order (most recent first)
//
// Using fast-check lets us discover edge cases traditional example-based
// tests might miss (e.g., very long insights, special characters, etc.)
// ============================================================================

import { fc, test } from '@fast-check/vitest';

// Number of fast-check iterations: 100 in CI, 20 locally for faster feedback
const FC_RUNS = process.env.CI ? 100 : 20;

describe('Property-Based Tests: Prime Command Invariants', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'compound-agent-prime-prop-'));
  });

  afterEach(async () => {
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
  });

  // ============================================================================
  // Property 1: Token Budget (< 2K tokens)
  // ============================================================================

  describe('Property: Token Budget', () => {
    test.prop(
      [
        fc.array(
          fc.record({
            insight: fc.string({ minLength: 1, maxLength: 1000 }),
            tags: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 10 }),
          }),
          { minLength: 0, maxLength: 10 }
        ),
      ],
      { numRuns: FC_RUNS }
    )('output is always under 2K tokens regardless of lesson count/length', async (lessons) => {
      // Add high-severity lessons
      for (let i = 0; i < lessons.length; i++) {
        await appendLesson(
          tempDir,
          createFullLesson(`L${i.toString().padStart(8, '0')}`, lessons[i].insight, 'high', {
            tags: lessons[i].tags,
          })
        );
      }

      const output = await getPrimeContext(tempDir);
      const tokens = estimateTokens(output);

      expect(tokens).toBeLessThan(2000);
    });

    test.prop(
      [
        fc.array(
          fc.string({ minLength: 100, maxLength: 1000 }), // Long insights
          { minLength: 1, maxLength: 10 }
        ),
      ],
      { numRuns: FC_RUNS }
    )('output stays under budget even with very long insights', async (insights) => {
      for (let i = 0; i < insights.length; i++) {
        await appendLesson(
          tempDir,
          createFullLesson(`L${i.toString().padStart(8, '0')}`, insights[i], 'high')
        );
      }

      const output = await getPrimeContext(tempDir);
      const tokens = estimateTokens(output);

      expect(tokens).toBeLessThan(2000);
    });
  });

  // ============================================================================
  // Property 2: No Lesson IDs in Output
  // ============================================================================

  describe('Property: No Lesson IDs', () => {
    test.prop(
      [
        fc.array(
          fc.record({
            id: fc
              .integer({ min: 0, max: 0xffffffff })
              .map((n) => `L${n.toString(16).padStart(8, '0')}`),
            insight: fc.string({ minLength: 1, maxLength: 500 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
      ],
      { numRuns: FC_RUNS }
    )('output never contains lesson ID patterns (L + hex)', async (lessons) => {
      for (const lesson of lessons) {
        await appendLesson(
          tempDir,
          createFullLesson(lesson.id, lesson.insight, 'high')
        );
      }

      const output = await getPrimeContext(tempDir);

      // Should not contain any lesson IDs
      for (const lesson of lessons) {
        expect(output).not.toContain(lesson.id);
      }

      // Should not match the pattern L[a-f0-9]{8,16}
      const idMatches = output.match(/L[a-f0-9]{8,16}/g);
      expect(idMatches).toBeNull();
    });
  });

  // ============================================================================
  // Property 3: UTF-8 Validity (Round-trip)
  // ============================================================================

  describe('Property: UTF-8 Validity', () => {
    test.prop(
      [
        fc.array(
          fc.record({
            insight: fc.string({ minLength: 1, maxLength: 200 }), // Any valid string
            tags: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 5 }),
          }),
          { minLength: 0, maxLength: 5 }
        ),
      ],
      { numRuns: FC_RUNS }
    )('output roundtrips through UTF-8 encoding', async (lessons) => {
      for (let i = 0; i < lessons.length; i++) {
        await appendLesson(
          tempDir,
          createFullLesson(`L${i.toString().padStart(8, '0')}`, lessons[i].insight, 'high', {
            tags: lessons[i].tags,
          })
        );
      }

      const output = await getPrimeContext(tempDir);

      // Roundtrip through UTF-8 should be identical
      const roundTripped = Buffer.from(output, 'utf-8').toString('utf-8');
      expect(roundTripped).toBe(output);
    });

    test.prop(
      [
        fc.array(
          fc.string({ minLength: 1, maxLength: 200 }).map((s) => {
            // Add special characters that might break encoding
            const specials = ['[!]', '[*]', '[?]', '[+]', '[-]', '[>]', '[#]'];
            return s + specials[Math.floor(Math.random() * specials.length)];
          }),
          { minLength: 0, maxLength: 3 }
        ),
      ],
      { numRuns: FC_RUNS }
    )('output handles special chars correctly', async (insights) => {
      for (let i = 0; i < insights.length; i++) {
        await appendLesson(
          tempDir,
          createFullLesson(`L${i.toString().padStart(8, '0')}`, insights[i], 'high')
        );
      }

      const output = await getPrimeContext(tempDir);

      // Should contain at least the critical marker from Mandatory Recall (if lessons exist)
      if (insights.length > 0) {
        expect(output).toContain('[CRITICAL]');
      }

      // Roundtrip should preserve all characters
      const roundTripped = Buffer.from(output, 'utf-8').toString('utf-8');
      expect(roundTripped).toBe(output);
    });
  });

  // ============================================================================
  // Property 4: Structure Stability (Always Contains Trust Language)
  // ============================================================================

  describe('Property: Structure Stability', () => {
    test.prop(
      [
        fc.array(
          fc.record({
            insight: fc.string({ minLength: 1, maxLength: 500 }),
            tags: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 10 }),
          }),
          { minLength: 0, maxLength: 10 }
        ),
      ],
      { numRuns: FC_RUNS }
    )('output always contains trust language markers', async (lessons) => {
      for (let i = 0; i < lessons.length; i++) {
        await appendLesson(
          tempDir,
          createFullLesson(`L${i.toString().padStart(8, '0')}`, lessons[i].insight, 'high', {
            tags: lessons[i].tags,
          })
        );
      }

      const output = await getPrimeContext(tempDir);

      // Trust language markers (Beads-style patterns)
      expect(output).toContain('Compound Agent');
      expect(output).toMatch(/\*\*Default\*\*/);
      expect(output).toMatch(/\*\*Prohibited\*\*/);
      expect(output).toContain('NEVER');
      expect(output).toContain('MUST');
      expect(output).toMatch(/\*\*Workflow\*\*/);

      // CLI commands
      expect(output).toContain('ca learn');
      expect(output).toContain('ca search');
    });

  });

  // ============================================================================
  // Property 5: No Implementation Details Leak
  // ============================================================================

  describe('Property: No Implementation Details', () => {
    test.prop(
      [
        fc.array(
          fc.string({ minLength: 1, maxLength: 200 }),
          { minLength: 0, maxLength: 5 }
        ),
      ],
      { numRuns: FC_RUNS }
    )('output never contains SQLite/JSONL/embedding references', async (insights) => {
      for (let i = 0; i < insights.length; i++) {
        await appendLesson(
          tempDir,
          createFullLesson(`L${i.toString().padStart(8, '0')}`, insights[i], 'high')
        );
      }

      const output = await getPrimeContext(tempDir);
      const lowerOutput = output.toLowerCase();

      // Check for specific implementation details, not general terms
      // "database health" in CLI description is fine; "sqlite" is not
      expect(lowerOutput).not.toContain('sqlite');
      expect(lowerOutput).not.toContain('jsonl');
      expect(lowerOutput).not.toContain('embedding');
      expect(lowerOutput).not.toContain('vector');
      expect(lowerOutput).not.toContain('compaction level');
    });
  });
});
