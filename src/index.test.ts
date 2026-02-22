import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  // Core
  VERSION,

  // Storage
  appendLesson,
  readLessons,
  rebuildIndex,
  searchKeyword,
  closeDb,

  // Embeddings
  embedText,
  embedTexts,
  isModelAvailable,
  MODEL_FILENAME,
  resolveModel,

  // Search
  searchVector,
  cosineSimilarity,
  rankLessons,

  // Capture
  shouldPropose,
  isNovel,
  isSpecific,
  isActionable,
  detectUserCorrection,
  detectSelfCorrection,
  detectTestFailure,

  // Retrieval
  loadSessionLessons,
  retrieveForPlan,
  formatLessonsCheck,

  // Types
  generateId,
  LessonSchema,
} from './index.js';

describe('public API exports', () => {
  it('exports VERSION as semver string matching package.json', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
    expect(VERSION).toBe(pkg.version);
  });

  it('exports all storage functions', () => {
    for (const fn of [appendLesson, readLessons, rebuildIndex, searchKeyword, closeDb]) {
      expect(typeof fn).toBe('function');
    }
  });

  it('exports all embedding functions and constants', () => {
    for (const fn of [embedText, embedTexts, isModelAvailable, resolveModel]) {
      expect(typeof fn).toBe('function');
    }
    expect(typeof MODEL_FILENAME).toBe('string');
    expect(MODEL_FILENAME).toContain('.gguf');
  });

  it('exports all search functions', () => {
    for (const fn of [searchVector, cosineSimilarity, rankLessons]) {
      expect(typeof fn).toBe('function');
    }
  });

  it('exports all capture functions', () => {
    for (const fn of [
      shouldPropose,
      isNovel,
      isSpecific,
      isActionable,
      detectUserCorrection,
      detectSelfCorrection,
      detectTestFailure,
    ]) {
      expect(typeof fn).toBe('function');
    }
  });

  it('exports all retrieval functions', () => {
    for (const fn of [loadSessionLessons, retrieveForPlan, formatLessonsCheck]) {
      expect(typeof fn).toBe('function');
    }
  });

  it('exports type utilities', () => {
    expect(typeof generateId).toBe('function');
    expect(LessonSchema).toBeDefined();
  });
});
