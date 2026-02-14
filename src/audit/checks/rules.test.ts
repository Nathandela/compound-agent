/**
 * Tests for rules audit check.
 *
 * Verifies that rule violations are correctly converted to AuditFinding format.
 */

import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkRules } from './rules.js';
import type { AuditFinding } from '../types.js';

describe('checkRules', () => {
  let tempDir: string;

  async function setup(): Promise<string> {
    tempDir = await mkdtemp(join(tmpdir(), 'audit-rules-'));
    return tempDir;
  }

  async function cleanup(): Promise<void> {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  it('returns empty findings when no rules config exists', async () => {
    const dir = await setup();
    try {
      const findings = checkRules(dir);
      expect(findings).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it('returns empty findings when rules array is empty', async () => {
    const dir = await setup();
    try {
      await mkdir(join(dir, '.claude'), { recursive: true });
      await writeFile(join(dir, '.claude', 'rules.json'), JSON.stringify({ rules: [] }));

      const findings = checkRules(dir);
      expect(findings).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it('converts rule violations to AuditFinding format', async () => {
    const dir = await setup();
    try {
      // Create a file that violates a rule
      await mkdir(join(dir, 'src'), { recursive: true });
      await writeFile(join(dir, 'src', 'bad.ts'), 'console.log("debug");\n');

      await mkdir(join(dir, '.claude'), { recursive: true });
      await writeFile(
        join(dir, '.claude', 'rules.json'),
        JSON.stringify({
          rules: [
            {
              id: 'no-console',
              description: 'No console.log in source',
              severity: 'error',
              check: { type: 'file-pattern', glob: 'src/**/*.ts', pattern: 'console\\.log' },
              remediation: 'Use logger instead',
            },
          ],
        })
      );

      const findings = checkRules(dir);
      expect(findings.length).toBeGreaterThan(0);

      const finding = findings[0]!;
      expect(finding.source).toBe('rule');
      expect(finding.severity).toBe('error');
      expect(finding.file).toBeDefined();
      expect(finding.issue).toBeDefined();
    } finally {
      await cleanup();
    }
  });

  it('preserves severity mapping from rules', async () => {
    const dir = await setup();
    try {
      await mkdir(join(dir, 'src'), { recursive: true });
      await writeFile(join(dir, 'src', 'file.ts'), 'TODO: fix this\n');

      await mkdir(join(dir, '.claude'), { recursive: true });
      await writeFile(
        join(dir, '.claude', 'rules.json'),
        JSON.stringify({
          rules: [
            {
              id: 'no-todo',
              description: 'No TODO comments',
              severity: 'warning',
              check: { type: 'file-pattern', glob: 'src/**/*.ts', pattern: 'TODO' },
              remediation: 'Create an issue instead',
            },
          ],
        })
      );

      const findings = checkRules(dir);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0]!.severity).toBe('warning');
    } finally {
      await cleanup();
    }
  });

  it('multiple violations produce multiple findings', async () => {
    const dir = await setup();
    try {
      await mkdir(join(dir, 'src'), { recursive: true });
      await writeFile(join(dir, 'src', 'a.ts'), 'console.log("a");\n');
      await writeFile(join(dir, 'src', 'b.ts'), 'console.log("b");\n');

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

      const findings = checkRules(dir);
      expect(findings.length).toBeGreaterThanOrEqual(2);
      for (const f of findings) {
        expect(f.source).toBe('rule');
      }
    } finally {
      await cleanup();
    }
  });
});
