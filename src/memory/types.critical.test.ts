import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { fc, test } from '@fast-check/vitest';

import {
  ContextSchema,
  generateId,
  LessonRecordSchema,
  LessonSchema,
  LessonItemSchema,
  SolutionItemSchema,
  PatternItemSchema,
  PreferenceItemSchema,
  MemoryItemSchema,
  MemoryItemTypeSchema,
  MemoryItemRecordSchema,
  LegacyLessonSchema,
  PatternSchema,
  SeveritySchema,
  SourceSchema,
  type Lesson,
  type MemoryItem,
} from './types.js';

// Number of fast-check iterations: 100 in CI, 20 locally for faster feedback
const FC_RUNS = process.env.CI ? 100 : 20;

describe('LessonSchema (now type: lesson)', () => {
  const baseLesson = {
    id: 'L001',
    trigger: 'Used pandas for large file',
    insight: 'Use Polars for files > 100MB',
    tags: ['performance', 'polars'],
    source: 'user_correction' as const,
    context: {
      tool: 'edit',
      intent: 'optimize CSV processing',
    },
    created: '2026-01-30T12:00:00Z',
    confirmed: true,
    supersedes: [],
    related: [],
  };

  describe('type field validation', () => {
    it('accepts type: "lesson"', () => {
      const lesson = { ...baseLesson, type: 'lesson' };
      const result = LessonSchema.safeParse(lesson);
      expect(result.success).toBe(true);
    });

    it('rejects old type: "quick" (use LegacyLessonSchema)', () => {
      const quick = { ...baseLesson, type: 'quick' };
      const result = LessonSchema.safeParse(quick);
      expect(result.success).toBe(false);
    });

    it('rejects old type: "full" (use LegacyLessonSchema)', () => {
      const full = { ...baseLesson, type: 'full' };
      const result = LessonSchema.safeParse(full);
      expect(result.success).toBe(false);
    });

    it('rejects invalid type', () => {
      const invalid = { ...baseLesson, type: 'invalid' };
      const result = LessonSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects missing type', () => {
      const result = LessonSchema.safeParse(baseLesson);
      expect(result.success).toBe(false);
    });
  });

  describe('optional fields (evidence, severity, pattern)', () => {
    it('accepts lesson without evidence', () => {
      const lesson = { ...baseLesson, type: 'lesson' };
      const result = LessonSchema.safeParse(lesson);
      expect(result.success).toBe(true);
    });

    it('accepts lesson with evidence', () => {
      const lesson = {
        ...baseLesson,
        type: 'lesson',
        evidence: 'Silent failure caused 30min debugging',
      };
      const result = LessonSchema.safeParse(lesson);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.evidence).toBe('Silent failure caused 30min debugging');
      }
    });

    it('accepts lesson without severity', () => {
      const lesson = { ...baseLesson, type: 'lesson' };
      const result = LessonSchema.safeParse(lesson);
      expect(result.success).toBe(true);
    });

    it('accepts lesson with severity', () => {
      const lesson = {
        ...baseLesson,
        type: 'lesson',
        severity: 'high',
      };
      const result = LessonSchema.safeParse(lesson);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.severity).toBe('high');
      }
    });

    it('validates all severity values', () => {
      const severities = ['high', 'medium', 'low'] as const;
      for (const severity of severities) {
        const lesson = { ...baseLesson, type: 'lesson', severity };
        const result = LessonSchema.safeParse(lesson);
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid severity', () => {
      const lesson = {
        ...baseLesson,
        type: 'lesson',
        severity: 'critical',
      };
      const result = LessonSchema.safeParse(lesson);
      expect(result.success).toBe(false);
    });

    it('accepts lesson without pattern', () => {
      const lesson = { ...baseLesson, type: 'lesson' };
      const result = LessonSchema.safeParse(lesson);
      expect(result.success).toBe(true);
    });

    it('accepts lesson with pattern', () => {
      const lesson = {
        ...baseLesson,
        type: 'lesson',
        pattern: {
          bad: 'const data = await response.json()',
          good: 'if (!response.ok) throw new Error(); const data = await response.json()',
        },
      };
      const result = LessonSchema.safeParse(lesson);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pattern?.bad).toBeDefined();
        expect(result.data.pattern?.good).toBeDefined();
      }
    });
  });

  describe('required base fields', () => {
    it('validates all source types', () => {
      const sources = ['user_correction', 'self_correction', 'test_failure', 'manual'] as const;
      for (const source of sources) {
        const lesson = { ...baseLesson, type: 'lesson', source };
        const result = LessonSchema.safeParse(lesson);
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid source', () => {
      const invalid = { ...baseLesson, type: 'lesson', source: 'invalid' };
      const result = LessonSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('allows optional deleted field', () => {
      const withDeleted = { ...baseLesson, type: 'lesson', deleted: true };
      const result = LessonSchema.safeParse(withDeleted);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deleted).toBe(true);
      }
    });

    it('allows optional retrievalCount', () => {
      const withCount = { ...baseLesson, type: 'lesson', retrievalCount: 5 };
      const result = LessonSchema.safeParse(withCount);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.retrievalCount).toBe(5);
      }
    });
  });

  describe('backward compatibility via LegacyLessonSchema', () => {
    it('parses old quick lesson format', () => {
      const oldQuick = {
        id: 'L001',
        type: 'quick',
        trigger: 'Used pandas for large file',
        insight: 'Use Polars for files > 100MB',
        tags: ['performance'],
        source: 'user_correction',
        context: { tool: 'edit', intent: 'optimize' },
        created: '2026-01-30T12:00:00Z',
        confirmed: true,
        supersedes: [],
        related: [],
      };
      const result = LegacyLessonSchema.safeParse(oldQuick);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('quick');
        expect(result.data.evidence).toBeUndefined();
        expect(result.data.severity).toBeUndefined();
      }
    });

    it('parses old full lesson format', () => {
      const oldFull = {
        id: 'L002',
        type: 'full',
        trigger: 'API call failed silently',
        insight: 'Always check response.ok before parsing JSON',
        evidence: 'Silent failure caused 30min debugging session',
        severity: 'high',
        tags: ['api'],
        source: 'self_correction',
        context: { tool: 'bash', intent: 'fetch data' },
        created: '2026-01-30T12:00:00Z',
        confirmed: true,
        supersedes: ['L001'],
        related: [],
      };
      const result = LegacyLessonSchema.safeParse(oldFull);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('full');
        expect(result.data.evidence).toBe('Silent failure caused 30min debugging session');
        expect(result.data.severity).toBe('high');
      }
    });

    it('parses old full lesson with pattern', () => {
      const oldFullWithPattern = {
        id: 'L003',
        type: 'full',
        trigger: 'Bad pattern used',
        insight: 'Use good pattern',
        evidence: 'Evidence here',
        severity: 'medium',
        pattern: {
          bad: 'old code',
          good: 'new code',
        },
        tags: [],
        source: 'manual',
        context: { tool: 'test', intent: 'refactor' },
        created: '2026-01-30T12:00:00Z',
        confirmed: false,
        supersedes: [],
        related: [],
      };
      const result = LegacyLessonSchema.safeParse(oldFullWithPattern);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('full');
        expect(result.data.pattern?.bad).toBe('old code');
        expect(result.data.pattern?.good).toBe('new code');
      }
    });
  });

  describe('optional field combinations', () => {
    it('accepts lesson with evidence', () => {
      const lesson = {
        ...baseLesson,
        type: 'lesson',
        evidence: 'Evidence text',
      };
      const result = LessonSchema.safeParse(lesson);
      expect(result.success).toBe(true);
    });

    it('accepts lesson with severity', () => {
      const lesson = {
        ...baseLesson,
        type: 'lesson',
        severity: 'high',
      };
      const result = LessonSchema.safeParse(lesson);
      expect(result.success).toBe(true);
    });

    it('accepts lesson without evidence or severity', () => {
      const lesson = {
        ...baseLesson,
        type: 'lesson',
      };
      const result = LessonSchema.safeParse(lesson);
      expect(result.success).toBe(true);
    });

    it('accepts lesson with evidence but no severity', () => {
      const lesson = {
        ...baseLesson,
        type: 'lesson',
        evidence: 'Has evidence but no severity',
      };
      const result = LessonSchema.safeParse(lesson);
      expect(result.success).toBe(true);
    });
  });

  describe('type discriminator runtime checks', () => {
    it('supports lesson.type === "lesson" checks', () => {
      const lesson: Lesson = {
        ...baseLesson,
        type: 'lesson',
      };
      expect(lesson.type === 'lesson').toBe(true);
    });
  });
});

