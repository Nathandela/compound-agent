import { describe, it, expect } from 'vitest';

import {
  detectSelfCorrection,
  detectTestFailure,
  detectUserCorrection,
  inferMemoryItemType,
} from './triggers.js';
import type { CorrectionSignal, EditHistory, TestResult } from './triggers.js';

describe('trigger detection', () => {
  describe('detectUserCorrection', () => {
    it('returns null for empty signals', () => {
      const result = detectUserCorrection({ messages: [], context: { tool: '', intent: '' } });
      expect(result).toBeNull();
    });

    it('detects "no" correction pattern', () => {
      const signals: CorrectionSignal = {
        messages: ['can you fix this bug?', 'No, not that file - the other one'],
        context: { tool: 'edit', intent: 'bug fix' },
      };
      const result = detectUserCorrection(signals);
      expect(result).not.toBeNull();
      expect(result?.trigger).toContain('correction');
    });

    it('detects "wrong" correction pattern', () => {
      const signals: CorrectionSignal = {
        messages: ['update the config', 'That is wrong, I meant the dev config'],
        context: { tool: 'edit', intent: 'config update' },
      };
      const result = detectUserCorrection(signals);
      expect(result).not.toBeNull();
    });

    it('detects "actually" correction pattern', () => {
      const signals: CorrectionSignal = {
        messages: ['add a new function', 'Actually, it should be a method on the class'],
        context: { tool: 'write', intent: 'add feature' },
      };
      const result = detectUserCorrection(signals);
      expect(result).not.toBeNull();
    });

    it('detects "not that" correction pattern', () => {
      const signals: CorrectionSignal = {
        messages: ['run the tests', 'Not that command, use pnpm test'],
        context: { tool: 'bash', intent: 'testing' },
      };
      const result = detectUserCorrection(signals);
      expect(result).not.toBeNull();
    });

    it('detects "I meant" correction pattern', () => {
      const signals: CorrectionSignal = {
        messages: ['open the file', 'I meant the TypeScript version, not JavaScript'],
        context: { tool: 'read', intent: 'view file' },
      };
      const result = detectUserCorrection(signals);
      expect(result).not.toBeNull();
    });

    it('returns null for normal conversation without corrections', () => {
      const signals: CorrectionSignal = {
        messages: ['can you add a test?', 'Yes, I will add a test for this function'],
        context: { tool: 'write', intent: 'testing' },
      };
      const result = detectUserCorrection(signals);
      expect(result).toBeNull();
    });

    it('includes context in detected correction', () => {
      const signals: CorrectionSignal = {
        messages: ['edit the config', 'No, that is the wrong file'],
        context: { tool: 'edit', intent: 'config update' },
      };
      const result = detectUserCorrection(signals);
      expect(result?.context.tool).toBe('edit');
      expect(result?.context.intent).toBe('config update');
    });

    it('extracts corrected message as trigger', () => {
      const signals: CorrectionSignal = {
        messages: ['add logging', 'No, that is too verbose, use debug level'],
        context: { tool: 'edit', intent: 'logging' },
      };
      const result = detectUserCorrection(signals);
      expect(result?.trigger).toBeDefined();
      expect(result?.trigger.length).toBeGreaterThan(0);
    });

    it('detects correction at start of message', () => {
      const signals: CorrectionSignal = {
        messages: ['fix the bug', 'Wrong approach - we should refactor first'],
        context: { tool: 'edit', intent: 'bug fix' },
      };
      const result = detectUserCorrection(signals);
      expect(result).not.toBeNull();
    });

    it('is case insensitive', () => {
      const signals: CorrectionSignal = {
        messages: ['update the API', 'ACTUALLY we need to update the tests first'],
        context: { tool: 'edit', intent: 'api update' },
      };
      const result = detectUserCorrection(signals);
      expect(result).not.toBeNull();
    });

    it('skips falsy messages in the array', () => {
      const signals: CorrectionSignal = {
        messages: ['first message', '', 'No, that is wrong'],
        context: { tool: 'edit', intent: 'test' },
      };
      const result = detectUserCorrection(signals);
      expect(result).not.toBeNull();
      expect(result?.correctionMessage).toBe('No, that is wrong');
    });

    it('handles single message array', () => {
      const signals: CorrectionSignal = {
        messages: ['No, that is wrong'],
        context: { tool: 'edit', intent: 'test' },
      };
      const result = detectUserCorrection(signals);
      // Only one message, needs at least 2 to detect correction
      expect(result).toBeNull();
    });
  });

  describe('detectSelfCorrection', () => {
    it('returns null for empty history', () => {
      const history: EditHistory = { edits: [] };
      const result = detectSelfCorrection(history);
      expect(result).toBeNull();
    });

    it('returns null for single edit', () => {
      const history: EditHistory = {
        edits: [{ file: 'src/app.ts', success: true, timestamp: Date.now() }],
      };
      const result = detectSelfCorrection(history);
      expect(result).toBeNull();
    });

    it('detects edit→fail→re-edit pattern on same file', () => {
      const history: EditHistory = {
        edits: [
          { file: 'src/app.ts', success: true, timestamp: Date.now() - 3000 },
          { file: 'src/app.ts', success: false, timestamp: Date.now() - 2000 },
          { file: 'src/app.ts', success: true, timestamp: Date.now() - 1000 },
        ],
      };
      const result = detectSelfCorrection(history);
      expect(result).not.toBeNull();
      expect(result?.file).toBe('src/app.ts');
    });

    it('returns null for all successful edits', () => {
      const history: EditHistory = {
        edits: [
          { file: 'src/app.ts', success: true, timestamp: Date.now() - 2000 },
          { file: 'src/app.ts', success: true, timestamp: Date.now() - 1000 },
        ],
      };
      const result = detectSelfCorrection(history);
      expect(result).toBeNull();
    });

    it('ignores edits to different files', () => {
      const history: EditHistory = {
        edits: [
          { file: 'src/app.ts', success: true, timestamp: Date.now() - 3000 },
          { file: 'src/other.ts', success: false, timestamp: Date.now() - 2000 },
          { file: 'src/app.ts', success: true, timestamp: Date.now() - 1000 },
        ],
      };
      const result = detectSelfCorrection(history);
      expect(result).toBeNull();
    });

    it('includes file path in detected correction', () => {
      const history: EditHistory = {
        edits: [
          { file: 'src/utils/helper.ts', success: true, timestamp: Date.now() - 3000 },
          { file: 'src/utils/helper.ts', success: false, timestamp: Date.now() - 2000 },
          { file: 'src/utils/helper.ts', success: true, timestamp: Date.now() - 1000 },
        ],
      };
      const result = detectSelfCorrection(history);
      expect(result?.file).toBe('src/utils/helper.ts');
    });

    it('handles sparse edits array with undefined entries', () => {
      // Create an array with holes (undefined values)
      const edits = new Array(5);
      edits[0] = { file: 'src/app.ts', success: true, timestamp: Date.now() - 3000 };
      // edits[1] is undefined (hole)
      edits[2] = { file: 'src/app.ts', success: false, timestamp: Date.now() - 2000 };
      // edits[3] is undefined (hole)
      edits[4] = { file: 'src/app.ts', success: true, timestamp: Date.now() - 1000 };

      const history: EditHistory = { edits };
      const result = detectSelfCorrection(history);
      // Pattern not found because of undefined entries breaking the sequence
      expect(result).toBeNull();
    });
  });

  describe('detectTestFailure', () => {
    it('returns null for passing tests', () => {
      const testResult: TestResult = {
        passed: true,
        output: 'All tests passed',
        testFile: 'src/app.test.ts',
      };
      const result = detectTestFailure(testResult);
      expect(result).toBeNull();
    });

    it('detects failing test', () => {
      const testResult: TestResult = {
        passed: false,
        output: 'FAIL src/app.test.ts\n  Expected 1 but got 2',
        testFile: 'src/app.test.ts',
      };
      const result = detectTestFailure(testResult);
      expect(result).not.toBeNull();
    });

    it('includes test file in detected failure', () => {
      const testResult: TestResult = {
        passed: false,
        output: 'TypeError: undefined is not a function',
        testFile: 'src/utils/helper.test.ts',
      };
      const result = detectTestFailure(testResult);
      expect(result?.testFile).toBe('src/utils/helper.test.ts');
    });

    it('includes error output in detected failure', () => {
      const testResult: TestResult = {
        passed: false,
        output: 'AssertionError: expected true to be false',
        testFile: 'src/app.test.ts',
      };
      const result = detectTestFailure(testResult);
      expect(result?.errorOutput).toContain('AssertionError');
    });

    it('extracts first error line for trigger', () => {
      const testResult: TestResult = {
        passed: false,
        output: 'FAIL src/app.test.ts\nExpected 1 but got 2\nStack trace here',
        testFile: 'src/app.test.ts',
      };
      const result = detectTestFailure(testResult);
      expect(result?.trigger).toBeDefined();
      expect(result?.trigger.length).toBeGreaterThan(0);
    });

    it('uses first line when no error/fail/assert keywords found', () => {
      const testResult: TestResult = {
        passed: false,
        output: 'Some unexpected output\nAnother line',
        testFile: 'src/app.test.ts',
      };
      const result = detectTestFailure(testResult);
      expect(result).not.toBeNull();
      expect(result?.trigger).toContain('Some unexpected output');
    });

    it('handles empty output string', () => {
      const testResult: TestResult = {
        passed: false,
        output: '',
        testFile: 'src/app.test.ts',
      };
      const result = detectTestFailure(testResult);
      expect(result).not.toBeNull();
      expect(result?.trigger).toBe('Test failure in src/app.test.ts: ');
    });

    it('handles output with only whitespace', () => {
      const testResult: TestResult = {
        passed: false,
        output: '   \n   \n   ',
        testFile: 'src/app.test.ts',
      };
      const result = detectTestFailure(testResult);
      expect(result).not.toBeNull();
      // All lines filtered out due to empty trim, falls back to empty string
      expect(result?.trigger).toBe('Test failure in src/app.test.ts: ');
    });
  });

  describe('inferMemoryItemType', () => {
    it('returns "pattern" for "use X instead of Y"', () => {
      expect(inferMemoryItemType('Use Polars instead of pandas for large datasets')).toBe('pattern');
    });

    it('returns "pattern" for "prefer X over Y"', () => {
      expect(inferMemoryItemType('Prefer async functions over callbacks in this codebase')).toBe('pattern');
    });

    it('returns "pattern" for "prefer X to Y"', () => {
      expect(inferMemoryItemType('Prefer pnpm to npm for this project')).toBe('pattern');
    });

    it('returns "solution" for "when X happens, do Y"', () => {
      expect(inferMemoryItemType('When the database connection fails, restart the pool')).toBe('solution');
    });

    it('returns "solution" for "if X then Y"', () => {
      expect(inferMemoryItemType('If tests fail with ENOENT, check that fixtures exist')).toBe('solution');
    });

    it('returns "solution" for "to fix X, do Y"', () => {
      expect(inferMemoryItemType('To fix the import error, add the .js extension')).toBe('solution');
    });

    it('returns "preference" for "always do X"', () => {
      expect(inferMemoryItemType('Always run pnpm lint before committing code changes')).toBe('preference');
    });

    it('returns "preference" for "never do X"', () => {
      expect(inferMemoryItemType('Never deploy without running the full test suite first')).toBe('preference');
    });

    it('returns "lesson" as default for observations', () => {
      expect(inferMemoryItemType('The database sometimes has connection issues in development')).toBe('lesson');
    });

    it('returns "lesson" for generic statements', () => {
      expect(inferMemoryItemType('This project uses TypeScript with strict mode enabled')).toBe('lesson');
    });

    it('is case insensitive', () => {
      expect(inferMemoryItemType('USE vitest instead of jest for this project')).toBe('pattern');
      expect(inferMemoryItemType('WHEN the build fails, clear the cache first')).toBe('solution');
      expect(inferMemoryItemType('ALWAYS check types before pushing')).toBe('preference');
    });
  });
});
