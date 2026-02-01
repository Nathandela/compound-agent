import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Caching (Vite-level config)
  cacheDir: 'node_modules/.vitest',

  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],

    // Parallelization
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
        '**/index.ts', // Re-export barrels have no logic
        'src/cli.ts', // Integration tested via execSync (55 tests)
      ],
    },
  },
});
