/**
 * Trigger detection for automatic lesson capture
 *
 * Detects patterns that indicate potential learning opportunities:
 * - User corrections
 * - Self-corrections
 * - Test failures
 */

import type { Context } from '../types.js';

/** Signal data for correction detection */
export interface CorrectionSignal {
  messages: string[];
  context: Context;
}

/** Detected correction result */
export interface DetectedCorrection {
  trigger: string;
  correctionMessage: string;
  context: Context;
}

/** User correction patterns */
const USER_CORRECTION_PATTERNS = [
  /\bno\b[,.]?\s/i, // "no, ..." or "no ..."
  /\bwrong\b/i, // "wrong"
  /\bactually\b/i, // "actually..."
  /\bnot that\b/i, // "not that"
  /\bi meant\b/i, // "I meant"
];

/**
 * Detect user correction signals in conversation.
 *
 * Looks for patterns that indicate the user is correcting Claude's
 * understanding or actions.
 *
 * @param signals - Messages and context to analyze
 * @returns Detected correction or null if none found
 */
export function detectUserCorrection(signals: CorrectionSignal): DetectedCorrection | null {
  const { messages, context } = signals;

  if (messages.length < 2) {
    return null;
  }

  // Check later messages for correction patterns
  for (let i = 1; i < messages.length; i++) {
    const message = messages[i];
    if (!message) continue;

    for (const pattern of USER_CORRECTION_PATTERNS) {
      if (pattern.test(message)) {
        return {
          trigger: `User correction during ${context.intent}`,
          correctionMessage: message,
          context,
        };
      }
    }
  }

  return null;
}

/** Edit history entry */
export interface EditEntry {
  file: string;
  success: boolean;
  timestamp: number;
}

/** Edit history for self-correction detection */
export interface EditHistory {
  edits: EditEntry[];
}

/** Detected self-correction */
export interface DetectedSelfCorrection {
  file: string;
  trigger: string;
}

/**
 * Detect self-correction patterns in edit history.
 *
 * Looks for edit→fail→re-edit patterns on the same file,
 * which indicate Claude had to correct its own work.
 *
 * @param history - Edit history to analyze
 * @returns Detected self-correction or null if none found
 */
export function detectSelfCorrection(history: EditHistory): DetectedSelfCorrection | null {
  const { edits } = history;

  if (edits.length < 3) {
    return null;
  }

  // Look for edit→fail→re-edit pattern on same file
  for (let i = 0; i <= edits.length - 3; i++) {
    const first = edits[i];
    const second = edits[i + 1];
    const third = edits[i + 2];

    if (!first || !second || !third) continue;

    // Pattern: success → fail → success on same file
    if (
      first.file === second.file &&
      second.file === third.file &&
      first.success &&
      !second.success &&
      third.success
    ) {
      return {
        file: first.file,
        trigger: `Self-correction on ${first.file}`,
      };
    }
  }

  return null;
}

/** Test result for failure detection */
export interface TestResult {
  passed: boolean;
  output: string;
  testFile: string;
}

/** Detected test failure */
export interface DetectedTestFailure {
  testFile: string;
  errorOutput: string;
  trigger: string;
}

/**
 * Detect test failure patterns.
 *
 * When tests fail, this creates a potential learning opportunity
 * if the failure is later fixed.
 *
 * @param testResult - Test result to analyze
 * @returns Detected test failure or null if tests passed
 */
export function detectTestFailure(testResult: TestResult): DetectedTestFailure | null {
  if (testResult.passed) {
    return null;
  }

  // Extract first meaningful error line for trigger
  const lines = testResult.output.split('\n').filter((line) => line.trim().length > 0);
  const errorLine = lines.find((line) => /error|fail|assert/i.test(line)) ?? lines[0] ?? '';

  return {
    testFile: testResult.testFile,
    errorOutput: testResult.output,
    trigger: `Test failure in ${testResult.testFile}: ${errorLine.slice(0, 100)}`,
  };
}
