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

export default defineWorkspace([
  {
    test: {
      name: 'unit',
      globals: true,
      environment: 'node',
      include: ['src/**/*.test.ts', 'tools/**/*.test.js', 'scripts/**/*.test.ts'],
      exclude: ['src/memory/embeddings/**/*.test.ts', ...integrationFiles],
      pool: 'threads',
      poolOptions: {
        // Stopgap: reduced from 4→2 to limit native module memory duplication.
        // Revisit after E2 (Import Graph Decoupling, learning_agent-863u).
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
        forks: { singleFork: true },
      },
      isolate: true,
    },
    cacheDir: 'node_modules/.vitest',
  },
]);
