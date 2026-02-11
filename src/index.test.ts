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
  it('exports VERSION as semver string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
  });

  it('VERSION matches package.json version', () => {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
    expect(VERSION).toBe(pkg.version);
  });

  describe('storage exports', () => {
    it('exports appendLesson', () => {
      expect(typeof appendLesson).toBe('function');
    });

    it('exports readLessons', () => {
      expect(typeof readLessons).toBe('function');
    });

    it('exports rebuildIndex', () => {
      expect(typeof rebuildIndex).toBe('function');
    });

    it('exports searchKeyword', () => {
      expect(typeof searchKeyword).toBe('function');
    });

    it('exports closeDb', () => {
      expect(typeof closeDb).toBe('function');
    });
  });

  describe('embedding exports', () => {
    it('exports embedText', () => {
      expect(typeof embedText).toBe('function');
    });

    it('exports embedTexts', () => {
      expect(typeof embedTexts).toBe('function');
    });

    it('exports isModelAvailable', () => {
      expect(typeof isModelAvailable).toBe('function');
    });

    it('exports resolveModel', () => {
      expect(typeof resolveModel).toBe('function');
    });

    it('exports MODEL_FILENAME', () => {
      expect(typeof MODEL_FILENAME).toBe('string');
      expect(MODEL_FILENAME).toContain('.gguf');
    });
  });

  describe('search exports', () => {
    it('exports searchVector', () => {
      expect(typeof searchVector).toBe('function');
    });

    it('exports cosineSimilarity', () => {
      expect(typeof cosineSimilarity).toBe('function');
    });

    it('exports rankLessons', () => {
      expect(typeof rankLessons).toBe('function');
    });
  });

  describe('capture exports', () => {
    it('exports shouldPropose', () => {
      expect(typeof shouldPropose).toBe('function');
    });

    it('exports isNovel', () => {
      expect(typeof isNovel).toBe('function');
    });

    it('exports isSpecific', () => {
      expect(typeof isSpecific).toBe('function');
    });

    it('exports isActionable', () => {
      expect(typeof isActionable).toBe('function');
    });

    it('exports detectUserCorrection', () => {
      expect(typeof detectUserCorrection).toBe('function');
    });

    it('exports detectSelfCorrection', () => {
      expect(typeof detectSelfCorrection).toBe('function');
    });

    it('exports detectTestFailure', () => {
      expect(typeof detectTestFailure).toBe('function');
    });
  });

  describe('retrieval exports', () => {
    it('exports loadSessionLessons', () => {
      expect(typeof loadSessionLessons).toBe('function');
    });

    it('exports retrieveForPlan', () => {
      expect(typeof retrieveForPlan).toBe('function');
    });

    it('exports formatLessonsCheck', () => {
      expect(typeof formatLessonsCheck).toBe('function');
    });
  });

  describe('type exports', () => {
    it('exports generateId', () => {
      expect(typeof generateId).toBe('function');
    });

    it('exports LessonSchema', () => {
      expect(LessonSchema).toBeDefined();
    });
  });
});
