/**
 * Tests for audit command: ca audit
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { AuditReportSchema } from '../audit/types.js';
import { createFullLesson } from '../test-utils.js';
import { appendMemoryItem } from '../memory/storage/jsonl.js';
import { setupCliTestContext } from '../test-utils.js';

describe('Audit Command', () => {
  const { getTempDir, runCli } = setupCliTestContext();

  it('returns 0 findings on empty repo', () => {
    const { combined } = runCli('audit');
    expect(combined).toContain('0 finding(s)');
  });

  it('outputs valid JSON with --json flag', () => {
    const { stdout } = runCli('audit --json');
    const report = JSON.parse(stdout);
    const result = AuditReportSchema.safeParse(report);
    expect(result.success).toBe(true);
  });

  it('skips rule findings with --no-rules', async () => {
    const dir = getTempDir();
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'src', 'bad.ts'), 'console.log("oops");\n');
    await mkdir(join(dir, '.claude'), { recursive: true });
    await writeFile(
      join(dir, '.claude', 'rules.json'),
      JSON.stringify({
        rules: [
          {
            id: 'no-console',
            description: 'No console.log',
            severity: 'error',
            check: { type: 'file-pattern', glob: 'src/**/*.ts', pattern: 'console\\.log' },
            remediation: 'Use logger',
          },
        ],
      })
    );

    const { stdout } = runCli('audit --no-rules --json');
    const report = JSON.parse(stdout);
    const ruleFindings = report.findings.filter((f: { source: string }) => f.source === 'rule');
    expect(ruleFindings).toEqual([]);
  });

  it('skips pattern findings with --no-patterns', async () => {
    const { stdout } = runCli('audit --no-patterns --json');
    const report = JSON.parse(stdout);
    const patternFindings = report.findings.filter(
      (f: { source: string }) => f.source === 'pattern'
    );
    expect(patternFindings).toEqual([]);
  });

  it('skips lesson findings with --no-lessons', async () => {
    const dir = getTempDir();
    const lesson = createFullLesson('L001', 'Important lesson', 'high');
    await appendMemoryItem(dir, lesson);

    const { stdout } = runCli('audit --no-lessons --json');
    const report = JSON.parse(stdout);
    const lessonFindings = report.findings.filter(
      (f: { source: string }) => f.source === 'lesson'
    );
    expect(lessonFindings).toEqual([]);
  });

  it('exits 1 when error findings exist', async () => {
    const dir = getTempDir();
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'src', 'bad.ts'), 'console.log("oops");\n');
    await mkdir(join(dir, '.claude'), { recursive: true });
    await writeFile(
      join(dir, '.claude', 'rules.json'),
      JSON.stringify({
        rules: [
          {
            id: 'no-console',
            description: 'No console.log',
            severity: 'error',
            check: { type: 'file-pattern', glob: 'src/**/*.ts', pattern: 'console\\.log' },
            remediation: 'Use logger',
          },
        ],
      })
    );

    const { combined } = runCli('audit');
    // runCli captures output from non-zero exits; error findings should be present
    expect(combined).toMatch(/ERROR/);
  });

  it('suppresses summary line with -q', () => {
    const { combined } = runCli('audit -q');
    expect(combined).not.toMatch(/Audit:.*finding/);
  });
});