describe('Lesson deletion fields (simplified)', () => {
  const baseLesson = {
    id: 'L001',
    type: 'lesson' as const,
    trigger: 'Test trigger',
    insight: 'Test insight',
    tags: [],
    source: 'manual' as const,
    context: { tool: 'test', intent: 'testing' },
    created: '2026-01-30T12:00:00Z',
    confirmed: true,
    supersedes: [],
    related: [],
  };

  it('accepts lesson with deleted and deletedAt', () => {
    const result = LessonSchema.safeParse({
      ...baseLesson,
      deleted: true,
      deletedAt: '2026-01-30T12:00:00Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deleted).toBe(true);
      expect(result.data.deletedAt).toBe('2026-01-30T12:00:00Z');
    }
  });

  it('accepts lesson without deletion fields', () => {
    const result = LessonSchema.safeParse(baseLesson);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deleted).toBeUndefined();
      expect(result.data.deletedAt).toBeUndefined();
    }
  });

  it('accepts deleted:false (not deleted)', () => {
    const result = LessonSchema.safeParse({ ...baseLesson, deleted: false });
    expect(result.success).toBe(true);
  });
});

describe('LessonRecordSchema', () => {
  const baseLesson = {
    id: 'L001',
    type: 'lesson' as const,
    trigger: 'Test trigger',
    insight: 'Test insight',
    tags: [],
    source: 'manual' as const,
    context: { tool: 'test', intent: 'testing' },
    created: '2026-01-30T12:00:00Z',
    confirmed: true,
    supersedes: [],
    related: [],
  };

  it('accepts lesson with deleted flag', () => {
    const result = LessonRecordSchema.safeParse({ ...baseLesson, deleted: true, deletedAt: '2026-01-30T12:00:00Z' });
    expect(result.success).toBe(true);
  });

  it('accepts lesson without deleted flag', () => {
    const result = LessonRecordSchema.safeParse(baseLesson);
    expect(result.success).toBe(true);
  });

  it('backward compat: accepts old minimal tombstone { id, deleted, deletedAt }', () => {
    const oldTombstone = { id: 'L001', deleted: true, deletedAt: '2026-01-30T12:00:00Z' };
    const result = LessonRecordSchema.safeParse(oldTombstone);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data).sort()).toEqual(['deleted', 'deletedAt', 'id']);
    }
  });

  it('rejects record without id', () => {
    const invalid = { type: 'quick', insight: 'test' };
    const result = LessonRecordSchema.safeParse(invalid);
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
    // All IDs should be same length (L + 16 hex chars = 17)
    for (const id of ids) {
      expect(id.length).toBe(17);
    }
  });
});

