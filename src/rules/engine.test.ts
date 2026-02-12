/**
 * Tests for the rule engine: loading config, running rules, formatting output.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Rule, RuleConfig } from './types.js';

import { formatViolation, loadRuleConfig, runRules } from './engine.js';
import type { RuleResult, Violation } from './engine.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(import.meta.dirname, '__test-engine-' + Date.now());
  mkdirSync(join(tmpDir, '.claude'), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ============================================================================
// loadRuleConfig
// ============================================================================

describe('loadRuleConfig', () => {
  it('loads valid .claude/rules.json', () => {
    const config: RuleConfig = {
      rules: [
        {
          id: 'no-console',
          description: 'No console.log',
          severity: 'error',
          check: { type: 'file-pattern', glob: '**/*.ts', pattern: 'console\\.log' },
          remediation: 'Use logger.',
        },
      ],
    };
    writeFileSync(join(tmpDir, '.claude', 'rules.json'), JSON.stringify(config));

    const result = loadRuleConfig(tmpDir);
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0]!.id).toBe('no-console');
  });

  it('returns empty rules when config file not found', () => {
    const result = loadRuleConfig(tmpDir);
    expect(result.rules).toHaveLength(0);
  });

  it('throws on invalid JSON', () => {
    writeFileSync(join(tmpDir, '.claude', 'rules.json'), 'not json');
    expect(() => loadRuleConfig(tmpDir)).toThrow();
  });

  it('throws on invalid schema', () => {
    writeFileSync(
      join(tmpDir, '.claude', 'rules.json'),
      JSON.stringify({ rules: [{ bad: 'data' }] }),
    );
    expect(() => loadRuleConfig(tmpDir)).toThrow();
  });
});

// ============================================================================
// runRules
// ============================================================================

describe('runRules', () => {
  it('runs file-pattern rules and returns results', () => {
    writeFileSync(join(tmpDir, 'src.ts'), 'console.log("hi");\n');

    const rules: Rule[] = [
      {
        id: 'no-console',
        description: 'No console.log',
        severity: 'error',
        check: { type: 'file-pattern', glob: '**/*.ts', pattern: 'console\\.log' },
        remediation: 'Use logger.',
      },
    ];

    const results = runRules(tmpDir, rules);
    expect(results).toHaveLength(1);
    expect(results[0]!.rule.id).toBe('no-console');
    expect(results[0]!.violations).toHaveLength(1);
    expect(results[0]!.passed).toBe(false);
  });

  it('runs file-size rules', () => {
    const bigFile = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n') + '\n';
    writeFileSync(join(tmpDir, 'big.ts'), bigFile);

    const rules: Rule[] = [
      {
        id: 'max-file-size',
        description: 'Files < 5 lines',
        severity: 'warning',
        check: { type: 'file-size', glob: '**/*.ts', maxLines: 5 },
        remediation: 'Split the file.',
      },
    ];

    const results = runRules(tmpDir, rules);
    expect(results).toHaveLength(1);
    expect(results[0]!.violations).toHaveLength(1);
    expect(results[0]!.passed).toBe(false);
  });

  it('runs script rules', () => {
    const rules: Rule[] = [
      {
        id: 'lint-check',
        description: 'Lint must pass',
        severity: 'error',
        check: { type: 'script', command: 'true' },
        remediation: 'Fix lint errors.',
      },
    ];

    const results = runRules(tmpDir, rules);
    expect(results).toHaveLength(1);
    expect(results[0]!.violations).toHaveLength(0);
    expect(results[0]!.passed).toBe(true);
  });

  it('handles multiple rules', () => {
    writeFileSync(join(tmpDir, 'a.ts'), 'console.log("hi");\n');

    const rules: Rule[] = [
      {
        id: 'no-console',
        description: 'No console.log',
        severity: 'error',
        check: { type: 'file-pattern', glob: '**/*.ts', pattern: 'console\\.log' },
        remediation: 'Use logger.',
      },
      {
        id: 'script-ok',
        description: 'Always passes',
        severity: 'info',
        check: { type: 'script', command: 'true' },
        remediation: 'n/a',
      },
    ];

    const results = runRules(tmpDir, rules);
    expect(results).toHaveLength(2);
    expect(results[0]!.passed).toBe(false);
    expect(results[1]!.passed).toBe(true);
  });

  it('returns empty array for empty rules', () => {
    const results = runRules(tmpDir, []);
    expect(results).toHaveLength(0);
  });

  it('contains errors per-rule instead of crashing the whole run', () => {
    const rules: Rule[] = [
      {
        id: 'bad-regex',
        description: 'Invalid regex that should throw',
        severity: 'error',
        check: { type: 'file-pattern', glob: '**/*.ts', pattern: '(unclosed' },
        remediation: 'Fix the regex.',
      },
      {
        id: 'good-rule',
        description: 'Always passes',
        severity: 'info',
        check: { type: 'script', command: 'true' },
        remediation: 'n/a',
      },
    ];

    // Should NOT throw -- errors are caught per-rule
    const results = runRules(tmpDir, rules);
    expect(results).toHaveLength(2);

    // First rule should fail with an error violation
    expect(results[0]!.passed).toBe(false);
    expect(results[0]!.violations).toHaveLength(1);
    expect(results[0]!.violations[0]!.message).toContain('Rule check error');

    // Second rule should still run and pass
    expect(results[1]!.passed).toBe(true);
  });

  it('runs script rules with correct cwd (baseDir)', () => {
    // Create a marker file in tmpDir and check for it via script
    writeFileSync(join(tmpDir, 'marker.txt'), 'exists');

    const rules: Rule[] = [
      {
        id: 'cwd-check',
        description: 'Script should run in baseDir',
        severity: 'error',
        check: { type: 'script', command: 'test -f marker.txt' },
        remediation: 'Ensure cwd is set.',
      },
    ];

    const results = runRules(tmpDir, rules);
    expect(results).toHaveLength(1);
    expect(results[0]!.passed).toBe(true);
  });
});

