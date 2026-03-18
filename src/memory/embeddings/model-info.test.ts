/**
 * Tests for model-info.ts — lightweight model metadata with zero native imports.
 *
 * Written BEFORE implementation (TDD).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MODEL_DIR,
  EMBEDDING_DIMS,
  EMBEDDING_MODEL_ID,
  isModelAvailable,
  MODEL_FILENAME,
  MODEL_URI,
} from './model-info.js';

describe('model-info exports', () => {
  it('exports MODEL_URI as a HuggingFace model identifier', () => {
    expect(MODEL_URI).toBe('nomic-ai/nomic-embed-text-v1.5');
  });

  it('exports MODEL_FILENAME matching HuggingFace cache convention', () => {
    expect(MODEL_FILENAME).toBe('models--nomic-ai--nomic-embed-text-v1.5');
  });

  it('exports DEFAULT_MODEL_DIR under HuggingFace cache', () => {
    expect(DEFAULT_MODEL_DIR).toContain('.cache');
    expect(DEFAULT_MODEL_DIR).toContain('huggingface');
    expect(DEFAULT_MODEL_DIR).toContain('hub');
  });

  it('exports EMBEDDING_MODEL_ID for cache tagging', () => {
    expect(EMBEDDING_MODEL_ID).toBe('nomic-embed-text-v1.5-q8');
  });

  it('exports EMBEDDING_DIMS as 768', () => {
    expect(EMBEDDING_DIMS).toBe(768);
  });

  it('exports isModelAvailable as a function', () => {
    expect(typeof isModelAvailable).toBe('function');
  });

  it('isModelAvailable returns a boolean', () => {
    const result = isModelAvailable();
    expect(typeof result).toBe('boolean');
  });
});

describe('zero native imports (fragile contract)', () => {
  it('model-info.ts source does NOT import @huggingface/transformers', () => {
    const source = readFileSync(
      join(__dirname, 'model-info.ts'),
      'utf-8'
    );
    expect(source).not.toMatch(/from\s+['"]@huggingface\/transformers['"]/);
    expect(source).not.toMatch(/require\s*\(\s*['"]@huggingface\/transformers['"]\s*\)/);
  });

  it('model-info.ts source does NOT import node-llama-cpp', () => {
    const source = readFileSync(
      join(__dirname, 'model-info.ts'),
      'utf-8'
    );
    expect(source).not.toMatch(/from\s+['"]node-llama-cpp['"]/);
    expect(source).not.toMatch(/require\s*\(\s*['"]node-llama-cpp['"]\s*\)/);
  });

  it('model-info.ts source does NOT import from model.js or nomic.js', () => {
    const source = readFileSync(
      join(__dirname, 'model-info.ts'),
      'utf-8'
    );
    expect(source).not.toMatch(/from\s+['"]\.\/model\.js['"]/);
    expect(source).not.toMatch(/from\s+['"]\.\/nomic\.js['"]/);
  });
});

describe('backward compatibility with model.ts', () => {
  it('model.ts re-exports isModelAvailable from model-info', async () => {
    const modelModule = await import('./model.js');
    expect(modelModule.isModelAvailable).toBe(isModelAvailable);
  });

  it('model.ts re-exports MODEL_URI from model-info', async () => {
    const modelModule = await import('./model.js');
    expect(modelModule.MODEL_URI).toBe(MODEL_URI);
  });

  it('model.ts re-exports MODEL_FILENAME from model-info', async () => {
    const modelModule = await import('./model.js');
    expect(modelModule.MODEL_FILENAME).toBe(MODEL_FILENAME);
  });

  it('model.ts re-exports EMBEDDING_MODEL_ID from model-info', async () => {
    const modelModule = await import('./model.js');
    expect(modelModule.EMBEDDING_MODEL_ID).toBe(EMBEDDING_MODEL_ID);
  });

  it('model.ts re-exports EMBEDDING_DIMS from model-info', async () => {
    const modelModule = await import('./model.js');
    expect(modelModule.EMBEDDING_DIMS).toBe(EMBEDDING_DIMS);
  });
});