// ============================================================================
// Property-Based Tests (fast-check)
// ============================================================================
//
// Key properties tested:
// 1. Backward compatibility - old quick/full format parses via LegacyLessonSchema
// 2. ID determinism - same insight always produces same ID
// 3. ID uniqueness - different insights produce different IDs
// 4. Type discrimination - type field is always 'lesson' after LessonSchema parse
// 5. Roundtrip - JSON serialization preserves all fields
// 6. Severity validation - all enum values accepted, invalid rejected
// 7. Optional fields - handled correctly when present/absent
// 8. Invariants - ID format, timestamps, non-empty strings maintained
// ============================================================================

describe('Property-Based Tests: Type Unification', () => {
  // Arbitraries for generating random lesson data
  const sourceArb = fc.constantFrom(
    'user_correction',
    'self_correction',
    'test_failure',
    'manual'
  );

  const severityArb = fc.constantFrom('high', 'medium', 'low');

  const contextArb = fc.record({
    tool: fc.string({ minLength: 1, maxLength: 50 }),
    intent: fc.string({ minLength: 1, maxLength: 100 }),
  });

  const patternArb = fc.record({
    bad: fc.string({ minLength: 1, maxLength: 200 }),
    good: fc.string({ minLength: 1, maxLength: 200 }),
  });

  // Helper to generate hex ID (L + 16 hex chars)
  const lessonIdArb = fc.bigInt({ min: 0n, max: 0xffffffffffffffffn }).map((n) => `L${n.toString(16).padStart(16, '0')}`);

  // Base lesson arbitrary (fields common to all lessons)
  const baseLessonFieldsArb = fc.record({
    id: lessonIdArb,
    trigger: fc.string({ minLength: 1, maxLength: 500 }),
    insight: fc.string({ minLength: 1, maxLength: 1000 }),
    tags: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 10 }),
    source: sourceArb,
    context: contextArb,
    created: fc
      .integer({ min: new Date('2020-01-01').getTime(), max: new Date('2030-12-31').getTime() })
      .map((timestamp) => new Date(timestamp).toISOString()),
    confirmed: fc.boolean(),
    supersedes: fc.array(lessonIdArb, { maxLength: 5 }),
    related: fc.array(lessonIdArb, { maxLength: 5 }),
  });

  // New lesson arbitrary (type: 'lesson')
  const lessonItemArb = baseLessonFieldsArb.chain((base) =>
    fc.option(patternArb, { nil: undefined }).map((p) => ({
      ...base,
      type: 'lesson' as const,
      ...(p ? { pattern: p } : {}),
    }))
  );

  // Lesson with optional extended fields
  const lessonWithExtraArb = baseLessonFieldsArb.chain((base) =>
    fc
      .record({
        evidence: fc.option(fc.string({ minLength: 1, maxLength: 500 }), { nil: undefined }),
        severity: fc.option(severityArb, { nil: undefined }),
        pattern: fc.option(patternArb, { nil: undefined }),
      })
      .map((extra) => ({
        ...base,
        type: 'lesson' as const,
        ...(extra.evidence ? { evidence: extra.evidence } : {}),
        ...(extra.severity ? { severity: extra.severity } : {}),
        ...(extra.pattern ? { pattern: extra.pattern } : {}),
      }))
  );

  // Old format arbitraries (for backward compatibility testing)
  const oldQuickLessonArb = baseLessonFieldsArb.map((base) => ({
    ...base,
    type: 'quick' as const,
  }));

  const oldFullLessonArb = baseLessonFieldsArb.chain((base) =>
    fc
      .record({
        evidence: fc.string({ minLength: 1, maxLength: 500 }),
        severity: severityArb,
        pattern: fc.option(patternArb, { nil: undefined }),
      })
      .map((extra) => ({
        ...base,
        type: 'full' as const,
        ...extra,
      }))
  );

  describe('Property 1: Backward Compatibility (LegacyLessonSchema)', () => {
    test.prop([oldQuickLessonArb], { numRuns: FC_RUNS })(
      'old QuickLesson format always parses via LegacyLessonSchema',
      (oldQuick) => {
        const result = LegacyLessonSchema.safeParse(oldQuick);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.type).toBe('quick');
          expect(result.data.trigger).toBe(oldQuick.trigger);
          expect(result.data.insight).toBe(oldQuick.insight);
        }
      }
    );

    test.prop([oldFullLessonArb], { numRuns: FC_RUNS })(
      'old FullLesson format always parses via LegacyLessonSchema',
      (oldFull) => {
        const result = LegacyLessonSchema.safeParse(oldFull);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.type).toBe('full');
          expect(result.data.evidence).toBe(oldFull.evidence);
          expect(result.data.severity).toBe(oldFull.severity);
        }
      }
    );

    test.prop([fc.array(fc.oneof(oldQuickLessonArb, oldFullLessonArb), { maxLength: 50 })], { numRuns: FC_RUNS })(
      'mixed old format lessons all parse via LessonRecordSchema',
      (lessons) => {
        const results = lessons.map((lesson) => LessonRecordSchema.safeParse(lesson));
        expect(results.every((r) => r.success)).toBe(true);
      }
    );
  });

  describe('Property 2: ID Determinism', () => {
    test.prop([fc.string({ minLength: 0, maxLength: 1000 })], { numRuns: FC_RUNS })(
      'generateId is deterministic (same input → same output)',
      (insight) => {
        const id1 = generateId(insight);
        const id2 = generateId(insight);
        expect(id1).toBe(id2);
      }
    );

    test.prop([fc.string({ minLength: 0, maxLength: 1000 })], { numRuns: FC_RUNS })(
      'generateId always produces format L[0-9a-f]{8}',
      (insight) => {
        const id = generateId(insight);
        expect(id).toMatch(/^L[0-9a-f]{16}$/);
      }
    );

    test.prop([fc.string({ minLength: 0, maxLength: 1000 })], { numRuns: FC_RUNS })(
      'generateId always produces length 17',
      (insight) => {
        const id = generateId(insight);
        expect(id.length).toBe(17);
      }
    );
  });

  describe('Property 3: ID Uniqueness (Probabilistic)', () => {
    test.prop([
      fc.string({ minLength: 1, maxLength: 1000 }),
      fc.string({ minLength: 1, maxLength: 1000 }),
    ], { numRuns: FC_RUNS })(
      'different insights produce different IDs with high probability',
      (insight1, insight2) => {
        // Skip if inputs are identical
        fc.pre(insight1 !== insight2);

        const id1 = generateId(insight1);
        const id2 = generateId(insight2);

        // Different insights should produce different IDs (hash collision is extremely unlikely)
        expect(id1).not.toBe(id2);
      }
    );

    test.prop([fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 2, maxLength: 100 })], { numRuns: FC_RUNS })(
      'batch of unique insights produces unique IDs',
      (insights) => {
        // Filter to unique insights only
        const uniqueInsights = Array.from(new Set(insights));
        fc.pre(uniqueInsights.length >= 2);

        const ids = uniqueInsights.map((i) => generateId(i));
        const uniqueIds = new Set(ids);

        // All IDs should be unique (no hash collisions)
        expect(uniqueIds.size).toBe(uniqueInsights.length);
      }
    );
  });

  describe('Property 4: Type Discrimination', () => {
    test.prop([lessonItemArb], { numRuns: FC_RUNS })(
      'lesson.type is always "lesson" after LessonSchema parse',
      (lesson) => {
        const result = LessonSchema.safeParse(lesson);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.type).toBe('lesson');
        }
      }
    );
  });

  describe('Property 5: Roundtrip (JSON Serialization)', () => {
    test.prop([lessonWithExtraArb], { numRuns: FC_RUNS })(
      'JSON.stringify → parse preserves all fields',
      (lesson) => {
        // Parse to ensure valid lesson
        const parseResult = LessonSchema.safeParse(lesson);
        expect(parseResult.success).toBe(true);

        if (parseResult.success) {
          const original = parseResult.data;

          // Serialize and deserialize
          const json = JSON.stringify(original);
          const deserialized = JSON.parse(json);

          // Re-parse with schema
          const reparsed = LessonSchema.safeParse(deserialized);
          expect(reparsed.success).toBe(true);

          if (reparsed.success) {
            // All fields should match
            expect(reparsed.data).toEqual(original);
          }
        }
      }
    );

    test.prop([fc.array(lessonWithExtraArb, { maxLength: 20 })], { numRuns: FC_RUNS })(
      'JSONL format (newline-delimited) preserves all lessons',
      (lessons) => {
        // Convert to JSONL format
        const jsonl = lessons.map((l) => JSON.stringify(l)).join('\n');

        // Parse back
        const lines = jsonl.split('\n').filter((line) => line.trim() !== '');
        const parsed = lines.map((line) => LessonSchema.safeParse(JSON.parse(line)));

        // All should parse successfully
        expect(parsed.every((p) => p.success)).toBe(true);
        expect(parsed.length).toBe(lessons.length);
      }
    );
  });

  describe('Property 6: Severity Enum Validation', () => {
    test.prop([baseLessonFieldsArb, fc.constantFrom('high', 'medium', 'low')], { numRuns: FC_RUNS })(
      'all valid severity values are accepted',
      (base, severity) => {
        const lesson = {
          ...base,
          type: 'lesson' as const,
          severity,
        };

        const result = LessonSchema.safeParse(lesson);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.severity).toBe(severity);
        }
      }
    );

    test.prop([
      baseLessonFieldsArb,
      fc.string({ minLength: 1, maxLength: 20 }).filter(
        (s) => !['high', 'medium', 'low'].includes(s)
      ),
    ], { numRuns: FC_RUNS })(
      'invalid severity values are rejected',
      (base, invalidSeverity) => {
        const invalidLesson = {
          ...base,
          type: 'lesson' as const,
          severity: invalidSeverity,
        };

        const result = LessonSchema.safeParse(invalidLesson);
        expect(result.success).toBe(false);
      }
    );
  });

  describe('Property 7: Optional Fields Handling', () => {
    test.prop([lessonItemArb], { numRuns: FC_RUNS })(
      'lessons without optional fields parse successfully',
      (lesson) => {
        // Ensure no optional extended fields
        const { evidence, severity, pattern, ...clean } = lesson as any;

        const result = LessonSchema.safeParse(clean);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.evidence).toBeUndefined();
          expect(result.data.severity).toBeUndefined();
        }
      }
    );

    test.prop([baseLessonFieldsArb, fc.option(fc.string(), { nil: undefined })], { numRuns: FC_RUNS })(
      'deleted field is optional and preserved when present',
      (base, deleted) => {
        const lesson = {
          ...base,
          type: 'lesson' as const,
          ...(deleted !== undefined ? { deleted: true } : {}),
        };

        const result = LessonSchema.safeParse(lesson);
        expect(result.success).toBe(true);
      }
    );

    test.prop([baseLessonFieldsArb, fc.option(fc.nat(100), { nil: undefined })], { numRuns: FC_RUNS })(
      'retrievalCount field is optional and preserved when present',
      (base, retrievalCount) => {
        const lesson = {
          ...base,
          type: 'lesson' as const,
          ...(retrievalCount !== undefined ? { retrievalCount } : {}),
        };

        const result = LessonSchema.safeParse(lesson);
        expect(result.success).toBe(true);
        if (result.success && retrievalCount !== undefined) {
          expect(result.data.retrievalCount).toBe(retrievalCount);
        }
      }
    );
  });

  describe('Property 8: Invariant Preservation', () => {
    test.prop([lessonWithExtraArb], { numRuns: FC_RUNS })(
      'parsed lesson maintains id format',
      (lesson) => {
        const result = LessonSchema.safeParse(lesson);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.id).toMatch(/^L[0-9a-f]+$/);
        }
      }
    );

    test.prop([lessonWithExtraArb], { numRuns: FC_RUNS })(
      'parsed lesson maintains ISO8601 created timestamp',
      (lesson) => {
        const result = LessonSchema.safeParse(lesson);
        expect(result.success).toBe(true);
        if (result.success) {
          // Should be parseable as date
          const date = new Date(result.data.created);
          expect(date.toISOString()).toBe(result.data.created);
        }
      }
    );

    test.prop([lessonWithExtraArb], { numRuns: FC_RUNS })(
      'parsed lesson maintains non-empty trigger and insight',
      (lesson) => {
        const result = LessonSchema.safeParse(lesson);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.trigger.length).toBeGreaterThan(0);
          expect(result.data.insight.length).toBeGreaterThan(0);
        }
      }
    );

    test.prop([lessonWithExtraArb], { numRuns: FC_RUNS })(
      'supersedes and related arrays contain only valid lesson IDs',
      (lesson) => {
        const result = LessonSchema.safeParse(lesson);
        expect(result.success).toBe(true);
        if (result.success) {
          const allIds = [...result.data.supersedes, ...result.data.related];
          allIds.forEach((id) => {
            expect(id).toMatch(/^L[0-9a-f]+$/);
          });
        }
      }
    );
  });
});

