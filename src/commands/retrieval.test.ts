/**
 * Tests for retrieval commands: list, search, check-plan, load-session
 */

import { execSync } from 'node:child_process';
import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { isModelAvailable } from '../embeddings/nomic.js';
import { appendLesson, LESSONS_PATH } from '../storage/jsonl.js';
import { closeDb, rebuildIndex } from '../storage/sqlite.js';
import { createFullLesson, createQuickLesson, daysAgo } from '../test-utils.js';
import { setupCliTestContext } from './test-helpers.js';

// Check model availability at module load time for conditional tests
const modelAvailable = isModelAvailable();

describe('Retrieval Commands', () => {
  const { getTempDir, runCli } = setupCliTestContext();

  describe('list command', () => {
    beforeEach(async () => {
      await appendLesson(getTempDir(), createQuickLesson('L001', 'first lesson'));
      await appendLesson(getTempDir(), createQuickLesson('L002', 'second lesson'));
      await appendLesson(getTempDir(), createQuickLesson('L003', 'third lesson'));
    });

    it('lists lessons', () => {
      const { combined } = runCli('list');
      expect(combined).toContain('first lesson');
      expect(combined).toContain('second lesson');
    });

    it('respects limit option', () => {
      const { combined } = runCli('list -n 1');
      const lines = combined.trim().split('\n').filter((l: string) => l.includes('lesson'));
      expect(lines.length).toBeLessThanOrEqual(2); // Header + 1 lesson
    });

    it('warns about corrupted lessons', async () => {
      // Write corrupted data directly to JSONL (bypasses appendLesson validation)
      const filePath = join(getTempDir(), LESSONS_PATH);
      await appendFile(filePath, 'not valid json\n', 'utf-8');
      await appendFile(filePath, '{"id": "bad", "missing": "fields"}\n', 'utf-8');

      const { combined } = runCli('list');
      expect(combined).toContain('first lesson'); // Valid lessons still shown
      expect(combined.toLowerCase()).toMatch(/warn|skip|corrupt/i);
      expect(combined).toMatch(/2/); // Should mention 2 skipped
    });
  });

  describe('list --invalidated', () => {
    beforeEach(async () => {
      await appendLesson(getTempDir(), createQuickLesson('L001', 'normal lesson'));
      const invalidatedLesson = {
        ...createQuickLesson('L002', 'invalidated lesson'),
        invalidatedAt: '2026-01-30T12:00:00Z',
        invalidationReason: 'Was incorrect',
      };
      await appendLesson(getTempDir(), invalidatedLesson);
    });

    it('shows only invalidated lessons with --invalidated flag', () => {
      const { combined } = runCli('list --invalidated');
      expect(combined).toContain('invalidated lesson');
      expect(combined).not.toContain('normal lesson');
    });

    it('shows invalidation indicator in list output', () => {
      const { combined } = runCli('list');
      // Invalidated lessons should have some marker
      expect(combined).toMatch(/INVALID|invalidated/i);
    });
  });

  describe('search command', () => {
    beforeEach(async () => {
      await appendLesson(getTempDir(), createQuickLesson('L001', 'use Polars for data'));
      await appendLesson(getTempDir(), createQuickLesson('L002', 'test your code'));
      await rebuildIndex(getTempDir());
      closeDb(); // Close so CLI can open fresh
    });

    it('searches by keyword', () => {
      const { combined } = runCli('search "Polars"');
      expect(combined).toContain('Polars');
    });

    it('shows no results for non-matching query', () => {
      const { combined } = runCli('search "nonexistent"');
      // Now shows user-friendly message with suggestions
      expect(combined.toLowerCase()).toMatch(/no lessons match|no.*found|0.*result/i);
    });
  });

  describe('check-plan command', () => {
    beforeEach(async () => {
      // Create some lessons for vector search
      await appendLesson(
        getTempDir(),
        createQuickLesson('L001', 'Always run tests before committing', {
          trigger: 'test failure after commit',
          tags: ['testing'],
        })
      );
      await appendLesson(
        getTempDir(),
        createQuickLesson('L002', 'Use Polars for large file processing', {
          trigger: 'pandas was slow',
          tags: ['performance'],
        })
      );
      await appendLesson(
        getTempDir(),
        createQuickLesson('L003', 'Check authentication before API calls', {
          trigger: 'unauthorized error',
          tags: ['auth', 'api'],
        })
      );
      await rebuildIndex(getTempDir());
      closeDb();
    });

    it('retrieves relevant lessons with --plan flag', () => {
      const { combined } = runCli('check-plan --plan "implement testing workflow"');
      // Should find lessons and display them
      expect(combined).toMatch(/lessons|relevant/i);
    });

    it('outputs valid JSON with --json flag', () => {
      const { stdout } = runCli('check-plan --json --plan "testing workflow"');
      // Extract JSON from output (may contain library warnings on earlier lines)
      const jsonLine = stdout.split('\n').find((line) => line.startsWith('{'));
      expect(jsonLine).toBeDefined();
      const result = JSON.parse(jsonLine!) as { lessons: unknown[]; count: number };
      expect(result).toHaveProperty('lessons');
      expect(result).toHaveProperty('count');
      expect(Array.isArray(result.lessons)).toBe(true);
    });

    it('reads plan from stdin', () => {
      const cliPath = join(process.cwd(), 'dist', 'cli.js');
      const stdout = execSync(`echo "test workflow" | node ${cliPath} check-plan`, {
        cwd: getTempDir(),
        encoding: 'utf-8',
        env: { ...process.env, LEARNING_AGENT_ROOT: getTempDir() },
      });
      expect(stdout).toMatch(/lessons|relevant|no.*found/i);
    });

    it('respects --limit option', () => {
      const { stdout } = runCli('check-plan --json --limit 1 --plan "testing and authentication"');
      // Extract JSON from output (may contain library warnings on earlier lines)
      const jsonLine = stdout.split('\n').find((line) => line.startsWith('{'));
      expect(jsonLine).toBeDefined();
      const result = JSON.parse(jsonLine!) as { lessons: unknown[]; count: number };
      expect(result.lessons.length).toBeLessThanOrEqual(1);
    });

    it('shows user-friendly message when no relevant lessons found', async () => {
      // Create a fresh temp dir with no lessons
      const emptyDir = await mkdtemp(join(tmpdir(), 'learning-agent-empty-'));
      try {
        const cliPath = join(process.cwd(), 'dist', 'cli.js');
        const stdout = execSync(`node ${cliPath} check-plan --plan "something completely unrelated xyz123"`, {
          cwd: emptyDir,
          encoding: 'utf-8',
          env: { ...process.env, LEARNING_AGENT_ROOT: emptyDir },
        });
        expect(stdout).toMatch(/no.*lessons|no.*relevant|no.*found/i);
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });

    it('requires plan text from --plan or stdin', () => {
      // When run without --plan and without stdin data (TTY mode simulated)
      const { combined } = runCli('check-plan');
      expect(combined.toLowerCase()).toMatch(/no plan|required|error/i);
    });

    it('includes relevance score in JSON output', () => {
      const { stdout } = runCli('check-plan --json --plan "testing workflow"');
      // Extract JSON from output (may contain library warnings on earlier lines)
      const jsonLine = stdout.split('\n').find((line) => line.startsWith('{'));
      expect(jsonLine).toBeDefined();
      const result = JSON.parse(jsonLine!) as { lessons: Array<{ relevance?: number }> };
      if (result.lessons.length > 0) {
        expect(result.lessons[0]).toHaveProperty('relevance');
        expect(typeof result.lessons[0].relevance).toBe('number');
      }
    });

    it('includes lesson ID in JSON output', () => {
      const { stdout } = runCli('check-plan --json --plan "testing workflow"');
      // Extract JSON from output (may contain library warnings on earlier lines)
      const jsonLine = stdout.split('\n').find((line) => line.startsWith('{'));
      expect(jsonLine).toBeDefined();
      const result = JSON.parse(jsonLine!) as { lessons: Array<{ id?: string }> };
      if (result.lessons.length > 0) {
        expect(result.lessons[0]).toHaveProperty('id');
        expect(typeof result.lessons[0].id).toBe('string');
      }
    });

    // Test that check-plan returns proper error when model unavailable
    // This test only runs when model IS available (to verify format of success case)
    it.skipIf(!modelAvailable)('returns lessons array when model is available', () => {
      const { stdout } = runCli('check-plan --json --plan "testing workflow"');
      const jsonLine = stdout.split('\n').find((line) => line.startsWith('{'));
      expect(jsonLine).toBeDefined();
      const result = JSON.parse(jsonLine!) as { lessons?: unknown[]; error?: string };
      // Should have lessons (not error) when model is available
      expect(result.lessons).toBeDefined();
      expect(result.error).toBeUndefined();
    });
  });

  describe('load-session command', () => {
    it('outputs lessons in human-readable format', async () => {
      // Create high-severity confirmed lessons
      await appendLesson(
        getTempDir(),
        createFullLesson('L001', 'Use Polars for files >100MB, not pandas', 'high', {
          tags: ['performance', 'data'],
          created: '2025-01-28T10:00:00Z',
        })
      );
      await appendLesson(
        getTempDir(),
        createFullLesson('L002', 'Always validate input before processing', 'high', {
          tags: ['security'],
          created: '2025-01-27T10:00:00Z',
        })
      );

      const { combined } = runCli('load-session');

      // New format: header, intro, bold insights with tags, learned line, footer
      expect(combined).toContain('## Lessons from Past Sessions');
      expect(combined).toContain('**Use Polars for files >100MB, not pandas**');
      expect(combined).toMatch(/\(performance, data\)/);
      expect(combined).toContain('Consider these lessons');
    });

    it('outputs valid JSON with --json flag', async () => {
      await appendLesson(
        getTempDir(),
        createFullLesson('L001', 'Test lesson', 'high', { tags: ['test'] })
      );

      const { stdout } = runCli('load-session --json');
      const result = JSON.parse(stdout) as { lessons: unknown[]; count: number };

      expect(result).toHaveProperty('lessons');
      expect(result).toHaveProperty('count');
      expect(result.count).toBe(1);
      expect(Array.isArray(result.lessons)).toBe(true);
    });

    it('shows message when no high-severity lessons exist', () => {
      const { combined } = runCli('load-session');
      expect(combined).toContain('No high-severity lessons found');
    });

    it('returns exit code 0 even with no lessons', () => {
      // runCli catches errors, so successful execution means exit 0
      const { combined } = runCli('load-session');
      // Should not contain error indicators
      expect(combined).not.toMatch(/error|exception|fail/i);
      expect(combined).toContain('No high-severity lessons found');
    });

    it('filters out non-high-severity lessons', async () => {
      await appendLesson(
        getTempDir(),
        createFullLesson('L001', 'Medium severity lesson', 'medium')
      );
      await appendLesson(
        getTempDir(),
        createFullLesson('L002', 'Low severity lesson', 'low')
      );
      await appendLesson(getTempDir(), createQuickLesson('L003', 'Quick lesson'));

      const { combined } = runCli('load-session');
      expect(combined).toContain('No high-severity lessons found');
    });

    it('filters out unconfirmed lessons', async () => {
      await appendLesson(
        getTempDir(),
        createFullLesson('L001', 'Unconfirmed lesson', 'high', { confirmed: false })
      );

      const { combined } = runCli('load-session');
      expect(combined).toContain('No high-severity lessons found');
    });

    it('respects --quiet flag', async () => {
      await appendLesson(
        getTempDir(),
        createFullLesson('L001', 'Test lesson', 'high')
      );

      const { combined } = runCli('load-session --quiet');
      // Should not contain info prefix or summary
      expect(combined).not.toMatch(/\[info\]/);
    });

    it('shows source and date in human-readable format', async () => {
      await appendLesson(
        getTempDir(),
        createFullLesson('L001', 'Test lesson', 'high', {
          created: '2025-01-28T10:00:00Z',
        })
      );

      const { combined } = runCli('load-session');
      // New format uses "Learned: DATE via SOURCE" instead of "Source:"
      expect(combined).toContain('Learned:');
      expect(combined).toContain('2025-01-28');
    });

    it('shows count note when more than 20 lessons exist', async () => {
      // Add 21 high-severity lessons to trigger the count note
      for (let i = 1; i <= 21; i++) {
        await appendLesson(
          getTempDir(),
          createFullLesson(`L${String(i).padStart(3, '0')}`, `High severity lesson ${i}`, 'high')
        );
      }
      await rebuildIndex(getTempDir());
      closeDb();

      const { combined } = runCli('load-session');
      // Should show note about total lesson count
      expect(combined).toMatch(/21.*lessons|lessons.*21|consider.*compact/i);
    });

    it('shows age warning for lessons older than 90 days', async () => {
      // Create a high-severity lesson from 100 days ago
      await appendLesson(
        getTempDir(),
        createFullLesson('L001', 'Important security lesson', 'high', {
          created: daysAgo(100),
        })
      );

      const { combined } = runCli('load-session');
      // Should show age warning indicator with days count
      expect(combined).toMatch(/\d+\s*days\s*old/i);
    });

    it('shows no age warning for recent lessons', async () => {
      // Create a recent high-severity lesson (30 days ago)
      await appendLesson(
        getTempDir(),
        createFullLesson('L001', 'Important recent lesson', 'high', {
          created: daysAgo(30),
        })
      );

      const { combined } = runCli('load-session');
      // Should NOT show age warning indicator (only shows for >90 days)
      expect(combined).not.toMatch(/\d+\s*days\s*old/i);
    });


    // ========================================================================
    // NEW TESTS FOR ENHANCED OUTPUT FORMAT (learning_agent-793)
    // ========================================================================

    describe('enhanced output format (S1, S2, S3)', () => {
      it('uses new header "## Lessons from Past Sessions"', async () => {
        await appendLesson(
          getTempDir(),
          createFullLesson('L001', 'Use Polars for large files', 'high', {
            tags: ['performance'],
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session');

        // Should use new header instead of "Session Lessons (High Severity)"
        expect(combined).toContain('## Lessons from Past Sessions');
        expect(combined).not.toContain('Session Lessons (High Severity)');
      });

      it('includes intro text for Claude', async () => {
        await appendLesson(
          getTempDir(),
          createFullLesson('L001', 'Test lesson', 'high', {
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session');

        // Should include intro paragraph
        expect(combined).toMatch(/these lessons were captured from previous/i);
        expect(combined).toMatch(/should inform your work/i);
      });

      it('does not include lesson IDs [Lxxxxxxxx] in human output (S1)', async () => {
        await appendLesson(
          getTempDir(),
          createFullLesson('L12345678', 'Use Polars for large files', 'high', {
            tags: ['performance'],
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session');

        // Should NOT include lesson ID in output
        expect(combined).not.toMatch(/\[L[a-f0-9]{8}\]/);
        // Should include the insight
        expect(combined).toContain('Use Polars for large files');
      });

      it('does not include [info] prefix in output (S2)', async () => {
        await appendLesson(
          getTempDir(),
          createFullLesson('L001', 'Test lesson', 'high', {
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session');

        // Should NOT include [info] prefix anywhere
        expect(combined).not.toMatch(/\[info\]/i);
      });

      it('formats lessons with bold insight and tags in parentheses', async () => {
        await appendLesson(
          getTempDir(),
          createFullLesson('L001', 'Use Polars for files >100MB', 'high', {
            tags: ['performance'],
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session');

        // Insight should be bold (starts with **)
        expect(combined).toMatch(/\*\*Use Polars for files >100MB\*\*/);
        // Tags should be in parentheses after insight on same line
        expect(combined).toMatch(/\*\*Use Polars for files >100MB\*\*.*\(performance\)/);
      });

      it('shows "Learned: DATE via SOURCE" format', async () => {
        await appendLesson(
          getTempDir(),
          createFullLesson('L001', 'Test lesson', 'high', {
            created: '2025-01-28T10:00:00Z',
            source: 'user_correction',
          })
        );

        const { combined } = runCli('load-session');

        // Should use "Learned:" prefix
        expect(combined).toMatch(/Learned:/);
        // Should show date in YYYY-MM-DD format
        expect(combined).toMatch(/2025-01-28/);
        // Should show "via SOURCE" (underscores converted to spaces for readability)
        expect(combined).toMatch(/via\s+user\s+correction/);
      });

      it('includes footer with actionable reminder', async () => {
        await appendLesson(
          getTempDir(),
          createFullLesson('L001', 'Test lesson', 'high', {
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session');

        // Should include footer with actionable reminder
        expect(combined).toMatch(/consider these lessons/i);
        expect(combined).toMatch(/planning|implementing/i);
      });

      it('shows friendly empty state message', () => {
        const { combined } = runCli('load-session');

        // Should show friendly message (not error)
        expect(combined).toContain('No high-severity lessons found');
        // Should NOT show error indicators
        expect(combined).not.toMatch(/\[error\]/i);
      });

      it('exits with code 0 even with no lessons (S4)', () => {
        // runCli catches errors, so successful execution means exit 0
        const { combined } = runCli('load-session');

        // Should not contain error indicators
        expect(combined).not.toMatch(/error|exception|fail/i);
      });

      it('token count is reasonable (~150 tokens per lesson)', async () => {
        // Create 5 lessons with realistic content
        await appendLesson(
          getTempDir(),
          createFullLesson('L001', 'Use Polars for files >100MB, not pandas', 'high', {
            tags: ['performance', 'data'],
            created: '2025-01-28T10:00:00Z',
            source: 'user_correction',
          })
        );
        await appendLesson(
          getTempDir(),
          createFullLesson('L002', 'Always validate input before processing', 'high', {
            tags: ['security'],
            created: '2025-01-27T10:00:00Z',
            source: 'test_failure',
          })
        );
        await appendLesson(
          getTempDir(),
          createFullLesson('L003', 'Run tests before committing code', 'high', {
            tags: ['testing', 'workflow'],
            created: '2025-01-26T10:00:00Z',
            source: 'manual',
          })
        );
        await appendLesson(
          getTempDir(),
          createFullLesson('L004', 'Check authentication before API calls', 'high', {
            tags: ['auth', 'api'],
            created: '2025-01-25T10:00:00Z',
            source: 'user_correction',
          })
        );
        await appendLesson(
          getTempDir(),
          createFullLesson('L005', 'Handle edge cases in validation logic', 'high', {
            tags: ['validation', 'edge-cases'],
            created: '2025-01-24T10:00:00Z',
            source: 'test_failure',
          })
        );

        const { combined } = runCli('load-session');

        // Rough token estimation: 4 chars = 1 token
        const charCount = combined.length;
        const estimatedTokens = charCount / 4;

        // Should be under 800 tokens total (S3)
        expect(estimatedTokens).toBeLessThan(800);

        // Should be reasonable per lesson (~150 tokens x 5 = 750 max)
        const tokensPerLesson = estimatedTokens / 5;
        expect(tokensPerLesson).toBeLessThan(160);
      });

      it('formats lessons without tags by omitting tag parentheses', async () => {
        await appendLesson(
          getTempDir(),
          createFullLesson('L001', 'Test lesson without tags', 'high', {
            tags: [],
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session');

        // Should show insight
        expect(combined).toContain('Test lesson without tags');
        // Should NOT show empty parentheses
        expect(combined).not.toMatch(/\*\*Test lesson without tags\*\*\s*\(\s*\)/);
      });

      it('formats multiple tags correctly', async () => {
        await appendLesson(
          getTempDir(),
          createFullLesson('L001', 'Use Polars for large files', 'high', {
            tags: ['performance', 'data', 'optimization'],
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session');

        // Tags should be in parentheses on same line as insight
        expect(combined).toMatch(/\*\*Use Polars for large files\*\*.*\(performance, data, optimization\)/);
      });

      it('footer respects --quiet flag', async () => {
        await appendLesson(
          getTempDir(),
          createFullLesson('L001', 'Test lesson', 'high', {
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session --quiet');

        // Should NOT include footer in quiet mode
        expect(combined).not.toMatch(/consider these lessons/i);
        expect(combined).not.toMatch(/1.*high-severity.*lesson/i);
      });
    });
  });
});
