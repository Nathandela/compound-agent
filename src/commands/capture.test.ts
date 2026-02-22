/**
 * Tests for capture commands: learn, detect, capture, hooks run
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { LESSONS_PATH } from '../memory/storage/jsonl.js';
import { setupCliTestContext } from '../test-utils.js';

describe('Capture Commands', { tags: ['integration'] }, () => {
  const { getTempDir, runCli } = setupCliTestContext();

  describe('learn command', () => {
    it('creates a lesson in JSONL file', async () => {
      runCli('learn "Use Polars for large files" --trigger "pandas was slow" --yes');

      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('Polars');
      expect(content).toContain('pandas was slow');
    });

    it('requires insight argument', () => {
      const { combined } = runCli('learn');
      expect(combined.toLowerCase()).toMatch(/missing|required|argument/i);
    });

    it('always saves with confirmed: true even without --yes', async () => {
      runCli('learn "Always confirm manual lessons"');

      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lesson = JSON.parse(content.trim()) as { confirmed: boolean };
      expect(lesson.confirmed).toBe(true);
    });

    it('accepts --citation flag with file path', async () => {
      runCli('learn "Check auth before API calls" --citation "src/api/client.ts"');

      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lesson = JSON.parse(content.trim()) as { citation?: { file: string } };
      expect(lesson.citation).toBeDefined();
      expect(lesson.citation?.file).toBe('src/api/client.ts');
    });

    it('accepts --citation flag with file:line format', async () => {
      runCli('learn "Validate input on line 42" --citation "src/validator.ts:42"');

      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lesson = JSON.parse(content.trim()) as { citation?: { file: string; line?: number } };
      expect(lesson.citation).toBeDefined();
      expect(lesson.citation?.file).toBe('src/validator.ts');
      expect(lesson.citation?.line).toBe(42);
    });

    it('accepts --citation-commit flag', async () => {
      runCli('learn "Fixed in this commit" --citation "src/fix.ts" --citation-commit "abc1234"');

      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lesson = JSON.parse(content.trim()) as { citation?: { file: string; commit?: string } };
      expect(lesson.citation).toBeDefined();
      expect(lesson.citation?.commit).toBe('abc1234');
    });


    // --severity flag tests (Data Invariants)
    describe('--severity flag', () => {
      it('creates full lesson with severity=high when --severity high is used', async () => {
        runCli('learn "Use Polars for files >100MB" --severity high --yes');

        const filePath = join(getTempDir(), LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const lesson = JSON.parse(content.trim()) as { type: string; severity?: string };

        expect(lesson.type).toBe('lesson');
        expect(lesson.severity).toBe('high');
      });

      it('creates full lesson with severity=medium when --severity medium is used', async () => {
        runCli('learn "Validate input before processing" --severity medium --yes');

        const filePath = join(getTempDir(), LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const lesson = JSON.parse(content.trim()) as { type: string; severity?: string };

        expect(lesson.type).toBe('lesson');
        expect(lesson.severity).toBe('medium');
      });

      it('creates full lesson with severity=low when --severity low is used', async () => {
        runCli('learn "Consider adding comments" --severity low --yes');

        const filePath = join(getTempDir(), LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const lesson = JSON.parse(content.trim()) as { type: string; severity?: string };

        expect(lesson.type).toBe('lesson');
        expect(lesson.severity).toBe('low');
      });

      it('automatically sets type=full when --severity flag is provided', async () => {
        runCli('learn "High severity lesson" --severity high --yes');

        const filePath = join(getTempDir(), LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const lesson = JSON.parse(content.trim()) as { type: string; severity?: string };

        // All lessons now use type 'lesson' (old quick/full distinction removed)
        expect(lesson.type).toBe('lesson');
        expect(lesson.severity).toBe('high');
      });

      // Safety Property S1: Invalid severity values rejected with clear error
      it('rejects invalid severity value with clear error message', () => {
        const { combined } = runCli('learn "Test lesson" --severity invalid --yes');

        expect(combined.toLowerCase()).toMatch(/error|invalid/i);
        expect(combined).toMatch(/severity/i);
        expect(combined).toMatch(/high/i);
        expect(combined).toMatch(/medium/i);
        expect(combined).toMatch(/low/i);
      });

      it('rejects case-incorrect severity value (case-sensitive)', () => {
        const { combined } = runCli('learn "Test lesson" --severity High --yes');

        expect(combined.toLowerCase()).toMatch(/error|invalid/i);
        expect(combined).toMatch(/severity/i);
      });

      it('rejects empty severity string', () => {
        const { combined } = runCli('learn "Test lesson" --severity "" --yes');

        expect(combined.toLowerCase()).toMatch(/error|invalid/i);
        expect(combined).toMatch(/severity/i);
      });

      // Safety Property S5: JSONL must not be corrupted by invalid input
      it('does not corrupt JSONL when invalid severity is provided', async () => {
        // Create a valid lesson first
        runCli('learn "Valid lesson" --yes');

        const filePathBefore = join(getTempDir(), LESSONS_PATH);
        const contentBefore = await readFile(filePathBefore, 'utf-8');

        // Try to create lesson with invalid severity
        runCli('learn "Invalid severity lesson" --severity bad --yes');

        const filePathAfter = join(getTempDir(), LESSONS_PATH);
        const contentAfter = await readFile(filePathAfter, 'utf-8');

        // JSONL should be unchanged (no new lesson added)
        expect(contentAfter).toBe(contentBefore);
        expect(contentAfter).not.toContain('Invalid severity lesson');
      });

      // Backward compatibility: No --severity flag creates quick lesson
      it('creates quick lesson with no severity when --severity flag is omitted', async () => {
        runCli('learn "Quick capture lesson" --yes');

        const filePath = join(getTempDir(), LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const lesson = JSON.parse(content.trim()) as { type: string; severity?: string };

        expect(lesson.type).toBe('lesson');
        expect(lesson.severity).toBeUndefined();
      });

      // Safety Property S3: High-severity lessons must be retrievable by loadSessionLessons
      it('creates high-severity lesson that is retrievable by loadSessionLessons', async () => {
        runCli('learn "Critical security lesson" --severity high --yes');

        const filePath = join(getTempDir(), LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const lesson = JSON.parse(content.trim()) as { type: string; severity?: string; confirmed: boolean };

        // Verify all required fields for loadSessionLessons filter
        expect(lesson.type).toBe('lesson');
        expect(lesson.severity).toBe('high');
        expect(lesson.confirmed).toBe(true);
      });

      it('works with all other flags combined', async () => {
        runCli('learn "Complex lesson" --severity high --trigger "bug occurred" --tags "security,auth" --yes');

        const filePath = join(getTempDir(), LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const lesson = JSON.parse(content.trim()) as {
          type: string;
          severity?: string;
          trigger: string;
          tags: string[];
        };

        expect(lesson.type).toBe('lesson');
        expect(lesson.severity).toBe('high');
        expect(lesson.trigger).toBe('bug occurred');
        expect(lesson.tags).toContain('security');
        expect(lesson.tags).toContain('auth');
      });

      // Liveness Property L1: CLI completes within reasonable time (includes process startup)
      it('completes within 5000ms for severity flag', async () => {
        const start = Date.now();
        runCli('learn "Performance test" --severity high --yes');
        const duration = Date.now() - start;

        // Allow generous margin for CLI process startup overhead under parallel load
        expect(duration).toBeLessThan(5000);
      });

      // Liveness Property L2: Clear error messages list valid values
      it('shows clear error message listing valid severity values', () => {
        const { combined } = runCli('learn "Test" --severity wrong --yes');

        // Error message must list all valid values
        expect(combined).toMatch(/high/i);
        expect(combined).toMatch(/medium/i);
        expect(combined).toMatch(/low/i);
      });
    });

    // --type flag tests (memory item types)
    describe('--type flag', () => {
      it('defaults to type=lesson when --type is omitted (backward compat)', async () => {
        runCli('learn "Default type insight" --yes');

        const filePath = join(getTempDir(), LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const item = JSON.parse(content.trim()) as { type: string };
        expect(item.type).toBe('lesson');
      });

      it('captures a solution when --type solution is used', async () => {
        runCli('learn "Fix by restarting service" --type solution --yes');

        const filePath = join(getTempDir(), LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const item = JSON.parse(content.trim()) as { type: string };
        expect(item.type).toBe('solution');
      });

      it('captures a preference when --type preference is used', async () => {
        runCli('learn "Always use dark mode" --type preference --yes');

        const filePath = join(getTempDir(), LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const item = JSON.parse(content.trim()) as { type: string };
        expect(item.type).toBe('preference');
      });

      it('captures a pattern with --type pattern and both pattern flags', async () => {
        runCli('learn "Use const over let" --type pattern --pattern-bad "let x = 1" --pattern-good "const x = 1" --yes');

        const filePath = join(getTempDir(), LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const item = JSON.parse(content.trim()) as { type: string; pattern?: { bad: string; good: string } };
        expect(item.type).toBe('pattern');
        expect(item.pattern).toBeDefined();
        expect(item.pattern?.bad).toBe('let x = 1');
        expect(item.pattern?.good).toBe('const x = 1');
      });

      it('errors when --type pattern is used without pattern flags', () => {
        const { combined } = runCli('learn "Missing pattern flags" --type pattern --yes');
        expect(combined.toLowerCase()).toMatch(/error|required/i);
        expect(combined).toMatch(/pattern-bad/i);
        expect(combined).toMatch(/pattern-good/i);
      });

      it('rejects invalid --type value', () => {
        const { combined } = runCli('learn "Bad type" --type invalid --yes');
        expect(combined.toLowerCase()).toMatch(/error|invalid/i);
        expect(combined).toMatch(/type/i);
      });

      it('uses correct ID prefix for solution type', async () => {
        runCli('learn "Solution insight" --type solution --yes');

        const filePath = join(getTempDir(), LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const item = JSON.parse(content.trim()) as { id: string };
        expect(item.id).toMatch(/^S/);
      });

      it('uses correct ID prefix for pattern type', async () => {
        runCli('learn "Pattern insight" --type pattern --pattern-bad "old" --pattern-good "new" --yes');

        const filePath = join(getTempDir(), LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const item = JSON.parse(content.trim()) as { id: string };
        expect(item.id).toMatch(/^P/);
      });

      it('uses correct ID prefix for preference type', async () => {
        runCli('learn "Preference insight" --type preference --yes');

        const filePath = join(getTempDir(), LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const item = JSON.parse(content.trim()) as { id: string };
        expect(item.id).toMatch(/^R/);
      });

      it('says "Captured" for non-lesson types', async () => {
        const { combined } = runCli('learn "A solution" --type solution --yes');
        expect(combined).toMatch(/Captured/);
      });

      it('says "Learned" for lesson type (default)', async () => {
        const { combined } = runCli('learn "A lesson" --yes');
        expect(combined).toMatch(/Learned/);
      });
    });
  });

  describe('detect command', () => {
    it('requires --input option', () => {
      const { combined } = runCli('detect');
      expect(combined.toLowerCase()).toMatch(/required|missing/i);
    });

    it('detects user correction from input file', async () => {
      const inputPath = join(getTempDir(), 'input.json');
      await writeFile(
        inputPath,
        JSON.stringify({
          type: 'user',
          data: {
            messages: [
              'edit the config',
              'No, use dev.config.ts instead of prod.config.ts when testing locally',
            ],
            context: { tool: 'edit', intent: 'config update' },
          },
        })
      );

      const { combined } = runCli(`detect --input ${inputPath}`);
      expect(combined).toContain('Learning trigger detected');
      expect(combined).toContain('user_correction');
    });

    it('outputs JSON when --json flag is used', async () => {
      const inputPath = join(getTempDir(), 'input.json');
      await writeFile(
        inputPath,
        JSON.stringify({
          type: 'user',
          data: {
            messages: [
              'run tests',
              'Actually, use pnpm test instead of npm test in this project',
            ],
            context: { tool: 'bash', intent: 'testing' },
          },
        })
      );

      const { stdout } = runCli(`detect --input ${inputPath} --json`);
      const result = JSON.parse(stdout) as { detected: boolean; source?: string };
      expect(result.detected).toBe(true);
      expect(result.source).toBe('user_correction');
    });

    it('shows no detection for normal conversation', async () => {
      const inputPath = join(getTempDir(), 'input.json');
      await writeFile(
        inputPath,
        JSON.stringify({
          type: 'user',
          data: {
            messages: ['hello', 'hi there, how can I help?'],
            context: { tool: 'chat', intent: 'greeting' },
          },
        })
      );

      const { combined } = runCli(`detect --input ${inputPath}`);
      expect(combined).toContain('No learning trigger detected');
    });

    it('detects test failure from input file', async () => {
      const inputPath = join(getTempDir(), 'input.json');
      await writeFile(
        inputPath,
        JSON.stringify({
          type: 'test',
          data: {
            passed: false,
            output: 'AssertionError: use toEqual instead of toBe for objects',
            testFile: 'src/app.test.ts',
          },
        })
      );

      const { combined } = runCli(`detect --input ${inputPath}`);
      expect(combined).toContain('Learning trigger detected');
      expect(combined).toContain('test_failure');
    });

    it('--save without --yes shows error and does not save', async () => {
      const inputPath = join(getTempDir(), 'input.json');
      await writeFile(
        inputPath,
        JSON.stringify({
          type: 'user',
          data: {
            messages: [
              'run the build',
              'Wrong, use pnpm build instead of npm build for this project',
            ],
            context: { tool: 'bash', intent: 'build' },
          },
        })
      );

      const { combined } = runCli(`detect --input ${inputPath} --save`);
      expect(combined.toLowerCase()).toMatch(/--yes|confirmation|required/i);

      // Should NOT save without --yes
      const filePath = join(getTempDir(), LESSONS_PATH);
      let content = '';
      try {
        content = await readFile(filePath, 'utf-8');
      } catch {
        // File doesn't exist, which is expected
      }
      expect(content).not.toContain('pnpm build');
    });

    it('saves lesson when --save and --yes are used together', async () => {
      const inputPath = join(getTempDir(), 'input.json');
      await writeFile(
        inputPath,
        JSON.stringify({
          type: 'user',
          data: {
            messages: [
              'run the build',
              'Wrong, use pnpm build instead of npm build for this project',
            ],
            context: { tool: 'bash', intent: 'build' },
          },
        })
      );

      const { combined } = runCli(`detect --input ${inputPath} --save --yes`);
      expect(combined).toContain('Saved as lesson');

      // Verify lesson was actually saved
      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('pnpm build');
    });
  });

  describe('capture command', () => {
    it('captures lesson with --trigger and --insight using --yes', async () => {
      runCli('capture --trigger "Used setTimeout" --insight "Use await with sleep() helper" --yes');

      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('Used setTimeout');
      expect(content).toContain('Use await with sleep() helper');
    });

    it('outputs valid JSON with --json flag', async () => {
      const { stdout } = runCli('capture --trigger "test trigger" --insight "test insight" --json --yes');
      const result = JSON.parse(stdout) as { id: string; trigger: string; insight: string; saved: boolean };

      expect(result.id).toMatch(/^L[a-f0-9]{8}$/);
      expect(result.trigger).toBe('test trigger');
      expect(result.insight).toBe('test insight');
      expect(result.saved).toBe(true);
    });

    it('works with --input file like detect --save', async () => {
      const inputPath = join(getTempDir(), 'input.json');
      await writeFile(
        inputPath,
        JSON.stringify({
          type: 'user',
          data: {
            messages: [
              'run the build',
              'Wrong, use pnpm build instead of npm build for this project',
            ],
            context: { tool: 'bash', intent: 'build' },
          },
        })
      );

      const { combined } = runCli(`capture --input ${inputPath} --yes`);
      expect(combined).toContain('Lesson saved');

      // Verify lesson was actually saved
      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('pnpm build');
    });

    it('errors in non-interactive mode without --yes flag', async () => {
      const { combined } = runCli('capture --trigger "test trigger" --insight "test insight"');

      // Should show error about requiring --yes in non-interactive mode
      expect(combined.toLowerCase()).toMatch(/--yes|non.?interactive|confirmation|required/i);

      // Should NOT save (no --yes flag)
      const filePath = join(getTempDir(), LESSONS_PATH);
      let content = '';
      try {
        content = await readFile(filePath, 'utf-8');
      } catch {
        // File doesn't exist, which is expected
      }
      expect(content).not.toContain('test insight');
    });

    it('saves with confirmed: true when --yes is used', async () => {
      runCli('capture --trigger "test trigger" --insight "test insight" --yes');

      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lesson = JSON.parse(content.trim()) as { confirmed: boolean };
      expect(lesson.confirmed).toBe(true);
    });

    it('requires either --trigger/--insight or --input', () => {
      const { combined } = runCli('capture --yes');
      expect(combined.toLowerCase()).toMatch(/require|missing|provide/i);
    });

    it('shows error when --input file has no detection', async () => {
      const inputPath = join(getTempDir(), 'input.json');
      await writeFile(
        inputPath,
        JSON.stringify({
          type: 'user',
          data: {
            messages: ['hello', 'hi there'],
            context: { tool: 'chat', intent: 'greeting' },
          },
        })
      );

      const { combined } = runCli(`capture --input ${inputPath} --yes`);
      expect(combined).toContain('No learning trigger detected');
    });

    it('respects --quiet flag', async () => {
      const { combined } = runCli('capture --trigger "t" --insight "i" --yes --quiet');
      // Should only show minimal output
      expect(combined).toContain('Lesson saved');
      // Should not show verbose details
      expect(combined).not.toMatch(/Type:|Tags:/);
    });

    it('shows extra details with --verbose flag', async () => {
      const { combined } = runCli('capture --trigger "test" --insight "insight" --yes --verbose');
      // Verbose mode should show more info
      expect(combined).toMatch(/Type:|ID:/);
    });

    it('outputs JSON with saved: false when using --json without --yes', () => {
      const { stdout } = runCli('capture --trigger "t" --insight "i" --json');
      const result = JSON.parse(stdout) as { saved: boolean };
      expect(result.saved).toBe(false);
    });
  });

  describe('detect command error handling', () => {
    it('shows friendly error for invalid JSON input file', async () => {
      const inputPath = join(getTempDir(), 'bad.json');
      await writeFile(inputPath, 'not valid json at all', 'utf-8');

      const { combined } = runCli(`detect --input ${inputPath}`);
      expect(combined).toMatch(/error/i);
      // Should NOT contain raw stack trace (no "at Object.parse" etc.)
      expect(combined).not.toMatch(/^\s+at /m);
    });

    it('shows friendly error for nonexistent input file', () => {
      const { combined } = runCli('detect --input /nonexistent/file.json');
      expect(combined).toMatch(/error/i);
      expect(combined).not.toMatch(/^\s+at /m);
    });
  });

  describe('capture command error handling', () => {
    it('shows friendly error for invalid JSON input file', async () => {
      const inputPath = join(getTempDir(), 'bad.json');
      await writeFile(inputPath, '{broken json', 'utf-8');

      const { combined } = runCli(`capture --input ${inputPath} --yes`);
      expect(combined).toMatch(/error/i);
      // Should NOT contain raw stack trace
      expect(combined).not.toMatch(/^\s+at /m);
    });

    it('shows friendly error for nonexistent input file', () => {
      const { combined } = runCli('capture --input /nonexistent/file.json --yes');
      expect(combined).toMatch(/error/i);
      expect(combined).not.toMatch(/^\s+at /m);
    });
  });

  describe('hooks run command', () => {
    it('outputs lesson reminder prompt for pre-commit hook', () => {
      const { combined } = runCli('hooks run pre-commit');
      expect(combined).toContain('LESSON CAPTURE CHECKPOINT');
      expect(combined).toContain('npx ca learn');
    });

    it('exits with code 0 (non-blocking)', () => {
      // runCli will throw if exit code is non-zero
      const { combined } = runCli('hooks run pre-commit');
      // Should contain the checkpoint message, not error output
      expect(combined).toContain('CHECKPOINT');
      expect(combined).not.toMatch(/error:/i);
    });

    it('outputs JSON with --json flag', () => {
      const { stdout } = runCli('hooks run pre-commit --json');
      const result = JSON.parse(stdout) as { hook: string; message: string };
      expect(result.hook).toBe('pre-commit');
      expect(result.message).toBeDefined();
    });

    it('shows error for unknown hook', () => {
      const { combined } = runCli('hooks run unknown-hook');
      expect(combined.toLowerCase()).toMatch(/unknown|not found|invalid/i);
    });
  });
});
