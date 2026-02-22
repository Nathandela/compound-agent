import { defineConfig } from 'vitest/config';

// NOTE: vitest.workspace.ts takes priority when present.
// This file is kept as fallback and for coverage configuration.
export default defineConfig({
  cacheDir: 'node_modules/.vitest',

  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30_000,
    include: ['src/**/*.test.ts', 'tools/**/*.test.js'],

    pool: 'threads',
    poolOptions: {
      threads: {
        minThreads: 2,
        maxThreads: 4,
      },
    },
    isolate: true,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules',
        'dist',
        '**/*.test.ts',
        '**/index.ts',
        'src/cli.ts',
      ],
    },
  },
});
