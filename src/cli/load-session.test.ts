/**
 * CLI tests for the load-session command.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appendLesson } from '../storage/jsonl.js';
import { cleanupCliTestDir, createFullLesson, createQuickLesson, runCli, setupCliTestDir } from '../test-utils.js';

describe('CLI', { tags: ['integration'] }, () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupCliTestDir();
  });

  afterEach(async () => {
    await cleanupCliTestDir(tempDir);
  });

  describe('load-session command', () => {
    it('outputs lessons in human-readable format', async () => {
      await appendLesson(
        tempDir,
        createFullLesson('L001', 'Use Polars for files >100MB, not pandas', 'high', {
          tags: ['performance', 'data'],
          created: '2025-01-28T10:00:00Z',
        })
      );
      await appendLesson(
        tempDir,
        createFullLesson('L002', 'Always validate input before processing', 'high', {
          tags: ['security'],
          created: '2025-01-27T10:00:00Z',
        })
      );

      const { combined } = runCli('load-session', tempDir);

      expect(combined).toContain('## Lessons from Past Sessions');
      expect(combined).toContain('**Use Polars for files >100MB, not pandas**');
      expect(combined).toMatch(/\(performance, data\)/);
      expect(combined).toContain('Consider these lessons');
    });

    it('outputs valid JSON with --json flag', async () => {
      await appendLesson(
        tempDir,
        createFullLesson('L001', 'Test lesson', 'high', { tags: ['test'] })
      );

      const { stdout } = runCli('load-session --json', tempDir);
      const result = JSON.parse(stdout) as { lessons: unknown[]; count: number };

      expect(result).toHaveProperty('lessons');
      expect(result).toHaveProperty('count');
      expect(result.count).toBe(1);
      expect(Array.isArray(result.lessons)).toBe(true);
    });

    it('shows message when no high-severity lessons exist', () => {
      const { combined } = runCli('load-session', tempDir);
      expect(combined).toContain('No high-severity lessons found');
    });

    it('returns exit code 0 even with no lessons', () => {
      const { combined } = runCli('load-session', tempDir);
      expect(combined).not.toMatch(/error|exception|fail/i);
      expect(combined).toContain('No high-severity lessons found');
    });

    it('filters out non-high-severity lessons', async () => {
      await appendLesson(
        tempDir,
        createFullLesson('L001', 'Medium severity lesson', 'medium')
      );
      await appendLesson(
        tempDir,
        createFullLesson('L002', 'Low severity lesson', 'low')
      );
      await appendLesson(tempDir, createQuickLesson('L003', 'Quick lesson'));

      const { combined } = runCli('load-session', tempDir);
      expect(combined).toContain('No high-severity lessons found');
    });

    it('filters out unconfirmed lessons', async () => {
      await appendLesson(
        tempDir,
        createFullLesson('L001', 'Unconfirmed lesson', 'high', { confirmed: false })
      );

      const { combined } = runCli('load-session', tempDir);
      expect(combined).toContain('No high-severity lessons found');
    });

    it('respects --quiet flag', async () => {
      await appendLesson(
        tempDir,
        createFullLesson('L001', 'Test lesson', 'high')
      );

      const { combined } = runCli('load-session --quiet', tempDir);
      expect(combined).not.toMatch(/\[info\]/);
    });

    it('shows source and date in human-readable format', async () => {
      await appendLesson(
        tempDir,
        createFullLesson('L001', 'Test lesson', 'high', {
          created: '2025-01-28T10:00:00Z',
        })
      );

      const { combined } = runCli('load-session', tempDir);
      expect(combined).toContain('Learned:');
      expect(combined).toContain('2025-01-28');
    });

    describe('enhanced output format (S1, S2, S3)', () => {
      it('uses new header "## Lessons from Past Sessions"', async () => {
        await appendLesson(
          tempDir,
          createFullLesson('L001', 'Use Polars for large files', 'high', {
            tags: ['performance'],
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session', tempDir);

        expect(combined).toContain('## Lessons from Past Sessions');
        expect(combined).not.toContain('Session Lessons (High Severity)');
      });

      it('includes intro text for Claude', async () => {
        await appendLesson(
          tempDir,
          createFullLesson('L001', 'Test lesson', 'high', {
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session', tempDir);

        expect(combined).toMatch(/these lessons were captured from previous/i);
        expect(combined).toMatch(/should inform your work/i);
      });

      it('does not include lesson IDs [Lxxxxxxxx] in human output (S1)', async () => {
        await appendLesson(
          tempDir,
          createFullLesson('L12345678', 'Use Polars for large files', 'high', {
            tags: ['performance'],
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session', tempDir);

        expect(combined).not.toMatch(/\[L[a-f0-9]{8}\]/);
        expect(combined).toContain('Use Polars for large files');
      });

      it('does not include [info] prefix in output (S2)', async () => {
        await appendLesson(
          tempDir,
          createFullLesson('L001', 'Test lesson', 'high', {
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session', tempDir);

        expect(combined).not.toMatch(/\[info\]/i);
      });

      it('formats lessons with bold insight and tags in parentheses', async () => {
        await appendLesson(
          tempDir,
          createFullLesson('L001', 'Use Polars for files >100MB', 'high', {
            tags: ['performance'],
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session', tempDir);

        expect(combined).toMatch(/\*\*Use Polars for files >100MB\*\*/);
        expect(combined).toMatch(/\*\*Use Polars for files >100MB\*\*.*\(performance\)/);
      });

      it('shows "Learned: DATE via SOURCE" format', async () => {
        await appendLesson(
          tempDir,
          createFullLesson('L001', 'Test lesson', 'high', {
            created: '2025-01-28T10:00:00Z',
            source: 'user_correction',
          })
        );

        const { combined } = runCli('load-session', tempDir);

        expect(combined).toMatch(/Learned:/);
        expect(combined).toMatch(/2025-01-28/);
        expect(combined).toMatch(/via\s+user\s+correction/);
      });

      it('includes footer with actionable reminder', async () => {
        await appendLesson(
          tempDir,
          createFullLesson('L001', 'Test lesson', 'high', {
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session', tempDir);

        expect(combined).toMatch(/consider these lessons/i);
        expect(combined).toMatch(/planning|implementing/i);
      });

      it('shows friendly empty state message', () => {
        const { combined } = runCli('load-session', tempDir);

        expect(combined).toContain('No high-severity lessons found');
        expect(combined).not.toMatch(/\[error\]/i);
      });

      it('exits with code 0 even with no lessons (S4)', () => {
        const { combined } = runCli('load-session', tempDir);

        expect(combined).not.toMatch(/error|exception|fail/i);
      });

      it('token count is reasonable (~150 tokens per lesson)', async () => {
        await appendLesson(
          tempDir,
          createFullLesson('L001', 'Use Polars for files >100MB, not pandas', 'high', {
            tags: ['performance', 'data'],
            created: '2025-01-28T10:00:00Z',
            source: 'user_correction',
          })
        );
        await appendLesson(
          tempDir,
          createFullLesson('L002', 'Always validate input before processing', 'high', {
            tags: ['security'],
            created: '2025-01-27T10:00:00Z',
            source: 'test_failure',
          })
        );
        await appendLesson(
          tempDir,
          createFullLesson('L003', 'Run tests before committing code', 'high', {
            tags: ['testing', 'workflow'],
            created: '2025-01-26T10:00:00Z',
            source: 'manual',
          })
        );
        await appendLesson(
          tempDir,
          createFullLesson('L004', 'Check authentication before API calls', 'high', {
            tags: ['auth', 'api'],
            created: '2025-01-25T10:00:00Z',
            source: 'user_correction',
          })
        );
        await appendLesson(
          tempDir,
          createFullLesson('L005', 'Handle edge cases in validation logic', 'high', {
            tags: ['validation', 'edge-cases'],
            created: '2025-01-24T10:00:00Z',
            source: 'test_failure',
          })
        );

        const { combined } = runCli('load-session', tempDir);

        const charCount = combined.length;
        const estimatedTokens = charCount / 4;

        expect(estimatedTokens).toBeLessThan(800);

        const tokensPerLesson = estimatedTokens / 5;
        expect(tokensPerLesson).toBeLessThan(160);
      });

      it('formats lessons without tags by omitting tag parentheses', async () => {
        await appendLesson(
          tempDir,
          createFullLesson('L001', 'Test lesson without tags', 'high', {
            tags: [],
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session', tempDir);

        expect(combined).toContain('Test lesson without tags');
        expect(combined).not.toMatch(/\*\*Test lesson without tags\*\*\s*\(\s*\)/);
      });

      it('formats multiple tags correctly', async () => {
        await appendLesson(
          tempDir,
          createFullLesson('L001', 'Use Polars for large files', 'high', {
            tags: ['performance', 'data', 'optimization'],
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session', tempDir);

        expect(combined).toMatch(/\*\*Use Polars for large files\*\*.*\(performance, data, optimization\)/);
      });

      it('footer respects --quiet flag', async () => {
        await appendLesson(
          tempDir,
          createFullLesson('L001', 'Test lesson', 'high', {
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session --quiet', tempDir);

        expect(combined).not.toMatch(/consider these lessons/i);
        expect(combined).not.toMatch(/1.*high-severity.*lesson/i);
      });
    });
  });
});
