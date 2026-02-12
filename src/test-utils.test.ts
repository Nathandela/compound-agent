import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { createLesson, createQuickLesson, createFullLesson, daysAgo } from './test-utils.js';

describe('test-utils', () => {
  describe('createLesson', () => {
    it('creates lesson with defaults when no overrides provided', () => {
      const lesson = createLesson();

      expect(lesson.id).toBe('L001');
      expect(lesson.insight).toBe('test insight');
      expect(lesson.type).toBe('lesson');
      expect(lesson.trigger).toBe('trigger for test insight');
      expect(lesson.tags).toEqual([]);
      expect(lesson.source).toBe('manual');
      expect(lesson.context).toEqual({ tool: 'test', intent: 'testing' });
      expect(lesson.confirmed).toBe(true);
      expect(lesson.supersedes).toEqual([]);
      expect(lesson.related).toEqual([]);
      // Optional fields should NOT be present
      expect('evidence' in lesson).toBe(false);
      expect('severity' in lesson).toBe(false);
      expect('pattern' in lesson).toBe(false);
      expect('deleted' in lesson).toBe(false);
      expect('retrievalCount' in lesson).toBe(false);
    });

    it('uses provided id when specified', () => {
      const lesson = createLesson({ id: 'CUSTOM-ID' });
      expect(lesson.id).toBe('CUSTOM-ID');
    });

    it('uses provided insight when specified', () => {
      const lesson = createLesson({ insight: 'custom insight' });
      expect(lesson.insight).toBe('custom insight');
    });

    it('uses provided type when specified', () => {
      const lesson = createLesson({ type: 'lesson' });
      expect(lesson.type).toBe('lesson');
    });

    it('uses provided trigger when specified', () => {
      const lesson = createLesson({ trigger: 'custom trigger' });
      expect(lesson.trigger).toBe('custom trigger');
    });

    it('uses provided tags when specified', () => {
      const lesson = createLesson({ tags: ['tag1', 'tag2'] });
      expect(lesson.tags).toEqual(['tag1', 'tag2']);
    });

    it('uses provided source when specified', () => {
      const lesson = createLesson({ source: 'auto' });
      expect(lesson.source).toBe('auto');
    });

    it('uses provided context when specified', () => {
      const context = { tool: 'custom-tool', intent: 'custom-intent' };
      const lesson = createLesson({ context });
      expect(lesson.context).toEqual(context);
    });

    it('uses provided created when specified', () => {
      const created = '2024-01-15T00:00:00.000Z';
      const lesson = createLesson({ created });
      expect(lesson.created).toBe(created);
    });

    it('uses provided confirmed when specified', () => {
      const lesson = createLesson({ confirmed: false });
      expect(lesson.confirmed).toBe(false);
    });

    it('uses provided supersedes when specified', () => {
      const lesson = createLesson({ supersedes: ['L000'] });
      expect(lesson.supersedes).toEqual(['L000']);
    });

    it('uses provided related when specified', () => {
      const lesson = createLesson({ related: ['L002', 'L003'] });
      expect(lesson.related).toEqual(['L002', 'L003']);
    });

    // Conditional spread tests - these cover the uncovered branches (lines 59-63)
    it('includes evidence when provided', () => {
      const lesson = createLesson({ evidence: 'test evidence' });
      expect(lesson.evidence).toBe('test evidence');
      expect('evidence' in lesson).toBe(true);
    });

    it('excludes evidence when undefined', () => {
      const lesson = createLesson({ evidence: undefined });
      expect('evidence' in lesson).toBe(false);
    });

    it('includes severity when provided', () => {
      const lesson = createLesson({ severity: 'high' });
      expect(lesson.severity).toBe('high');
      expect('severity' in lesson).toBe(true);
    });

    it('excludes severity when undefined', () => {
      const lesson = createLesson({ severity: undefined });
      expect('severity' in lesson).toBe(false);
    });

    it('includes pattern when provided', () => {
      const lesson = createLesson({ pattern: 'anti-pattern' });
      expect(lesson.pattern).toBe('anti-pattern');
      expect('pattern' in lesson).toBe(true);
    });

    it('excludes pattern when undefined', () => {
      const lesson = createLesson({ pattern: undefined });
      expect('pattern' in lesson).toBe(false);
    });

    it('includes deleted when provided', () => {
      const lesson = createLesson({ deleted: true });
      expect(lesson.deleted).toBe(true);
      expect('deleted' in lesson).toBe(true);
    });

    it('excludes deleted when undefined', () => {
      const lesson = createLesson({ deleted: undefined });
      expect('deleted' in lesson).toBe(false);
    });

    it('includes retrievalCount when provided', () => {
      const lesson = createLesson({ retrievalCount: 5 });
      expect(lesson.retrievalCount).toBe(5);
      expect('retrievalCount' in lesson).toBe(true);
    });

    it('excludes retrievalCount when undefined', () => {
      const lesson = createLesson({ retrievalCount: undefined });
      expect('retrievalCount' in lesson).toBe(false);
    });

    it('includes multiple optional fields when provided', () => {
      const lesson = createLesson({
        evidence: 'evidence text',
        severity: 'critical',
        pattern: 'best-practice',
        deleted: false,
        retrievalCount: 10,
      });

      expect(lesson.evidence).toBe('evidence text');
      expect(lesson.severity).toBe('critical');
      expect(lesson.pattern).toBe('best-practice');
      expect(lesson.deleted).toBe(false);
      expect(lesson.retrievalCount).toBe(10);
    });
  });

  describe('createQuickLesson', () => {
    it('creates quick lesson with required fields', () => {
      const lesson = createQuickLesson('Q001', 'Quick insight');

      expect(lesson.id).toBe('Q001');
      expect(lesson.type).toBe('lesson');
      expect(lesson.insight).toBe('Quick insight');
      expect(lesson.trigger).toBe('trigger for Quick insight');
      expect(lesson.tags).toEqual([]);
      expect(lesson.source).toBe('manual');
      expect(lesson.confirmed).toBe(true);
    });

    it('uses numeric days ago for created', () => {
      const lesson = createQuickLesson('Q002', 'Test', { created: 5 });

      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const lessonDate = new Date(lesson.created);

      // Allow 1 second tolerance for test execution time
      expect(Math.abs(lessonDate.getTime() - fiveDaysAgo.getTime())).toBeLessThan(1000);
    });

    it('uses string ISO date for created', () => {
      const isoDate = '2024-06-15T12:00:00.000Z';
      const lesson = createQuickLesson('Q003', 'Test', { created: isoDate });
      expect(lesson.created).toBe(isoDate);
    });

    it('uses custom trigger when provided', () => {
      const lesson = createQuickLesson('Q004', 'Test', { trigger: 'custom trigger' });
      expect(lesson.trigger).toBe('custom trigger');
    });

    it('uses custom tags when provided', () => {
      const lesson = createQuickLesson('Q005', 'Test', { tags: ['a', 'b'] });
      expect(lesson.tags).toEqual(['a', 'b']);
    });

    it('uses custom confirmed when provided', () => {
      const lesson = createQuickLesson('Q006', 'Test', { confirmed: false });
      expect(lesson.confirmed).toBe(false);
    });

    it('includes deleted when provided', () => {
      const lesson = createQuickLesson('Q007', 'Test', { deleted: true });
      expect(lesson.deleted).toBe(true);
      expect('deleted' in lesson).toBe(true);
    });

    it('excludes deleted when not provided', () => {
      const lesson = createQuickLesson('Q008', 'Test');
      expect('deleted' in lesson).toBe(false);
    });
  });

  describe('createFullLesson', () => {
    it('creates full lesson with required fields', () => {
      const lesson = createFullLesson('F001', 'Full insight');

      expect(lesson.id).toBe('F001');
      expect(lesson.type).toBe('lesson');
      expect(lesson.insight).toBe('Full insight');
      expect(lesson.evidence).toBe('Test evidence');
      expect(lesson.severity).toBe('medium');
      expect(lesson.trigger).toBe('trigger for Full insight');
    });

    it('uses custom severity', () => {
      const lesson = createFullLesson('F002', 'Test', 'critical');
      expect(lesson.severity).toBe('critical');
    });

    it('uses custom evidence from options', () => {
      const lesson = createFullLesson('F003', 'Test', 'low', { evidence: 'custom evidence' });
      expect(lesson.evidence).toBe('custom evidence');
    });

    it('uses numeric days ago for created', () => {
      const lesson = createFullLesson('F004', 'Test', 'medium', { created: 10 });

      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      const lessonDate = new Date(lesson.created);

      expect(Math.abs(lessonDate.getTime() - tenDaysAgo.getTime())).toBeLessThan(1000);
    });

    it('uses string ISO date for created', () => {
      const isoDate = '2024-03-01T00:00:00.000Z';
      const lesson = createFullLesson('F005', 'Test', 'high', { created: isoDate });
      expect(lesson.created).toBe(isoDate);
    });

    it('includes deleted when provided', () => {
      const lesson = createFullLesson('F006', 'Test', 'low', { deleted: true });
      expect(lesson.deleted).toBe(true);
      expect('deleted' in lesson).toBe(true);
    });

    it('excludes deleted when not provided', () => {
      const lesson = createFullLesson('F007', 'Test', 'low');
      expect('deleted' in lesson).toBe(false);
    });
  });

  describe('consolidation: no duplicate test utility files', () => {
    const srcDir = join(new URL('.', import.meta.url).pathname);

    it('src/commands/test-helpers.ts should not exist', () => {
      expect(existsSync(join(srcDir, 'commands', 'test-helpers.ts'))).toBe(false);
    });

    it('src/cli/cli-test-utils.ts should not exist', () => {
      expect(existsSync(join(srcDir, 'cli', 'cli-test-utils.ts'))).toBe(false);
    });

    it('src/storage/sqlite/test-helpers.ts should not exist', () => {
      expect(existsSync(join(srcDir, 'storage', 'sqlite', 'test-helpers.ts'))).toBe(false);
    });
  });

  describe('barrel export hygiene', () => {
    it('AGENTS_MD_TEMPLATE is not exported from commands barrel', async () => {
      const srcDir = join(new URL('.', import.meta.url).pathname);
      const barrelPath = join(srcDir, 'commands', 'index.ts');
      const content = await readFile(barrelPath, 'utf8');
      expect(content).not.toContain('AGENTS_MD_TEMPLATE');
    });
  });

  describe('daysAgo', () => {
    it('returns ISO date string for past days', () => {
      const result = daysAgo(7);

      // Verify it's a valid ISO string
      expect(() => new Date(result)).not.toThrow();

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const resultDate = new Date(result);

      expect(Math.abs(resultDate.getTime() - sevenDaysAgo.getTime())).toBeLessThan(1000);
    });

    it('returns current date for zero days', () => {
      const result = daysAgo(0);
      const now = new Date();
      const resultDate = new Date(result);

      expect(Math.abs(resultDate.getTime() - now.getTime())).toBeLessThan(1000);
    });
  });
});
