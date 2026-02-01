import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Run files sequentially to avoid resource contention
    // (SQLite database, embedding model, temp directories)
    fileParallelism: false,
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
