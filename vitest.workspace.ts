import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'unit',
      globals: true,
      environment: 'node',
      include: ['src/**/*.test.ts', 'tools/**/*.test.js'],
      exclude: ['src/memory/embeddings/**/*.test.ts'],
      pool: 'threads',
      poolOptions: {
        threads: { minThreads: 2, maxThreads: 4 },
      },
      isolate: true,
      globalSetup: ['./tests/global-setup.ts'],
    },
    cacheDir: 'node_modules/.vitest',
  },
  {
    test: {
      name: 'embedding',
      globals: true,
      environment: 'node',
      include: ['src/memory/embeddings/**/*.test.ts'],
      pool: 'forks',
      poolOptions: {
        forks: { singleFork: true },
      },
      isolate: true,
    },
    cacheDir: 'node_modules/.vitest',
  },
]);
