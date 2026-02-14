/**
 * Tests for audit engine.
 *
 * Verifies runAudit orchestrates checks, builds reports, and respects options.
 */

import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runAudit } from './engine.js';
import { AuditReportSchema } from './types.js';
import { createFullLesson, createPattern } from '../test-utils.js';
import { appendMemoryItem } from '../memory/storage/jsonl.js';

describe('runAudit', () => {
  let tempDir: string;

  async function setup(): Promise<string> {
    tempDir = await mkdtemp(join(tmpdir(), 'audit-engine-'));
    return tempDir;
  }

  async function cleanup(): Promise<void> {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  it('returns clean report for empty repo', async () => {
    const dir = await setup();
    try {
      const report = await runAudit(dir);

      expect(report.findings).toEqual([]);
      expect(report.summary.errors).toBe(0);
      expect(report.summary.warnings).toBe(0);
      expect(report.summary.infos).toBe(0);
    } finally {
      await cleanup();
    }
  });

  it('surfaces rule violations in report', async () => {
    const dir = await setup();
    try {
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

      const report = await runAudit(dir);
      expect(report.findings.length).toBeGreaterThan(0);
      expect(report.summary.errors).toBeGreaterThan(0);
    } finally {
      await cleanup();
    }
  });

  it('disables rules check with includeRules: false', async () => {
    const dir = await setup();
    try {
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

      const report = await runAudit(dir, { includeRules: false });
      const ruleFindings = report.findings.filter((f) => f.source === 'rule');
      expect(ruleFindings).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it('disables patterns check with includePatterns: false', async () => {
    const dir = await setup();
    try {
      const pattern = createPattern('P001', 'Use const', 'var x', 'const x');
      await appendMemoryItem(dir, pattern);

      await mkdir(join(dir, 'src'), { recursive: true });
      await writeFile(join(dir, 'src', 'file.ts'), 'var x = 1;\n');

      const report = await runAudit(dir, { includePatterns: false });
      const patternFindings = report.findings.filter((f) => f.source === 'pattern');
      expect(patternFindings).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it('disables lessons check with includeLessons: false', async () => {
    const dir = await setup();
    try {
      const lesson = createFullLesson('L001', 'Important lesson', 'high');
      await appendMemoryItem(dir, lesson);

      const report = await runAudit(dir, { includeLessons: false });
      const lessonFindings = report.findings.filter((f) => f.source === 'lesson');
      expect(lessonFindings).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it('summary counts are correct', async () => {
    const dir = await setup();
    try {
      // Create an error-level rule violation
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

      // Create a high-severity lesson (info finding)
      const lesson = createFullLesson('L001', 'Important', 'high');
      await appendMemoryItem(dir, lesson);

      const report = await runAudit(dir);
      expect(report.summary.errors).toBeGreaterThan(0);
      expect(report.summary.infos).toBeGreaterThan(0);
      expect(report.summary.errors + report.summary.warnings + report.summary.infos).toBe(
        report.findings.length
      );
    } finally {
      await cleanup();
    }
  });

  it('report has valid ISO8601 timestamp', async () => {
    const dir = await setup();
    try {
      const report = await runAudit(dir);
      const parsed = new Date(report.timestamp);
      expect(parsed.toISOString()).toBe(report.timestamp);
    } finally {
      await cleanup();
    }
  });

  it('report validates against AuditReportSchema', async () => {
    const dir = await setup();
    try {
      const report = await runAudit(dir);
      const result = AuditReportSchema.safeParse(report);
      expect(result.success).toBe(true);
    } finally {
      await cleanup();
    }
  });
});
