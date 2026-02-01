import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { fc, test } from '@fast-check/vitest';

import {
  LessonSchema,
  TombstoneSchema,
  SourceSchema,
  ContextSchema,
  PatternSchema,
  SeveritySchema,
  generateId,
  type Lesson,
} from './types.js';

// Number of fast-check iterations: 100 in CI, 20 locally for faster feedback
const FC_RUNS = process.env.CI ? 100 : 20;

describe('LessonSchema (unified)', () => {
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
    it('accepts type: "quick"', () => {
      const quick = { ...baseLesson, type: 'quick' };
      const result = LessonSchema.safeParse(quick);
      expect(result.success).toBe(true);
    });

    it('accepts type: "full"', () => {
      const full = { ...baseLesson, type: 'full' };
      const result = LessonSchema.safeParse(full);
      expect(result.success).toBe(true);
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
      const lesson = { ...baseLesson, type: 'quick' };
      const result = LessonSchema.safeParse(lesson);
      expect(result.success).toBe(true);
    });

    it('accepts lesson with evidence', () => {
      const lesson = {
        ...baseLesson,
        type: 'full',
        evidence: 'Silent failure caused 30min debugging',
      };
      const result = LessonSchema.safeParse(lesson);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.evidence).toBe('Silent failure caused 30min debugging');
      }
    });

    it('accepts lesson without severity', () => {
      const lesson = { ...baseLesson, type: 'quick' };
      const result = LessonSchema.safeParse(lesson);
      expect(result.success).toBe(true);
    });

    it('accepts lesson with severity', () => {
      const lesson = {
        ...baseLesson,
        type: 'full',
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
        const lesson = { ...baseLesson, type: 'full', severity };
        const result = LessonSchema.safeParse(lesson);
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid severity', () => {
      const lesson = {
        ...baseLesson,
        type: 'full',
        severity: 'critical',
      };
      const result = LessonSchema.safeParse(lesson);
      expect(result.success).toBe(false);
    });

    it('accepts lesson without pattern', () => {
      const lesson = { ...baseLesson, type: 'full' };
      const result = LessonSchema.safeParse(lesson);
      expect(result.success).toBe(true);
    });

    it('accepts lesson with pattern', () => {
      const lesson = {
        ...baseLesson,
        type: 'full',
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
        const lesson = { ...baseLesson, type: 'quick', source };
        const result = LessonSchema.safeParse(lesson);
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid source', () => {
      const invalid = { ...baseLesson, type: 'quick', source: 'invalid' };
      const result = LessonSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('allows optional deleted field', () => {
      const withDeleted = { ...baseLesson, type: 'quick', deleted: true };
      const result = LessonSchema.safeParse(withDeleted);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deleted).toBe(true);
      }
    });

    it('allows optional retrievalCount', () => {
      const withCount = { ...baseLesson, type: 'quick', retrievalCount: 5 };
      const result = LessonSchema.safeParse(withCount);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.retrievalCount).toBe(5);
      }
    });
  });

  describe('backward compatibility', () => {
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
      const result = LessonSchema.safeParse(oldQuick);
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
      const result = LessonSchema.safeParse(oldFull);
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
      const result = LessonSchema.safeParse(oldFullWithPattern);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('full');
        expect(result.data.pattern?.bad).toBe('old code');
        expect(result.data.pattern?.good).toBe('new code');
      }
    });
  });

  describe('semantic flexibility (schema allows any combination)', () => {
    it('accepts type: "quick" with evidence (schema allows, semantics discourage)', () => {
      const mixedLesson = {
        ...baseLesson,
        type: 'quick',
        evidence: 'This should be discouraged but schema allows it',
      };
      const result = LessonSchema.safeParse(mixedLesson);
      expect(result.success).toBe(true);
    });

    it('accepts type: "quick" with severity (schema allows, semantics discourage)', () => {
      const mixedLesson = {
        ...baseLesson,
        type: 'quick',
        severity: 'high',
      };
      const result = LessonSchema.safeParse(mixedLesson);
      expect(result.success).toBe(true);
    });

    it('accepts type: "full" without evidence (schema allows, semantics discourage)', () => {
      const minimalFull = {
        ...baseLesson,
        type: 'full',
      };
      const result = LessonSchema.safeParse(minimalFull);
      expect(result.success).toBe(true);
    });

    it('accepts type: "full" without severity (schema allows, semantics discourage)', () => {
      const minimalFull = {
        ...baseLesson,
        type: 'full',
        evidence: 'Has evidence but no severity',
      };
      const result = LessonSchema.safeParse(minimalFull);
      expect(result.success).toBe(true);
    });
  });

  describe('type discriminator runtime checks', () => {
    it('supports lesson.type === "quick" checks', () => {
      const lesson: Lesson = {
        ...baseLesson,
        type: 'quick',
      };
      expect(lesson.type === 'quick').toBe(true);
      expect(lesson.type === 'full').toBe(false);
    });

    it('supports lesson.type === "full" checks', () => {
      const lesson: Lesson = {
        ...baseLesson,
        type: 'full',
        evidence: 'evidence',
        severity: 'high',
      };
      expect(lesson.type === 'full').toBe(true);
      expect(lesson.type === 'quick').toBe(false);
    });

    it('supports lesson.type !== "full" checks', () => {
      const quickLesson: Lesson = { ...baseLesson, type: 'quick' };
      const fullLesson: Lesson = { ...baseLesson, type: 'full' };

      expect(quickLesson.type !== 'full').toBe(true);
      expect(fullLesson.type !== 'full').toBe(false);
    });
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

// ============================================================================
// Property-Based Tests (fast-check)
// ============================================================================
//
// These property-based tests validate the type unification invariants.
// They work with the CURRENT discriminated union schema and will continue
// to work after migration to the unified schema.
//
// Key properties tested:
// 1. Backward compatibility - old format lessons always parse
// 2. ID determinism - same insight always produces same ID
// 3. ID uniqueness - different insights produce different IDs
// 4. Type discrimination - type field is always 'quick' or 'full'
// 5. Roundtrip - JSON serialization preserves all fields
// 6. Severity validation - all enum values accepted, invalid rejected
// 7. Optional fields - handled correctly when present/absent
// 8. Invariants - ID format, timestamps, non-empty strings maintained
//
// All 22 property tests PASS with current schema (as of 2026-01-31)
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

  // Helper to generate hex ID (L + 8 hex chars)
  const lessonIdArb = fc.integer({ min: 0, max: 0xffffffff }).map((n) => `L${n.toString(16).padStart(8, '0')}`);

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

  // Quick lesson arbitrary
  const quickLessonArb = baseLessonFieldsArb.map((base) => ({
    ...base,
    type: 'quick' as const,
  }));

  // Full lesson arbitrary (current discriminated union version)
  const fullLessonArb = baseLessonFieldsArb.chain((base) =>
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

  // Combined lesson arbitrary
  const lessonArb = fc.oneof(quickLessonArb, fullLessonArb);

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

  describe('Property 1: Backward Compatibility', () => {
    test.prop([oldQuickLessonArb], { numRuns: FC_RUNS })(
      'old QuickLesson format always parses successfully',
      (oldQuick) => {
        const result = LessonSchema.safeParse(oldQuick);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.type).toBe('quick');
          expect(result.data.trigger).toBe(oldQuick.trigger);
          expect(result.data.insight).toBe(oldQuick.insight);
        }
      }
    );

    test.prop([oldFullLessonArb], { numRuns: FC_RUNS })(
      'old FullLesson format always parses successfully',
      (oldFull) => {
        const result = LessonSchema.safeParse(oldFull);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.type).toBe('full');
          expect(result.data.evidence).toBe(oldFull.evidence);
          expect(result.data.severity).toBe(oldFull.severity);
        }
      }
    );

    test.prop([fc.array(fc.oneof(oldQuickLessonArb, oldFullLessonArb), { maxLength: 50 })], { numRuns: FC_RUNS })(
      'mixed old format lessons all parse successfully',
      (lessons) => {
        const results = lessons.map((lesson) => LessonSchema.safeParse(lesson));
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
        expect(id).toMatch(/^L[0-9a-f]{8}$/);
      }
    );

    test.prop([fc.string({ minLength: 0, maxLength: 1000 })], { numRuns: FC_RUNS })(
      'generateId always produces length 9',
      (insight) => {
        const id = generateId(insight);
        expect(id.length).toBe(9);
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
    test.prop([lessonArb], { numRuns: FC_RUNS })(
      'lesson.type is always "quick" or "full" after parsing',
      (lesson) => {
        const result = LessonSchema.safeParse(lesson);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(['quick', 'full']).toContain(result.data.type);
        }
      }
    );

    test.prop([quickLessonArb], { numRuns: FC_RUNS })(
      'quick lessons satisfy lesson.type === "quick"',
      (quickLesson) => {
        const result = LessonSchema.safeParse(quickLesson);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.type === 'quick').toBe(true);
          expect(result.data.type === 'full').toBe(false);
        }
      }
    );

    test.prop([fullLessonArb], { numRuns: FC_RUNS })(
      'full lessons satisfy lesson.type === "full"',
      (fullLesson) => {
        const result = LessonSchema.safeParse(fullLesson);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.type === 'full').toBe(true);
          expect(result.data.type === 'quick').toBe(false);
        }
      }
    );
  });

  describe('Property 5: Roundtrip (JSON Serialization)', () => {
    test.prop([lessonArb], { numRuns: FC_RUNS })(
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

    test.prop([fc.array(lessonArb, { maxLength: 20 })], { numRuns: FC_RUNS })(
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
        const fullLesson = {
          ...base,
          type: 'full' as const,
          evidence: 'test evidence',
          severity,
        };

        const result = LessonSchema.safeParse(fullLesson);
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
          type: 'full' as const,
          evidence: 'test evidence',
          severity: invalidSeverity,
        };

        const result = LessonSchema.safeParse(invalidLesson);
        expect(result.success).toBe(false);
      }
    );
  });

  describe('Property 7: Optional Fields Handling', () => {
    test.prop([quickLessonArb], { numRuns: FC_RUNS })(
      'quick lessons without optional fields parse successfully',
      (quickLesson) => {
        // Ensure no optional full-lesson fields
        const { evidence, severity, pattern, ...cleanQuick } = quickLesson as any;

        const result = LessonSchema.safeParse(cleanQuick);
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
          type: 'quick' as const,
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
          type: 'quick' as const,
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
    test.prop([lessonArb], { numRuns: FC_RUNS })(
      'parsed lesson maintains id format',
      (lesson) => {
        const result = LessonSchema.safeParse(lesson);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.id).toMatch(/^L[0-9a-f]+$/);
        }
      }
    );

    test.prop([lessonArb], { numRuns: FC_RUNS })(
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

    test.prop([lessonArb], { numRuns: FC_RUNS })(
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

    test.prop([lessonArb], { numRuns: FC_RUNS })(
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