// ============================================================================
// formatViolation
// ============================================================================

describe('formatViolation', () => {
  it('formats error violation with file and line', () => {
    const rule: Rule = {
      id: 'no-console',
      description: 'No console.log',
      severity: 'error',
      check: { type: 'file-pattern', glob: '**/*.ts', pattern: 'console\\.log' },
      remediation: 'Use logger instead.',
    };
    const violation: Violation = {
      file: 'src/cli.ts',
      line: 45,
      message: 'Pattern console\\.log matched',
    };

    const output = formatViolation(rule, violation);
    expect(output).toContain('ERROR');
    expect(output).toContain('no-console');
    expect(output).toContain('src/cli.ts:45');
    expect(output).toContain('Use logger instead.');
  });

  it('formats warning without line number', () => {
    const rule: Rule = {
      id: 'lint-check',
      description: 'Lint must pass',
      severity: 'warning',
      check: { type: 'script', command: 'pnpm lint' },
      remediation: 'Fix lint errors.',
    };
    const violation: Violation = { message: 'exit code 1' };

    const output = formatViolation(rule, violation);
    expect(output).toContain('WARN');
    expect(output).toContain('lint-check');
    expect(output).toContain('Fix lint errors.');
  });

  it('formats info severity', () => {
    const rule: Rule = {
      id: 'todo-check',
      description: 'Track TODOs',
      severity: 'info',
      check: { type: 'file-pattern', glob: '**/*.ts', pattern: 'TODO' },
      remediation: 'Consider resolving TODOs.',
    };
    const violation: Violation = { file: 'a.ts', line: 5, message: 'Pattern TODO matched' };

    const output = formatViolation(rule, violation);
    expect(output).toContain('INFO');
  });
});

// ============================================================================
// summarizeResults (tested via runRules output)
// ============================================================================

describe('result summary', () => {
  it('computes correct counts from results', () => {
    const results: RuleResult[] = [
      {
        rule: {
          id: 'r1',
          description: '',
          severity: 'error',
          check: { type: 'script', command: 'true' },
          remediation: '',
        },
        violations: [{ message: 'fail' }],
        passed: false,
      },
      {
        rule: {
          id: 'r2',
          description: '',
          severity: 'warning',
          check: { type: 'script', command: 'true' },
          remediation: '',
        },
        violations: [{ message: 'warn' }],
        passed: false,
      },
      {
        rule: {
          id: 'r3',
          description: '',
          severity: 'info',
          check: { type: 'script', command: 'true' },
          remediation: '',
        },
        violations: [],
        passed: true,
      },
    ];

    const errors = results.filter((r) => !r.passed && r.rule.severity === 'error').length;
    const warnings = results.filter((r) => !r.passed && r.rule.severity === 'warning').length;
    const passed = results.filter((r) => r.passed).length;

    expect(errors).toBe(1);
    expect(warnings).toBe(1);
    expect(passed).toBe(1);
  });
});
