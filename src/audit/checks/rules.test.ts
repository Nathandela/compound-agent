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
import type { AuditCheckResult } from '../types.js';

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
      const result = checkRules(dir);
      expect(result.findings).toEqual([]);
      expect(result.filesChecked).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it('returns empty findings when rules array is empty', async () => {
    const dir = await setup();
    try {
      await mkdir(join(dir, '.claude'), { recursive: true });
      await writeFile(join(dir, '.claude', 'rules.json'), JSON.stringify({ rules: [] }));

      const result = checkRules(dir);
      expect(result.findings).toEqual([]);
      expect(result.filesChecked).toEqual([]);
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

      const result = checkRules(dir);
      expect(result.findings.length).toBeGreaterThan(0);

      const finding = result.findings[0]!;
      expect(finding.source).toBe('rule');
      expect(finding.severity).toBe('error');
      expect(finding.file).toBeDefined();
      expect(finding.issue).toBeDefined();

      // filesChecked should include the violating file
      expect(result.filesChecked.length).toBeGreaterThan(0);
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

      const result = checkRules(dir);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings[0]!.severity).toBe('warning');
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

      const result = checkRules(dir);
      expect(result.findings.length).toBeGreaterThanOrEqual(2);
      for (const f of result.findings) {
        expect(f.source).toBe('rule');
      }
      // Both violating files should be in filesChecked
      expect(result.filesChecked.length).toBeGreaterThanOrEqual(2);
    } finally {
      await cleanup();
    }
  });

  it('returns error finding for malformed rules config', async () => {
    const dir = await setup();
    try {
      await mkdir(join(dir, '.claude'), { recursive: true });
      await writeFile(join(dir, '.claude', 'rules.json'), '{ not valid json !!!');

      const result = checkRules(dir);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0]!.severity).toBe('error');
      expect(result.findings[0]!.source).toBe('rule');
      expect(result.findings[0]!.file).toBe('.claude/rules.json');
      expect(result.findings[0]!.issue).toMatch(/Invalid rules configuration/);
    } finally {
      await cleanup();
    }
  });

  it('returns error finding for schema-invalid rules config', async () => {
    const dir = await setup();
    try {
      await mkdir(join(dir, '.claude'), { recursive: true });
      // Valid JSON but invalid schema (missing required fields)
      await writeFile(join(dir, '.claude', 'rules.json'), JSON.stringify({ rules: [{ bad: true }] }));

      const result = checkRules(dir);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0]!.severity).toBe('error');
      expect(result.findings[0]!.source).toBe('rule');
    } finally {
      await cleanup();
    }
  });
});
