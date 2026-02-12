/**
 * Tests for rule configuration Zod schemas.
 */

import { describe, expect, it } from 'vitest';

import {
  FilePatternCheckSchema,
  FileSizeCheckSchema,
  RuleCheckSchema,
  RuleConfigSchema,
  RuleSchema,
  ScriptCheckSchema,
  SeveritySchema,
} from './types.js';

// ============================================================================
// SeveritySchema
// ============================================================================

describe('SeveritySchema', () => {
  it('accepts valid severities', () => {
    expect(SeveritySchema.parse('error')).toBe('error');
    expect(SeveritySchema.parse('warning')).toBe('warning');
    expect(SeveritySchema.parse('info')).toBe('info');
  });

  it('rejects invalid severity', () => {
    expect(() => SeveritySchema.parse('fatal')).toThrow();
    expect(() => SeveritySchema.parse('')).toThrow();
  });
});

// ============================================================================
// FilePatternCheckSchema
// ============================================================================

describe('FilePatternCheckSchema', () => {
  it('accepts valid file-pattern check', () => {
    const result = FilePatternCheckSchema.parse({
      type: 'file-pattern',
      glob: '**/*.ts',
      pattern: 'console\\.log',
    });
    expect(result.type).toBe('file-pattern');
    expect(result.glob).toBe('**/*.ts');
    expect(result.pattern).toBe('console\\.log');
    expect(result.mustMatch).toBeUndefined();
  });

  it('accepts mustMatch option', () => {
    const result = FilePatternCheckSchema.parse({
      type: 'file-pattern',
      glob: '**/*.ts',
      pattern: 'Copyright',
      mustMatch: true,
    });
    expect(result.mustMatch).toBe(true);
  });

  it('rejects missing glob', () => {
    expect(() =>
      FilePatternCheckSchema.parse({ type: 'file-pattern', pattern: 'foo' }),
    ).toThrow();
  });

  it('rejects missing pattern', () => {
    expect(() =>
      FilePatternCheckSchema.parse({ type: 'file-pattern', glob: '**/*.ts' }),
    ).toThrow();
  });
});

// ============================================================================
// FileSizeCheckSchema
// ============================================================================

describe('FileSizeCheckSchema', () => {
  it('accepts valid file-size check', () => {
    const result = FileSizeCheckSchema.parse({
      type: 'file-size',
      glob: '**/*.ts',
      maxLines: 300,
    });
    expect(result.type).toBe('file-size');
    expect(result.maxLines).toBe(300);
  });

  it('rejects maxLines <= 0', () => {
    expect(() =>
      FileSizeCheckSchema.parse({
        type: 'file-size',
        glob: '**/*.ts',
        maxLines: 0,
      }),
    ).toThrow();
  });

  it('rejects missing maxLines', () => {
    expect(() =>
      FileSizeCheckSchema.parse({ type: 'file-size', glob: '**/*.ts' }),
    ).toThrow();
  });
});

// ============================================================================
// ScriptCheckSchema
// ============================================================================

describe('ScriptCheckSchema', () => {
  it('accepts valid script check', () => {
    const result = ScriptCheckSchema.parse({
      type: 'script',
      command: 'pnpm lint',
    });
    expect(result.type).toBe('script');
    expect(result.command).toBe('pnpm lint');
    expect(result.expectExitCode).toBeUndefined();
  });

  it('accepts expectExitCode', () => {
    const result = ScriptCheckSchema.parse({
      type: 'script',
      command: 'pnpm lint',
      expectExitCode: 0,
    });
    expect(result.expectExitCode).toBe(0);
  });

  it('rejects missing command', () => {
    expect(() => ScriptCheckSchema.parse({ type: 'script' })).toThrow();
  });
});

// ============================================================================
// RuleCheckSchema (discriminated union)
// ============================================================================

describe('RuleCheckSchema', () => {
  it('parses file-pattern checks', () => {
    const result = RuleCheckSchema.parse({
      type: 'file-pattern',
      glob: '**/*.ts',
      pattern: 'TODO',
    });
    expect(result.type).toBe('file-pattern');
  });

  it('parses file-size checks', () => {
    const result = RuleCheckSchema.parse({
      type: 'file-size',
      glob: '**/*.ts',
      maxLines: 300,
    });
    expect(result.type).toBe('file-size');
  });

  it('parses script checks', () => {
    const result = RuleCheckSchema.parse({
      type: 'script',
      command: 'echo ok',
    });
    expect(result.type).toBe('script');
  });

  it('rejects unknown check type', () => {
    expect(() =>
      RuleCheckSchema.parse({ type: 'unknown', foo: 'bar' }),
    ).toThrow();
  });
});

// ============================================================================
// RuleSchema
// ============================================================================

describe('RuleSchema', () => {
  it('accepts a complete rule', () => {
    const rule = RuleSchema.parse({
      id: 'no-console-log',
      description: 'No console.log in production code',
      severity: 'error',
      check: { type: 'file-pattern', glob: 'src/**/*.ts', pattern: 'console\\.log' },
      remediation: 'Use the logger module instead of console.log.',
    });
    expect(rule.id).toBe('no-console-log');
    expect(rule.severity).toBe('error');
    expect(rule.check.type).toBe('file-pattern');
  });

  it('rejects missing id', () => {
    expect(() =>
      RuleSchema.parse({
        description: 'test',
        severity: 'error',
        check: { type: 'script', command: 'echo ok' },
        remediation: 'fix it',
      }),
    ).toThrow();
  });

  it('rejects missing check', () => {
    expect(() =>
      RuleSchema.parse({
        id: 'test',
        description: 'test',
        severity: 'error',
        remediation: 'fix it',
      }),
    ).toThrow();
  });

  it('rejects empty id', () => {
    expect(() =>
      RuleSchema.parse({
        id: '',
        description: 'test',
        severity: 'error',
        check: { type: 'script', command: 'echo ok' },
        remediation: 'fix it',
      }),
    ).toThrow();
  });
});

// ============================================================================
// RuleConfigSchema
// ============================================================================

describe('RuleConfigSchema', () => {
  it('accepts valid config with rules array', () => {
    const config = RuleConfigSchema.parse({
      rules: [
        {
          id: 'no-console',
          description: 'No console.log',
          severity: 'error',
          check: { type: 'file-pattern', glob: '**/*.ts', pattern: 'console\\.log' },
          remediation: 'Use logger.',
        },
      ],
    });
    expect(config.rules).toHaveLength(1);
  });

  it('accepts empty rules array', () => {
    const config = RuleConfigSchema.parse({ rules: [] });
    expect(config.rules).toHaveLength(0);
  });

  it('rejects missing rules key', () => {
    expect(() => RuleConfigSchema.parse({})).toThrow();
  });

  it('rejects non-array rules', () => {
    expect(() => RuleConfigSchema.parse({ rules: 'not-array' })).toThrow();
  });
});
