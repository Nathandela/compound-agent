/**
 * Trigger detection integration
 *
 * Orchestrates detection -> quality filter -> lesson proposal flow.
 * Provides a high-level API for CLI and hooks.
 */

import * as fs from 'node:fs/promises';

import type { Source } from '../types.js';
import { shouldPropose } from './quality.js';
import {
  detectUserCorrection,
  detectSelfCorrection,
  detectTestFailure,
} from './triggers.js';
import type {
  CorrectionSignal,
  EditHistory,
  TestResult,
} from './triggers.js';

/** Detection input types */
export type DetectionType = 'user' | 'self' | 'test';

/** Input for user correction detection */
export interface UserDetectionInput {
  type: 'user';
  data: CorrectionSignal;
}

/** Input for self correction detection */
export interface SelfDetectionInput {
  type: 'self';
  data: EditHistory;
}

/** Input for test failure detection */
export interface TestDetectionInput {
  type: 'test';
  data: TestResult;
}

/** Union type for all detection inputs */
export type DetectionInput = UserDetectionInput | SelfDetectionInput | TestDetectionInput;

/** Result of successful detection */
export interface DetectionResult {
  trigger: string;
  source: Source;
  proposedInsight: string;
}

/**
 * Detect triggers and propose lessons.
 *
 * Runs the appropriate detector based on input type, then filters
 * through quality checks. Returns a proposal if detection passes
 * all quality filters.
 *
 * @param repoRoot - Repository root path
 * @param input - Detection input with type and data
 * @returns Detection result with proposed insight, or null
 */
export async function detectAndPropose(
  repoRoot: string,
  input: DetectionInput
): Promise<DetectionResult | null> {
  const detected = runDetector(input);
  if (!detected) {
    return null;
  }

  const { trigger, source, proposedInsight } = detected;

  // Run quality filters on proposed insight
  const quality = await shouldPropose(repoRoot, proposedInsight);
  if (!quality.shouldPropose) {
    return null;
  }

  return { trigger, source, proposedInsight };
}

/** Internal detection result before quality filtering */
interface RawDetection {
  trigger: string;
  source: Source;
  proposedInsight: string;
}

/**
 * Run the appropriate detector based on input type.
 */
function runDetector(input: DetectionInput): RawDetection | null {
  switch (input.type) {
    case 'user':
      return detectUserCorrectionFlow(input.data);
    case 'self':
      return detectSelfCorrectionFlow(input.data);
    case 'test':
      return detectTestFailureFlow(input.data);
  }
}

/**
 * Detect user correction and extract insight.
 */
function detectUserCorrectionFlow(data: CorrectionSignal): RawDetection | null {
  const result = detectUserCorrection(data);
  if (!result) {
    return null;
  }

  return {
    trigger: result.trigger,
    source: 'user_correction',
    proposedInsight: result.correctionMessage,
  };
}

/**
 * Detect self correction and extract insight.
 */
function detectSelfCorrectionFlow(data: EditHistory): RawDetection | null {
  const result = detectSelfCorrection(data);
  if (!result) {
    return null;
  }

  return {
    trigger: result.trigger,
    source: 'self_correction',
    // Self-corrections need context to form useful insights
    proposedInsight: `Check ${result.file} for common errors before editing`,
  };
}

/**
 * Detect test failure and extract insight.
 */
function detectTestFailureFlow(data: TestResult): RawDetection | null {
  const result = detectTestFailure(data);
  if (!result) {
    return null;
  }

  return {
    trigger: result.trigger,
    source: 'test_failure',
    proposedInsight: result.errorOutput,
  };
}

/** Valid detection types for validation */
const VALID_TYPES = new Set<string>(['user', 'self', 'test']);

/**
 * Parse detection input from a JSON file.
 *
 * @param filePath - Path to JSON input file
 * @returns Parsed detection input
 * @throws Error if file is invalid or type is unknown
 */
export async function parseInputFile(filePath: string): Promise<DetectionInput> {
  const content = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(content) as { type: string; data: unknown };

  if (!VALID_TYPES.has(data.type)) {
    throw new Error(`Invalid detection type: ${data.type}. Must be one of: user, self, test`);
  }

  return data as DetectionInput;
}
