/**
 * Linter detection utility.
 *
 * Scans a directory for linter config files and returns
 * info about the first detected linter.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

/** Supported linter identifiers. */
export const LinterNameSchema = z.enum([
  'eslint',
  'ruff',
  'clippy',
  'golangci-lint',
  'ast-grep',
  'semgrep',
  'unknown',
]);

/** Result of linter detection. */
export const LinterInfoSchema = z.object({
  linter: LinterNameSchema,
  configPath: z.string().nullable(),
});

export type LinterInfo = z.infer<typeof LinterInfoSchema>;
export type LinterName = z.infer<typeof LinterNameSchema>;

/** Detection rules in priority order. Each entry maps a linter to its config filenames. */
const DETECTION_RULES: Array<{
  linter: z.infer<typeof LinterNameSchema>;
  configs: string[];
}> = [
  {
    linter: 'eslint',
    configs: [
      // Flat config (ESLint v9+)
      'eslint.config.js',
      'eslint.config.mjs',
      'eslint.config.cjs',
      'eslint.config.ts',
      'eslint.config.mts',
      'eslint.config.cts',
      // Legacy config
      '.eslintrc.js',
      '.eslintrc.cjs',
      '.eslintrc.json',
      '.eslintrc.yml',
      '.eslintrc.yaml',
    ],
  },
  {
    linter: 'ruff',
    configs: ['ruff.toml', '.ruff.toml'],
  },
  {
    linter: 'clippy',
    configs: ['clippy.toml', '.clippy.toml'],
  },
  {
    linter: 'golangci-lint',
    configs: ['.golangci.yml', '.golangci.yaml', '.golangci.toml', '.golangci.json'],
  },
  {
    linter: 'ast-grep',
    configs: ['sgconfig.yml'],
  },
  {
    linter: 'semgrep',
    configs: ['.semgrep.yml', '.semgrep.yaml'],
  },
];

/** Return a fresh unknown result (avoids shared mutable reference). */
function unknown(): LinterInfo {
  return { linter: 'unknown', configPath: null };
}

/**
 * Check if pyproject.toml contains a [tool.ruff] section.
 * Returns true if found, false otherwise (including on read errors).
 */
function pyprojectHasRuff(repoRoot: string): boolean {
  const filePath = join(repoRoot, 'pyproject.toml');
  try {
    const content = readFileSync(filePath, 'utf-8');
    return /^\s*\[tool\.ruff\]/m.test(content);
  } catch {
    return false;
  }
}

/**
 * Detect the linter used in a repository by scanning for config files.
 *
 * Checks linters in priority order; first match wins.
 * Returns `{ linter: 'unknown', configPath: null }` if nothing found.
 */
export function detectLinter(repoRoot: string): LinterInfo {
  try {
    for (const rule of DETECTION_RULES) {
      for (const config of rule.configs) {
        if (existsSync(join(repoRoot, config))) {
          return { linter: rule.linter, configPath: config };
        }
      }

      // Special case: Ruff can also live inside pyproject.toml
      if (rule.linter === 'ruff' && pyprojectHasRuff(repoRoot)) {
        return { linter: 'ruff', configPath: 'pyproject.toml' };
      }
    }
  } catch {
    // Graceful degradation on any unexpected error
    return unknown();
  }

  return unknown();
}
