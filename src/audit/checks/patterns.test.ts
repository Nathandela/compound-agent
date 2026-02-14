/**
 * Tests for patterns audit check.
 *
 * Verifies that memory items with pattern.bad are matched against file contents.
 */

import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkPatterns } from './patterns.js';
import { createPattern, createLesson } from '../../test-utils.js';
import { appendMemoryItem } from '../../memory/storage/jsonl.js';

describe('checkPatterns', () => {
  let tempDir: string;

  async function setup(): Promise<string> {
    tempDir = await mkdtemp(join(tmpdir(), 'audit-patterns-'));
    return tempDir;
  }

  async function cleanup(): Promise<void> {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  it('returns empty findings when no memory items exist', async () => {
    const dir = await setup();
    try {
      const result = await checkPatterns(dir);
      expect(result.findings).toEqual([]);
      expect(result.filesChecked).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it('returns empty findings when items have no pattern.bad', async () => {
    const dir = await setup();
    try {
      const lesson = createLesson({ id: 'L001', insight: 'some insight' });
      await appendMemoryItem(dir, lesson);

      const result = await checkPatterns(dir);
      expect(result.findings).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it('finds pattern.bad matches in source files', async () => {
    const dir = await setup();
    try {
      // Create a pattern with bad code
      const pattern = createPattern('P001', 'Use const', 'var x', 'const x');
      await appendMemoryItem(dir, pattern);

      // Create a source file containing the bad pattern
      await mkdir(join(dir, 'src'), { recursive: true });
      await writeFile(join(dir, 'src', 'example.ts'), 'var x = 1;\n');

      const result = await checkPatterns(dir);
      expect(result.findings.length).toBeGreaterThan(0);

      const finding = result.findings[0]!;
      expect(finding.source).toBe('pattern');
      expect(finding.relatedLessonId).toBe('P001');
      expect(finding.severity).toBe('warning');
      expect(finding.file).toContain('example.ts');

      // filesChecked should include scanned source files
      expect(result.filesChecked.length).toBeGreaterThan(0);
    } finally {
      await cleanup();
    }
  });

  it('skips items without pattern.bad defined', async () => {
    const dir = await setup();
    try {
      // Lesson with optional pattern but no bad field - use a lesson without pattern
      const lesson = createLesson({ id: 'L001', insight: 'some insight' });
      await appendMemoryItem(dir, lesson);

      await mkdir(join(dir, 'src'), { recursive: true });
      await writeFile(join(dir, 'src', 'file.ts'), 'some code\n');

      const result = await checkPatterns(dir);
      expect(result.findings).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it('sets relatedLessonId to the item ID', async () => {
    const dir = await setup();
    try {
      const pattern = createPattern('P042', 'Avoid any', 'any', 'unknown');
      await appendMemoryItem(dir, pattern);

      await mkdir(join(dir, 'src'), { recursive: true });
      await writeFile(join(dir, 'src', 'types.ts'), 'const val: any = 1;\n');

      const result = await checkPatterns(dir);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings[0]!.relatedLessonId).toBe('P042');
    } finally {
      await cleanup();
    }
  });
});
