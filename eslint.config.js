import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import importX from 'eslint-plugin-import-x'
import vitest from 'eslint-plugin-vitest'
import compoundAgent from './tools/eslint-rules/index.js'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '.claude/**', 'examples/**', 'scripts/**'] },

  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // Global rules (all files)
  {
    plugins: {
      'import-x': importX,
      'compound-agent': compoundAgent,
    },
    rules: {
      // Downgrade pre-existing recommended rules to warn (codebase wasn't linted before)
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      // Existing rules (keep as error)
      'no-var': 'error',
      'prefer-const': 'error',
      'no-else-return': 'error',
      // New rules (warn first, fix later)
      '@typescript-eslint/no-explicit-any': 'warn',
      'max-depth': ['warn', 4],
      'import-x/no-cycle': 'warn',
      'import-x/no-commonjs': 'warn',
      'compound-agent/no-sql-interpolation': 'warn',
      'compound-agent/no-mock-module-under-test': 'warn',
      'compound-agent/no-utils-helpers-dirs': 'warn',
    },
  },

  // src-only rules (exclude tests)
  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'warn',
      'max-lines-per-function': ['warn', { max: 75, skipBlankLines: true, skipComments: true }],
      'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
      'compound-agent/enforce-barrel-exports': 'warn',
    },
  },

  // Test file rules — relax type-strictness rules that are noisy in tests
  {
    files: ['**/*.test.ts', '**/*.test.js'],
    plugins: { vitest },
    rules: {
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'warn',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  prettier,
)
