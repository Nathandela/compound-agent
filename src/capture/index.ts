/**
 * Capture module - Quality filters and trigger detection
 *
 * Quality filters ensure lessons are novel, specific, and actionable.
 * Trigger detection identifies learning opportunities from:
 * - User corrections
 * - Self-corrections
 * - Test failures
 */

// Quality filters
export { isActionable, isNovel, isSpecific, shouldPropose } from './quality.js';
export type {
  ActionabilityResult,
  NoveltyOptions,
  NoveltyResult,
  ProposeResult,
  SpecificityResult,
} from './quality.js';

// Trigger detection
export { detectSelfCorrection, detectTestFailure, detectUserCorrection } from './triggers.js';
export type {
  CorrectionSignal,
  DetectedCorrection,
  DetectedSelfCorrection,
  DetectedTestFailure,
  EditEntry,
  EditHistory,
  TestResult,
} from './triggers.js';

// Integration (orchestration)
export { detectAndPropose, parseInputFile } from './integration.js';
export type {
  DetectionInput,
  DetectionResult,
  DetectionType,
  SelfDetectionInput,
  TestDetectionInput,
  UserDetectionInput,
} from './integration.js';
