/**
 * Tests for the Vitest output parser used by test-summary command.
 *
 * Tests the parser only, not the test runner execution.
 */

import { describe, expect, it } from 'vitest';

import { parseVitestOutput } from './test-summary.js';
import type { TestSummary } from './test-summary.js';

// ============================================================================
// Sample Vitest outputs
// ============================================================================

const ALL_PASSING = `\
 RUN  v2.1.9 /Users/Nathan/Documents/Code/learning_agent

 ✓ src/cli-utils.test.ts (12 tests) 3ms
 ✓ src/memory/storage/jsonl.test.ts (45 tests) 120ms
 ✓ src/rules/engine.test.ts (8 tests) 15ms

 Test Files  3 passed (3)
      Tests  65 passed (65)
   Start at  21:31:47
   Duration  1.23s (transform 100ms, setup 0ms, collect 200ms, tests 923ms, environment 0ms, prepare 35ms)`;

const WITH_FAILURES = `\
 RUN  v2.1.9 /Users/Nathan/Documents/Code/learning_agent

 ✓ src/cli-utils.test.ts (12 tests) 3ms
 ❯ src/rules/engine.test.ts (3 tests | 1 failed) 15ms
 ❯ src/rules/types.test.ts (5 tests | 2 failed) 8ms

⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/rules/engine.test.ts > RuleEngine > should validate config
AssertionError: expected true to be false

- Expected
+ Received

-  false
+  true

 ❯ src/rules/engine.test.ts:42:18

 FAIL  src/rules/types.test.ts > RuleSchema > should reject invalid severity
ZodError: Invalid enum value. Expected 'high' | 'medium' | 'low', received 'critical'

 ❯ src/rules/types.test.ts:15:10

 FAIL  src/rules/types.test.ts > RuleSchema > should parse valid rule
TypeError: Cannot read properties of undefined (reading 'parse')

 ❯ src/rules/types.test.ts:22:5

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯

 Test Files  2 failed | 1 passed (3)
      Tests  3 failed | 17 passed (20)
   Start at  21:31:47
   Duration  1.23s (transform 100ms, setup 0ms, collect 200ms, tests 923ms, environment 0ms, prepare 35ms)`;

const WITH_SKIPS = `\
 RUN  v2.1.9 /Users/Nathan/Documents/Code/learning_agent

 ✓ src/cli-utils.test.ts (12 tests) 3ms
 ✓ src/embeddings/model.test.ts (5 tests | 2 skipped) 200ms

 Test Files  2 passed (2)
      Tests  2 skipped | 15 passed (17)
   Start at  21:31:47
   Duration  500ms`;

const FAILED_SUITE = `\
 RUN  v2.1.9 /Users/Nathan/Documents/Code/learning_agent

 ❯ src/cli-error-format.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/cli-error-format.test.ts [ src/cli-error-format.test.ts ]
Error: Failed to load url ./cli-error-format.js (resolved id: ./cli-error-format.js) in /Users/Nathan/Documents/Code/learning_agent/src/cli-error-format.test.ts. Does the file exist?
 ❯ loadAndTransform node_modules/.pnpm/vite@5.4.21/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:51969:17

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  no tests
   Start at  21:31:53
   Duration  142ms (transform 17ms, setup 0ms, collect 0ms, tests 0ms, environment 0ms, prepare 39ms)`;

// ============================================================================
// Tests
// ============================================================================