describe('CitationSchema', () => {
  const baseLesson = {
    id: 'L001',
    type: 'lesson',
    trigger: 'Test trigger',
    insight: 'Test insight',
    tags: [],
    source: 'manual' as const,
    context: { tool: 'test', intent: 'test' },
    created: '2026-01-30T12:00:00Z',
    confirmed: true,
    supersedes: [],
    related: [],
  };

  it('accepts lesson without citation (backward compatible)', () => {
    const result = LessonSchema.safeParse(baseLesson);
    expect(result.success).toBe(true);
  });

  it('accepts citation with file only', () => {
    const lesson = {
      ...baseLesson,
      citation: { file: 'src/api/client.ts' },
    };
    const result = LessonSchema.safeParse(lesson);
    expect(result.success).toBe(true);
  });

  it('accepts citation with file and line', () => {
    const lesson = {
      ...baseLesson,
      citation: { file: 'src/api/client.ts', line: 42 },
    };
    const result = LessonSchema.safeParse(lesson);
    expect(result.success).toBe(true);
  });

  it('accepts citation with file, line, and commit', () => {
    const lesson = {
      ...baseLesson,
      citation: { file: 'src/api/client.ts', line: 42, commit: 'abc1234' },
    };
    const result = LessonSchema.safeParse(lesson);
    expect(result.success).toBe(true);
  });

  it('rejects citation with empty file', () => {
    const lesson = {
      ...baseLesson,
      citation: { file: '' },
    };
    const result = LessonSchema.safeParse(lesson);
    expect(result.success).toBe(false);
  });

  it('rejects citation with negative line number', () => {
    const lesson = {
      ...baseLesson,
      citation: { file: 'src/test.ts', line: -1 },
    };
    const result = LessonSchema.safeParse(lesson);
    expect(result.success).toBe(false);
  });

  it('rejects citation with zero line number', () => {
    const lesson = {
      ...baseLesson,
      citation: { file: 'src/test.ts', line: 0 },
    };
    const result = LessonSchema.safeParse(lesson);
    expect(result.success).toBe(false);
  });
});

