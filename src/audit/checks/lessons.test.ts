/**
 * Tests for lessons audit check.
 *
 * Verifies that high-severity lessons appear as info-level findings.
 */

import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkLessons } from './lessons.js';
import { createFullLesson } from '../../test-utils.js';
import { appendMemoryItem } from '../../memory/storage/jsonl.js';

describe('checkLessons', () => {
  let tempDir: string;

  async function setup(): Promise<string> {
    tempDir = await mkdtemp(join(tmpdir(), 'audit-lessons-'));
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
      const result = await checkLessons(dir);
      expect(result.findings).toEqual([]);
      expect(result.filesChecked).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it('returns findings for high-severity lessons', async () => {
    const dir = await setup();
    try {
      const lesson = createFullLesson('L001', 'Always validate input', 'high');
      await appendMemoryItem(dir, lesson);

      const result = await checkLessons(dir);
      expect(result.findings.length).toBe(1);

      const finding = result.findings[0]!;
      expect(finding.source).toBe('lesson');
      expect(finding.severity).toBe('info');
      expect(finding.relatedLessonId).toBe('L001');

      // filesChecked should include the JSONL path
      expect(result.filesChecked.length).toBe(1);
    } finally {
      await cleanup();
    }
  });

  it('skips low-severity lessons', async () => {
    const dir = await setup();
    try {
      const lesson = createFullLesson('L002', 'Minor style preference', 'low');
      await appendMemoryItem(dir, lesson);

      const result = await checkLessons(dir);
      expect(result.findings).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it('skips medium-severity lessons', async () => {
    const dir = await setup();
    try {
      const lesson = createFullLesson('L003', 'Medium importance', 'medium');
      await appendMemoryItem(dir, lesson);

      const result = await checkLessons(dir);
      expect(result.findings).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it('skips deleted lessons', async () => {
    const dir = await setup();
    try {
      const lesson = createFullLesson('L004', 'Deleted lesson', 'high', { deleted: true });
      await appendMemoryItem(dir, lesson);

      const result = await checkLessons(dir);
      expect(result.findings).toEqual([]);
    } finally {
      await cleanup();
    }
  });
});
