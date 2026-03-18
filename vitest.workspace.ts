import { defineWorkspace } from 'vitest/config';

// Integration test files: tests that spawn real CLI subprocesses via runCli().
// These are slow (each test = new Node process) and need a prior build (pnpm test / pnpm test:integration build automatically).
// Maintained as explicit list; add new files here when they use runCli() from test-utils.
const integrationFiles = [
  'src/cli/**/*.test.ts',
  'src/commands/audit.test.ts',
  'src/commands/capture.test.ts',
  'src/commands/compound.test.ts',
  'src/commands/loop.test.ts',
  'src/commands/management.test.ts',
  'src/commands/phase-check.cli.test.ts',
  'src/commands/retrieval.test.ts',
  'src/setup/setup.test.ts',
];

// Native unit tests: require better-sqlite3 or direct storage imports.
// These cannot run at high parallelism due to native module contention.
// Maintained as explicit list; add new files here when they import native modules directly.
const nativeFiles = [
  'src/audit/checks/lessons.test.ts',
  'src/audit/checks/patterns.test.ts',
  'src/audit/engine.test.ts',
  'src/compound/io.test.ts',
  'src/memory/capture/quality.test.ts',
  'src/memory/retrieval/plan.test.ts',
  'src/memory/retrieval/session.test.ts',
  'src/memory/search/prewarm.test.ts',
  'src/memory/search/unified-search.test.ts',
  'src/memory/search/vector.test.ts',
  'src/memory/storage/sqlite.test.ts',
  'src/memory/storage/sqlite/cache.test.ts',
  'src/setup/gemini.test.ts',
];

export default defineWorkspace([
  {
    test: {
      // Pure tests — no native module deps, safe for high parallelism.
      name: 'pure',
      globals: true,
      environment: 'node',
      include: ['src/**/*.test.ts', 'tools/**/*.test.js', 'scripts/**/*.test.ts'],
      exclude: [...nativeFiles, 'src/memory/embeddings/**/*.test.ts', ...integrationFiles],
      pool: 'threads',
      poolOptions: {
        threads: { minThreads: 1, maxThreads: 4 },
      },
      isolate: true,
    },
    cacheDir: 'node_modules/.vitest',
  },
  {
    test: {
      // Native unit tests — require better-sqlite3 or direct storage imports,
      // limited parallelism to avoid native module contention.
      name: 'native',
      globals: true,
      environment: 'node',
      include: nativeFiles,
      pool: 'threads',
      poolOptions: {
        threads: { minThreads: 1, maxThreads: 2 },
      },
      isolate: true,
    },
    cacheDir: 'node_modules/.vitest',
  },
  {
    test: {
      name: 'integration',
      globals: true,
      environment: 'node',
      include: integrationFiles,
      pool: 'forks',
      poolOptions: {
        forks: { minForks: 1, maxForks: 1 },
      },
      testTimeout: 60_000,
      hookTimeout: 60_000,
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
        // singleFork: onnxruntime-node (used by Transformers.js) is a native module
        // that cannot be safely shared or freed across worker threads/forks.
        // A single persistent fork provides process isolation and prevents SIGABRT.
        forks: { singleFork: true },
      },
      isolate: true,
    },
    cacheDir: 'node_modules/.vitest',
  },
]);