describe('Age-based validity fields', () => {
  const baseLesson = {
    id: 'L001',
    type: 'lesson',
    trigger: 'Test trigger',
    insight: 'Test insight',
    tags: [],
    source: 'manual' as const,
    context: { tool: 'test', intent: 'test' },
    created: '2026-01-30T12:00:00Z',
    confirmed: true,
    supersedes: [],
    related: [],
  };

  it('accepts lesson without age fields (backward compatible)', () => {
    const result = LessonSchema.safeParse(baseLesson);
    expect(result.success).toBe(true);
  });

  it('accepts compactionLevel 0 (active)', () => {
    const lesson = { ...baseLesson, compactionLevel: 0 };
    const result = LessonSchema.safeParse(lesson);
    expect(result.success).toBe(true);
  });

  it('accepts compactionLevel 1 (flagged)', () => {
    const lesson = { ...baseLesson, compactionLevel: 1 };
    const result = LessonSchema.safeParse(lesson);
    expect(result.success).toBe(true);
  });

  it('accepts compactionLevel 2 (archived)', () => {
    const lesson = { ...baseLesson, compactionLevel: 2 };
    const result = LessonSchema.safeParse(lesson);
    expect(result.success).toBe(true);
  });

  it('rejects invalid compactionLevel', () => {
    const lesson = { ...baseLesson, compactionLevel: 3 };
    const result = LessonSchema.safeParse(lesson);
    expect(result.success).toBe(false);
  });

  it('accepts compactedAt timestamp', () => {
    const lesson = { ...baseLesson, compactedAt: '2026-01-30T12:00:00Z' };
    const result = LessonSchema.safeParse(lesson);
    expect(result.success).toBe(true);
  });

  it('accepts lastRetrieved timestamp', () => {
    const lesson = { ...baseLesson, lastRetrieved: '2026-01-30T12:00:00Z' };
    const result = LessonSchema.safeParse(lesson);
    expect(result.success).toBe(true);
  });
});

