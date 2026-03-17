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
  isModelAvailable,
  MODEL_FILENAME,
  MODEL_URI,
} from './model-info.js';

describe('model-info exports', () => {
  it('exports MODEL_URI as a HuggingFace GGUF URI', () => {
    expect(MODEL_URI).toMatch(/^hf:/);
    expect(MODEL_URI).toContain('embeddinggemma');
    expect(MODEL_URI).toContain('.gguf');
  });

  it('exports MODEL_FILENAME matching expected naming convention', () => {
    expect(MODEL_FILENAME).toMatch(/^hf_.*\.gguf$/);
    expect(MODEL_FILENAME).toContain('embeddinggemma');
  });

  it('exports DEFAULT_MODEL_DIR under home directory', () => {
    expect(DEFAULT_MODEL_DIR).toContain('.node-llama-cpp');
    expect(DEFAULT_MODEL_DIR).toContain('models');
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
  it('model-info.ts source does NOT import node-llama-cpp', () => {
    const source = readFileSync(
      join(__dirname, 'model-info.ts'),
      'utf-8'
    );
    // Check for import/require of node-llama-cpp (not the directory path constant)
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
});
