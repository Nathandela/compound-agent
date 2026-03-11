/**
 * Tests for linter detection utility.
 *
 * Uses temporary directories with fixture config files
 * to verify detection logic for each supported linter.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { detectLinter } from './detect.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'lint-detect-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('detectLinter', () => {
  // S6: ESLint flat config detected
  it('detects ESLint flat config (eslint.config.js)', () => {
    writeFileSync(join(tmpDir, 'eslint.config.js'), 'export default [];\n');

    const result = detectLinter(tmpDir);

    expect(result.linter).toBe('eslint');
    expect(result.configPath).toBe('eslint.config.js');
  });

  it('detects ESLint flat config (.mjs variant)', () => {
    writeFileSync(join(tmpDir, 'eslint.config.mjs'), 'export default [];\n');

    const result = detectLinter(tmpDir);

    expect(result.linter).toBe('eslint');
    expect(result.configPath).toBe('eslint.config.mjs');
  });

  it('detects ESLint flat config (.ts variant)', () => {
    writeFileSync(join(tmpDir, 'eslint.config.ts'), 'export default [];\n');

    const result = detectLinter(tmpDir);

    expect(result.linter).toBe('eslint');
    expect(result.configPath).toBe('eslint.config.ts');
  });

  it('detects ESLint legacy config (.eslintrc.cjs)', () => {
    writeFileSync(join(tmpDir, '.eslintrc.cjs'), 'module.exports = {};\n');

    const result = detectLinter(tmpDir);

    expect(result.linter).toBe('eslint');
    expect(result.configPath).toBe('.eslintrc.cjs');
  });

  it('detects ESLint legacy config (.eslintrc.json)', () => {
    writeFileSync(join(tmpDir, '.eslintrc.json'), '{}\n');

    const result = detectLinter(tmpDir);

    expect(result.linter).toBe('eslint');
    expect(result.configPath).toBe('.eslintrc.json');
  });

  // S7: Ruff in pyproject.toml detected
  it('detects Ruff via ruff.toml', () => {
    writeFileSync(join(tmpDir, 'ruff.toml'), '[lint]\nselect = ["E"]\n');

    const result = detectLinter(tmpDir);

    expect(result.linter).toBe('ruff');
    expect(result.configPath).toBe('ruff.toml');
  });

  it('detects Ruff via .ruff.toml (dot-prefixed)', () => {
    writeFileSync(join(tmpDir, '.ruff.toml'), '[lint]\nselect = ["E"]\n');

    const result = detectLinter(tmpDir);

    expect(result.linter).toBe('ruff');
    expect(result.configPath).toBe('.ruff.toml');
  });

  it('detects Ruff via pyproject.toml containing [tool.ruff]', () => {
    writeFileSync(
      join(tmpDir, 'pyproject.toml'),
      '[project]\nname = "foo"\n\n[tool.ruff]\nselect = ["E"]\n',
    );

    const result = detectLinter(tmpDir);

    expect(result.linter).toBe('ruff');
    expect(result.configPath).toBe('pyproject.toml');
  });

  it('ignores pyproject.toml without [tool.ruff]', () => {
    writeFileSync(
      join(tmpDir, 'pyproject.toml'),
      '[project]\nname = "foo"\n',
    );

    const result = detectLinter(tmpDir);

    expect(result.linter).toBe('unknown');
    expect(result.configPath).toBeNull();
  });

  it('ignores commented-out [tool.ruff] in pyproject.toml', () => {
    writeFileSync(
      join(tmpDir, 'pyproject.toml'),
      '[project]\nname = "foo"\n# [tool.ruff]\n# select = ["E"]\n',
    );

    const result = detectLinter(tmpDir);

    expect(result.linter).toBe('unknown');
    expect(result.configPath).toBeNull();
  });

  it('detects Ruff via pyproject.toml containing only [tool.ruff.lint] (no [tool.ruff])', () => {
    writeFileSync(
      join(tmpDir, 'pyproject.toml'),
      '[project]\nname = "foo"\n\n[tool.ruff.lint]\nselect = ["E"]\n',
    );

    const result = detectLinter(tmpDir);

    expect(result.linter).toBe('ruff');
    expect(result.configPath).toBe('pyproject.toml');
  });

  it('does not treat a directory named ruff.toml as a config file', () => {
    mkdirSync(join(tmpDir, 'ruff.toml'));

    const result = detectLinter(tmpDir);

    expect(result.linter).toBe('unknown');
    expect(result.configPath).toBeNull();
  });

  // Other linters
  it('detects Clippy via clippy.toml', () => {
    writeFileSync(join(tmpDir, 'clippy.toml'), 'cognitive-complexity-threshold = 30\n');

    const result = detectLinter(tmpDir);

    expect(result.linter).toBe('clippy');
    expect(result.configPath).toBe('clippy.toml');
  });

  it('detects golangci-lint via .golangci.yml', () => {
    writeFileSync(join(tmpDir, '.golangci.yml'), 'linters:\n  enable:\n    - govet\n');

    const result = detectLinter(tmpDir);

    expect(result.linter).toBe('golangci-lint');
    expect(result.configPath).toBe('.golangci.yml');
  });

  it('detects ast-grep via sgconfig.yml', () => {
    writeFileSync(join(tmpDir, 'sgconfig.yml'), 'ruleDirs:\n  - rules\n');

    const result = detectLinter(tmpDir);

    expect(result.linter).toBe('ast-grep');
    expect(result.configPath).toBe('sgconfig.yml');
  });

  it('detects Semgrep via .semgrep.yml', () => {
    writeFileSync(join(tmpDir, '.semgrep.yml'), 'rules: []\n');

    const result = detectLinter(tmpDir);

    expect(result.linter).toBe('semgrep');
    expect(result.configPath).toBe('.semgrep.yml');
  });

  // S8: Multiple linters present -- first match wins
  it('returns first match when multiple linters present (ESLint wins over Ruff)', () => {
    writeFileSync(join(tmpDir, 'eslint.config.js'), 'export default [];\n');
    writeFileSync(join(tmpDir, 'ruff.toml'), '[lint]\n');

    const result = detectLinter(tmpDir);

    expect(result.linter).toBe('eslint');
    expect(result.configPath).toBe('eslint.config.js');
  });

  it('returns Ruff when Ruff configs present but no ESLint', () => {
    writeFileSync(join(tmpDir, 'ruff.toml'), '[lint]\n');
    writeFileSync(join(tmpDir, '.golangci.yml'), 'linters:\n');

    const result = detectLinter(tmpDir);

    expect(result.linter).toBe('ruff');
    expect(result.configPath).toBe('ruff.toml');
  });

  // S17: No linter found
  it('returns unknown when no linter config found', () => {
    const result = detectLinter(tmpDir);

    expect(result.linter).toBe('unknown');
    expect(result.configPath).toBeNull();
  });

  it('returns unknown for empty directory with unrelated files', () => {
    writeFileSync(join(tmpDir, 'README.md'), '# Hello\n');
    writeFileSync(join(tmpDir, 'package.json'), '{}\n');

    const result = detectLinter(tmpDir);

    expect(result.linter).toBe('unknown');
    expect(result.configPath).toBeNull();
  });

  // S9: Malformed config -- no crash
  it('returns unknown when pyproject.toml is unreadable (malformed)', () => {
    // Write pyproject.toml but make it a directory to trigger a read error
    mkdirSync(join(tmpDir, 'pyproject.toml'));

    const result = detectLinter(tmpDir);

    // Should not crash; no ruff.toml or .ruff.toml present,
    // pyproject.toml read will fail, so ruff is skipped
    expect(result).toBeDefined();
    expect(result.linter).toBe('unknown');
    expect(result.configPath).toBeNull();
  });

  it('handles non-existent directory gracefully', () => {
    const result = detectLinter(join(tmpDir, 'nonexistent'));

    expect(result.linter).toBe('unknown');
    expect(result.configPath).toBeNull();
  });

  it('returns distinct objects for unknown results (no shared mutable reference)', () => {
    const a = detectLinter(tmpDir);
    const b = detectLinter(tmpDir);

    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