describe('Invalidation fields', () => {
  const baseLesson = {
    id: 'L001',
    type: 'lesson',
    trigger: 'Test trigger',
    insight: 'Test insight',
    tags: [],
    source: 'manual' as const,
    context: { tool: 'test', intent: 'test' },
    created: '2026-01-30T12:00:00Z',
    confirmed: true,
    supersedes: [],
    related: [],
  };

  it('accepts lesson without invalidation fields (backward compatible)', () => {
    const result = LessonSchema.safeParse(baseLesson);
    expect(result.success).toBe(true);
  });

  it('accepts invalidatedAt timestamp', () => {
    const lesson = { ...baseLesson, invalidatedAt: '2026-01-30T12:00:00Z' };
    const result = LessonSchema.safeParse(lesson);
    expect(result.success).toBe(true);
  });

  it('accepts invalidationReason', () => {
    const lesson = {
      ...baseLesson,
      invalidatedAt: '2026-01-30T12:00:00Z',
      invalidationReason: 'This lesson was found to be incorrect',
    };
    const result = LessonSchema.safeParse(lesson);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Unified Memory Schema Tests (Epic 2)
// ============================================================================

describe('MemoryItem unified schema', () => {
  const baseFields = {
    id: 'L001',
    trigger: 'Used pandas for large file',
    insight: 'Use Polars for files > 100MB',
    tags: ['performance', 'polars'],
    source: 'user_correction' as const,
    context: { tool: 'edit', intent: 'optimize CSV processing' },
    created: '2026-01-30T12:00:00Z',
    confirmed: true,
    supersedes: [],
    related: [],
  };

  describe('type-specific validation', () => {
    it('validates lesson type', () => {
      const lesson = { ...baseFields, type: 'lesson' };
      const result = LessonItemSchema.safeParse(lesson);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('lesson');
      }
    });

    it('validates solution type', () => {
      const solution = { ...baseFields, id: 'S001', type: 'solution' };
      const result = SolutionItemSchema.safeParse(solution);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('solution');
      }
    });

    it('validates pattern type with required pattern field', () => {
      const patternItem = {
        ...baseFields,
        id: 'P001',
        type: 'pattern',
        pattern: { bad: 'old way', good: 'new way' },
      };
      const result = PatternItemSchema.safeParse(patternItem);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('pattern');
        expect(result.data.pattern.bad).toBe('old way');
        expect(result.data.pattern.good).toBe('new way');
      }
    });

    it('validates preference type', () => {
      const preference = { ...baseFields, id: 'R001', type: 'preference' };
      const result = PreferenceItemSchema.safeParse(preference);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('preference');
      }
    });
  });

  describe('discriminated union', () => {
    it('discriminates types correctly via type field', () => {
      const lesson = { ...baseFields, type: 'lesson' };
      const solution = { ...baseFields, id: 'S001', type: 'solution' };
      const patternItem = {
        ...baseFields,
        id: 'P001',
        type: 'pattern',
        pattern: { bad: 'x', good: 'y' },
      };
      const preference = { ...baseFields, id: 'R001', type: 'preference' };

      expect(MemoryItemSchema.safeParse(lesson).success).toBe(true);
      expect(MemoryItemSchema.safeParse(solution).success).toBe(true);
      expect(MemoryItemSchema.safeParse(patternItem).success).toBe(true);
      expect(MemoryItemSchema.safeParse(preference).success).toBe(true);
    });

    it('rejects unknown type values', () => {
      const invalid = { ...baseFields, type: 'unknown' };
      const result = MemoryItemSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects old quick/full type values in MemoryItemSchema', () => {
      const oldQuick = { ...baseFields, type: 'quick' };
      const oldFull = { ...baseFields, type: 'full' };
      expect(MemoryItemSchema.safeParse(oldQuick).success).toBe(false);
      expect(MemoryItemSchema.safeParse(oldFull).success).toBe(false);
    });
  });

  describe('backward compatibility', () => {
    it('LegacyLessonSchema parses old quick format', () => {
      const oldQuick = { ...baseFields, type: 'quick' };
      const result = LegacyLessonSchema.safeParse(oldQuick);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('quick');
      }
    });

    it('LegacyLessonSchema parses old full format', () => {
      const oldFull = {
        ...baseFields,
        type: 'full',
        evidence: 'test evidence',
        severity: 'high',
      };
      const result = LegacyLessonSchema.safeParse(oldFull);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('full');
      }
    });

    it('LessonRecordSchema still parses old quick/full format', () => {
      const oldQuick = { ...baseFields, type: 'quick' };
      const oldFull = { ...baseFields, type: 'full', evidence: 'e', severity: 'high' };
      expect(LessonRecordSchema.safeParse(oldQuick).success).toBe(true);
      expect(LessonRecordSchema.safeParse(oldFull).success).toBe(true);
    });

    it('MemoryItemRecordSchema parses all 4 new types', () => {
      const items = [
        { ...baseFields, type: 'lesson' },
        { ...baseFields, id: 'S001', type: 'solution' },
        { ...baseFields, id: 'P001', type: 'pattern', pattern: { bad: 'x', good: 'y' } },
        { ...baseFields, id: 'R001', type: 'preference' },
      ];
      for (const item of items) {
        const result = MemoryItemRecordSchema.safeParse(item);
        expect(result.success).toBe(true);
      }
    });

    it('MemoryItemRecordSchema parses legacy tombstones', () => {
      const tombstone = { id: 'L001', deleted: true, deletedAt: '2026-01-30T12:00:00Z' };
      const result = MemoryItemRecordSchema.safeParse(tombstone);
      expect(result.success).toBe(true);
    });

    it('MemoryItemRecordSchema parses old quick/full format', () => {
      const oldQuick = { ...baseFields, type: 'quick' };
      const result = MemoryItemRecordSchema.safeParse(oldQuick);
      expect(result.success).toBe(true);
    });
  });

  describe('ID generation with type prefix', () => {
    it('generateId with lesson type returns L prefix', () => {
      const id = generateId('test insight', 'lesson');
      expect(id).toMatch(/^L[a-f0-9]{16}$/);
    });

    it('generateId with solution type returns S prefix', () => {
      const id = generateId('test insight', 'solution');
      expect(id).toMatch(/^S[a-f0-9]{16}$/);
    });

    it('generateId with pattern type returns P prefix', () => {
      const id = generateId('test insight', 'pattern');
      expect(id).toMatch(/^P[a-f0-9]{16}$/);
    });

    it('generateId with preference type returns R prefix', () => {
      const id = generateId('test insight', 'preference');
      expect(id).toMatch(/^R[a-f0-9]{16}$/);
    });

    it('generateId without type defaults to L prefix (backward compat)', () => {
      const id = generateId('test insight');
      expect(id).toMatch(/^L[a-f0-9]{16}$/);
    });

    it('generateId is deterministic for same insight and type', () => {
      const id1 = generateId('same insight', 'solution');
      const id2 = generateId('same insight', 'solution');
      expect(id1).toBe(id2);
    });

    it('generateId produces different prefixes for different types', () => {
      const insight = 'same insight text';
      const lessonId = generateId(insight, 'lesson');
      const solutionId = generateId(insight, 'solution');
      const patternId = generateId(insight, 'pattern');
      const preferenceId = generateId(insight, 'preference');

      expect(lessonId[0]).toBe('L');
      expect(solutionId[0]).toBe('S');
      expect(patternId[0]).toBe('P');
      expect(preferenceId[0]).toBe('R');
    });
  });

  describe('pattern field requirements', () => {
    it('PatternItemSchema requires pattern field', () => {
      const withoutPattern = { ...baseFields, id: 'P001', type: 'pattern' };
      const result = PatternItemSchema.safeParse(withoutPattern);
      expect(result.success).toBe(false);
    });

    it('other types have pattern as optional', () => {
      // lesson without pattern should pass
      const lesson = { ...baseFields, type: 'lesson' };
      expect(LessonItemSchema.safeParse(lesson).success).toBe(true);

      // solution without pattern should pass
      const solution = { ...baseFields, id: 'S001', type: 'solution' };
      expect(SolutionItemSchema.safeParse(solution).success).toBe(true);

      // preference without pattern should pass
      const preference = { ...baseFields, id: 'R001', type: 'preference' };
      expect(PreferenceItemSchema.safeParse(preference).success).toBe(true);
    });

    it('lesson type accepts optional pattern', () => {
      const withPattern = {
        ...baseFields,
        type: 'lesson',
        pattern: { bad: 'old', good: 'new' },
      };
      expect(LessonItemSchema.safeParse(withPattern).success).toBe(true);
    });
  });

  describe('MemoryItemTypeSchema', () => {
    it('accepts all valid type values', () => {
      const types = ['lesson', 'solution', 'pattern', 'preference'];
      for (const t of types) {
        expect(MemoryItemTypeSchema.safeParse(t).success).toBe(true);
      }
    });

    it('rejects invalid type values', () => {
      expect(MemoryItemTypeSchema.safeParse('quick').success).toBe(false);
      expect(MemoryItemTypeSchema.safeParse('full').success).toBe(false);
      expect(MemoryItemTypeSchema.safeParse('invalid').success).toBe(false);
    });
  });

  describe('property tests: unified memory items', () => {
    const sourceArb = fc.constantFrom(
      'user_correction',
      'self_correction',
      'test_failure',
      'manual'
    );

    const contextArb = fc.record({
      tool: fc.string({ minLength: 1, maxLength: 50 }),
      intent: fc.string({ minLength: 1, maxLength: 100 }),
    });

    const patternArb = fc.record({
      bad: fc.string({ minLength: 1, maxLength: 200 }),
      good: fc.string({ minLength: 1, maxLength: 200 }),
    });

    const memoryIdArb = fc.integer({ min: 0, max: 0xffffffff }).map(
      (n) => `L${n.toString(16).padStart(8, '0')}`
    );

    const baseFieldsArb = fc.record({
      id: memoryIdArb,
      trigger: fc.string({ minLength: 1, maxLength: 500 }),
      insight: fc.string({ minLength: 1, maxLength: 1000 }),
      tags: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 10 }),
      source: sourceArb,
      context: contextArb,
      created: fc
        .integer({ min: new Date('2020-01-01').getTime(), max: new Date('2030-12-31').getTime() })
        .map((ts) => new Date(ts).toISOString()),
      confirmed: fc.boolean(),
      supersedes: fc.array(memoryIdArb, { maxLength: 5 }),
      related: fc.array(memoryIdArb, { maxLength: 5 }),
    });

    const lessonItemArb = baseFieldsArb.chain((base) =>
      fc.option(patternArb, { nil: undefined }).map((p) => ({
        ...base,
        type: 'lesson' as const,
        ...(p ? { pattern: p } : {}),
      }))
    );

    const solutionItemArb = baseFieldsArb.map((base) => ({
      ...base,
      type: 'solution' as const,
    }));

    const patternItemArb = baseFieldsArb.chain((base) =>
      patternArb.map((p) => ({
        ...base,
        type: 'pattern' as const,
        pattern: p,
      }))
    );

    const preferenceItemArb = baseFieldsArb.map((base) => ({
      ...base,
      type: 'preference' as const,
    }));

    const memoryItemArb = fc.oneof(
      lessonItemArb,
      solutionItemArb,
      patternItemArb,
      preferenceItemArb
    );

    test.prop([memoryItemArb], { numRuns: FC_RUNS })(
      'any valid MemoryItem round-trips through JSON',
      (item) => {
        const parseResult = MemoryItemSchema.safeParse(item);
        expect(parseResult.success).toBe(true);

        if (parseResult.success) {
          const json = JSON.stringify(parseResult.data);
          const deserialized = JSON.parse(json);
          const reparsed = MemoryItemSchema.safeParse(deserialized);
          expect(reparsed.success).toBe(true);
          if (reparsed.success) {
            expect(reparsed.data).toEqual(parseResult.data);
          }
        }
      }
    );

    test.prop([memoryItemArb], { numRuns: FC_RUNS })(
      'MemoryItem type is always one of the 4 valid types',
      (item) => {
        const result = MemoryItemSchema.safeParse(item);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(['lesson', 'solution', 'pattern', 'preference']).toContain(result.data.type);
        }
      }
    );

    test.prop([patternItemArb], { numRuns: FC_RUNS })(
      'pattern items always have a required pattern field',
      (item) => {
        const result = PatternItemSchema.safeParse(item);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.pattern).toBeDefined();
          expect(result.data.pattern.bad).toBeDefined();
          expect(result.data.pattern.good).toBeDefined();
        }
      }
    );
  });
});
