/**
 * Capture module - Quality filters and trigger detection
 *
 * Quality filters ensure memory items are novel and specific.
 * Trigger detection identifies learning opportunities from:
 * - User corrections
 * - Self-corrections
 * - Test failures
 *
 * Type inference classifies insights into memory item types:
 * pattern, solution, preference, or lesson (default).
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

// Trigger detection & type inference
export { detectSelfCorrection, detectTestFailure, detectUserCorrection, inferMemoryItemType } from './triggers.js';
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
