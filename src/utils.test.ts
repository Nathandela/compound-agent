/**
 * Tests for shared utility functions.
 */

import { describe, expect, it } from 'vitest';

import { getLessonAgeDays, MS_PER_DAY } from './utils.js';

describe('getLessonAgeDays', () => {
  it('returns 0 for lesson created today', () => {
    const now = new Date();
    const lesson = { created: now.toISOString() };

    expect(getLessonAgeDays(lesson)).toBe(0);
  });

  it('returns 30 for lesson created 30 days ago', () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * MS_PER_DAY);
    const lesson = { created: thirtyDaysAgo.toISOString() };

    expect(getLessonAgeDays(lesson)).toBe(30);
  });

  it('returns 90 for lesson created 90 days ago', () => {
    const ninetyDaysAgo = new Date(Date.now() - 90 * MS_PER_DAY);
    const lesson = { created: ninetyDaysAgo.toISOString() };

    expect(getLessonAgeDays(lesson)).toBe(90);
  });

  it('rounds down partial days', () => {
    // 30.5 days ago should return 30
    const thirtyAndHalfDaysAgo = new Date(Date.now() - 30.5 * MS_PER_DAY);
    const lesson = { created: thirtyAndHalfDaysAgo.toISOString() };

    expect(getLessonAgeDays(lesson)).toBe(30);
  });

  it('handles future dates by returning negative values', () => {
    const tomorrow = new Date(Date.now() + MS_PER_DAY);
    const lesson = { created: tomorrow.toISOString() };

    expect(getLessonAgeDays(lesson)).toBe(-1);
  });

  it('works with full Lesson objects', () => {
    const lesson = {
      id: 'L001',
      type: 'lesson' as const,
      trigger: 'test',
      insight: 'test',
      tags: [],
      source: 'manual' as const,
      context: { tool: 'test', intent: 'testing' },
      created: new Date(Date.now() - 7 * MS_PER_DAY).toISOString(),
      confirmed: true,
      supersedes: [],
      related: [],
    };

    expect(getLessonAgeDays(lesson)).toBe(7);
  });
});
