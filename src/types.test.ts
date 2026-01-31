import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import {
  QuickLessonSchema,
  FullLessonSchema,
  LessonSchema,
  TombstoneSchema,
  SourceSchema,
  ContextSchema,
  PatternSchema,
  SeveritySchema,
  generateId,
  type QuickLesson,
  type FullLesson,
  type Lesson,
} from './types.js';

describe('QuickLessonSchema', () => {
  const validQuickLesson: QuickLesson = {
    id: 'L001',
    type: 'quick',
    trigger: 'Used pandas for large file',
    insight: 'Use Polars for files > 100MB',
    tags: ['performance', 'polars'],
    source: 'user_correction',
    context: {
      tool: 'edit',
      intent: 'optimize CSV processing',
    },
    created: '2026-01-30T12:00:00Z',
    confirmed: true,
    supersedes: [],
    related: [],
  };

  it('validates a correct quick lesson', () => {
    const result = QuickLessonSchema.safeParse(validQuickLesson);
    expect(result.success).toBe(true);
  });

  it('requires type to be "quick"', () => {
    const invalid = { ...validQuickLesson, type: 'full' };
    const result = QuickLessonSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('requires all source types', () => {
    const sources = ['user_correction', 'self_correction', 'test_failure', 'manual'] as const;
    for (const source of sources) {
      const lesson = { ...validQuickLesson, source };
      const result = QuickLessonSchema.safeParse(lesson);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid source', () => {
    const invalid = { ...validQuickLesson, source: 'invalid' };
    const result = QuickLessonSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('allows optional deleted field', () => {
    const withDeleted = { ...validQuickLesson, deleted: true };
    const result = QuickLessonSchema.safeParse(withDeleted);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deleted).toBe(true);
    }
  });

  it('allows optional retrievalCount', () => {
    const withCount = { ...validQuickLesson, retrievalCount: 5 };
    const result = QuickLessonSchema.safeParse(withCount);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.retrievalCount).toBe(5);
    }
  });
});

describe('FullLessonSchema', () => {
  const validFullLesson: FullLesson = {
    id: 'L002',
    type: 'full',
    trigger: 'API call failed silently',
    insight: 'Always check response.ok before parsing JSON',
    evidence: 'Silent failure caused 30min debugging session',
    severity: 'high',
    tags: ['api', 'error-handling'],
    source: 'self_correction',
    context: {
      tool: 'bash',
      intent: 'fetch data from API',
    },
    created: '2026-01-30T12:00:00Z',
    confirmed: true,
    supersedes: ['L001'],
    related: [],
  };

  it('validates a correct full lesson', () => {
    const result = FullLessonSchema.safeParse(validFullLesson);
    expect(result.success).toBe(true);
  });

  it('requires type to be "full"', () => {
    const invalid = { ...validFullLesson, type: 'quick' };
    const result = FullLessonSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('requires severity field', () => {
    const { severity: _, ...noSeverity } = validFullLesson;
    const result = FullLessonSchema.safeParse(noSeverity);
    expect(result.success).toBe(false);
  });

  it('validates severity values', () => {
    const severities = ['high', 'medium', 'low'] as const;
    for (const severity of severities) {
      const lesson = { ...validFullLesson, severity };
      const result = FullLessonSchema.safeParse(lesson);
      expect(result.success).toBe(true);
    }
  });

  it('allows optional pattern field', () => {
    const withPattern = {
      ...validFullLesson,
      pattern: {
        bad: 'const data = await response.json()',
        good: 'if (!response.ok) throw new Error(); const data = await response.json()',
      },
    };
    const result = FullLessonSchema.safeParse(withPattern);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pattern?.bad).toBeDefined();
      expect(result.data.pattern?.good).toBeDefined();
    }
  });
});

describe('LessonSchema (discriminated union)', () => {
  it('accepts quick lessons', () => {
    const quick: Lesson = {
      id: 'L001',
      type: 'quick',
      trigger: 'test',
      insight: 'test insight',
      tags: [],
      source: 'manual',
      context: { tool: 'test', intent: 'test' },
      created: '2026-01-30T12:00:00Z',
      confirmed: false,
      supersedes: [],
      related: [],
    };
    const result = LessonSchema.safeParse(quick);
    expect(result.success).toBe(true);
  });

  it('accepts full lessons', () => {
    const full: Lesson = {
      id: 'L002',
      type: 'full',
      trigger: 'test',
      insight: 'test insight',
      evidence: 'test evidence',
      severity: 'medium',
      tags: [],
      source: 'manual',
      context: { tool: 'test', intent: 'test' },
      created: '2026-01-30T12:00:00Z',
      confirmed: false,
      supersedes: [],
      related: [],
    };
    const result = LessonSchema.safeParse(full);
    expect(result.success).toBe(true);
  });

  it('rejects invalid type', () => {
    const invalid = {
      id: 'L003',
      type: 'invalid',
      trigger: 'test',
      insight: 'test',
    };
    const result = LessonSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('TombstoneSchema', () => {
  it('validates tombstone record', () => {
    const tombstone = {
      id: 'L001',
      deleted: true,
      deletedAt: '2026-01-30T12:00:00Z',
    };
    const result = TombstoneSchema.safeParse(tombstone);
    expect(result.success).toBe(true);
  });

  it('requires deleted to be true', () => {
    const invalid = {
      id: 'L001',
      deleted: false,
      deletedAt: '2026-01-30T12:00:00Z',
    };
    const result = TombstoneSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('SourceSchema', () => {
  it('validates all source types', () => {
    const sources = ['user_correction', 'self_correction', 'test_failure', 'manual'];
    for (const source of sources) {
      const result = SourceSchema.safeParse(source);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid source', () => {
    const result = SourceSchema.safeParse('invalid_source');
    expect(result.success).toBe(false);
  });
});

describe('ContextSchema', () => {
  it('validates context with required fields', () => {
    const result = ContextSchema.safeParse({ tool: 'edit', intent: 'refactor' });
    expect(result.success).toBe(true);
  });

  it('rejects context missing tool', () => {
    const result = ContextSchema.safeParse({ intent: 'refactor' });
    expect(result.success).toBe(false);
  });

  it('rejects context missing intent', () => {
    const result = ContextSchema.safeParse({ tool: 'edit' });
    expect(result.success).toBe(false);
  });
});

describe('PatternSchema', () => {
  it('validates pattern with bad and good', () => {
    const result = PatternSchema.safeParse({ bad: 'old code', good: 'new code' });
    expect(result.success).toBe(true);
  });

  it('rejects pattern missing bad', () => {
    const result = PatternSchema.safeParse({ good: 'new code' });
    expect(result.success).toBe(false);
  });

  it('rejects pattern missing good', () => {
    const result = PatternSchema.safeParse({ bad: 'old code' });
    expect(result.success).toBe(false);
  });
});

describe('SeveritySchema', () => {
  it('validates all severity levels', () => {
    const severities = ['high', 'medium', 'low'];
    for (const severity of severities) {
      const result = SeveritySchema.safeParse(severity);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid severity', () => {
    const result = SeveritySchema.safeParse('critical');
    expect(result.success).toBe(false);
  });
});

describe('generateId', () => {
  it('returns deterministic hash for same input', () => {
    const insight = 'Use Polars for large files';
    const id1 = generateId(insight);
    const id2 = generateId(insight);
    expect(id1).toBe(id2);
  });

  it('returns different hash for different input', () => {
    const id1 = generateId('insight one');
    const id2 = generateId('insight two');
    expect(id1).not.toBe(id2);
  });

  it('returns string starting with L', () => {
    const id = generateId('test insight');
    expect(id).toMatch(/^L[a-f0-9]+$/);
  });

  it('handles empty string', () => {
    const id = generateId('');
    expect(id).toMatch(/^L[a-f0-9]+$/);
  });

  it('produces consistent length', () => {
    const ids = [
      generateId('short'),
      generateId('a much longer insight string that contains many words'),
      generateId(''),
    ];
    // All IDs should be same length (L + 8 hex chars = 9)
    for (const id of ids) {
      expect(id.length).toBe(9);
    }
  });
});