describe('parseVitestOutput', () => {
  describe('all-passing output', () => {
    it('should parse pass/fail/skip counts correctly', () => {
      const result = parseVitestOutput(ALL_PASSING);
      expect(result.passed).toBe(65);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.total).toBe(65);
    });

    it('should parse duration', () => {
      const result = parseVitestOutput(ALL_PASSING);
      expect(result.duration).toBe('1.23s');
    });

    it('should have no failures', () => {
      const result = parseVitestOutput(ALL_PASSING);
      expect(result.failures).toEqual([]);
    });
  });

  describe('output with failures', () => {
    it('should parse counts including failures', () => {
      const result = parseVitestOutput(WITH_FAILURES);
      expect(result.passed).toBe(17);
      expect(result.failed).toBe(3);
      expect(result.total).toBe(20);
    });

    it('should extract failing test names and error messages', () => {
      const result = parseVitestOutput(WITH_FAILURES);
      expect(result.failures).toHaveLength(3);

      expect(result.failures[0]).toEqual({
        name: 'src/rules/engine.test.ts > RuleEngine > should validate config',
        error: 'AssertionError: expected true to be false',
      });

      expect(result.failures[1]).toEqual({
        name: 'src/rules/types.test.ts > RuleSchema > should reject invalid severity',
        error: "ZodError: Invalid enum value. Expected 'high' | 'medium' | 'low', received 'critical'",
      });

      expect(result.failures[2]).toEqual({
        name: 'src/rules/types.test.ts > RuleSchema > should parse valid rule',
        error: "TypeError: Cannot read properties of undefined (reading 'parse')",
      });
    });
  });

  describe('output with skipped tests', () => {
    it('should parse skip count', () => {
      const result = parseVitestOutput(WITH_SKIPS);
      expect(result.skipped).toBe(2);
      expect(result.passed).toBe(15);
      expect(result.total).toBe(17);
    });
  });

  describe('failed suite (compilation error)', () => {
    it('should parse as failed with 0 tests', () => {
      const result = parseVitestOutput(FAILED_SUITE);
      expect(result.total).toBe(0);
      expect(result.passed).toBe(0);
    });

    it('should extract suite failure info', () => {
      const result = parseVitestOutput(FAILED_SUITE);
      expect(result.failures.length).toBeGreaterThan(0);
      expect(result.failures[0]!.name).toContain('cli-error-format.test.ts');
    });
  });

  describe('empty/malformed output', () => {
    it('should handle empty string', () => {
      const result = parseVitestOutput('');
      expect(result.passed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.total).toBe(0);
      expect(result.failures).toEqual([]);
      expect(result.duration).toBe('unknown');
    });

    it('should handle garbage input', () => {
      const result = parseVitestOutput('not vitest output at all\nrandom text');
      expect(result.passed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.total).toBe(0);
      expect(result.failures).toEqual([]);
    });
  });

  describe('error message truncation', () => {
    it('should truncate long error messages', () => {
      const longError = 'A'.repeat(300);
      const output = ` RUN  v2.1.9 /test

 FAIL  src/test.ts > test > it
${longError}

 ❯ src/test.ts:1:1

 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  21:31:47
   Duration  100ms`;

      const result = parseVitestOutput(output);
      expect(result.failures).toHaveLength(1);
      // Error message should be truncated with ellipsis
      expect(result.failures[0]!.error.length).toBeLessThanOrEqual(203);
      expect(result.failures[0]!.error).toMatch(/\.\.\.$/);
    });
  });
});

describe('formatTestSummary', () => {
  // Import dynamically since we also test it here
  it('should format all-passing summary', async () => {
    const { formatTestSummary } = await import('./test-summary.js');

    const summary: TestSummary = {
      passed: 65,
      failed: 0,
      skipped: 0,
      total: 65,
      duration: '1.23s',
      failures: [],
    };

    const output = formatTestSummary(summary, '/path/to/log');
    expect(output).toContain('TESTS: 65 passed, 0 failed, 0 skipped (1.23s)');
    expect(output).toContain('LOG: Full output at /path/to/log');
    // No FAIL lines
    expect(output).not.toContain('FAIL ');
  });

  it('should format summary with failures', async () => {
    const { formatTestSummary } = await import('./test-summary.js');

    const summary: TestSummary = {
      passed: 17,
      failed: 3,
      skipped: 0,
      total: 20,
      duration: '1.23s',
      failures: [
        { name: 'src/rules/engine.test.ts > RuleEngine > should validate', error: 'AssertionError: expected true' },
        { name: 'src/rules/types.test.ts > RuleSchema > reject', error: 'ZodError: Invalid enum' },
      ],
    };

    const output = formatTestSummary(summary, '/path/to/log');
    expect(output).toContain('TESTS: 17 passed, 3 failed, 0 skipped (1.23s)');
    expect(output).toContain('FAIL src/rules/engine.test.ts > RuleEngine > should validate');
    expect(output).toContain('  AssertionError: expected true');
    expect(output).toContain('FAIL src/rules/types.test.ts > RuleSchema > reject');
  });
});
