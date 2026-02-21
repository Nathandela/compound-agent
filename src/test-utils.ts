/**
 * Shared test utilities for the compound-agent test suite.
 *
 * Sections:
 *   1. Lesson fixtures  - createLesson, createQuickLesson, createFullLesson, daysAgo
 *   2. skipIf helpers   - shouldSkipEmbeddingTests
 *   3. CLI test setup   - setupCliTestDir, cleanupCliTestDir, runCli, runCliWithEnv,
 *                         setupCliTestContext, createRunCli
 */

import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach } from 'vitest';

import { closeDb } from './memory/storage/sqlite/index.js';
import type { Lesson, PatternItem, Preference, Severity, Solution, Source } from './memory/types.js';

/**
 * Options for creating lesson fixtures.
 */
export interface LessonOptions {
  /** Custom trigger text (default: 'trigger for {insight}') */
  trigger?: string;
  /** Tags for the lesson (default: []) */
  tags?: string[];
  /** Whether lesson is confirmed (default: true) */
  confirmed?: boolean;
  /** Created date as ISO string or days ago as number */
  created?: string | number;
  /** Evidence text for full lessons */
  evidence?: string;
  /** Severity level for full lessons */
  severity?: Severity;
  /** Whether lesson is deleted */
  deleted?: boolean;
  /** Source of the lesson (default: 'manual') */
  source?: Source;
}

/**
 * Create a test lesson with full control over all fields.
 *
 * @param overrides - Partial lesson data to override defaults
 * @returns A complete Lesson object
 *
 * @example
 * ```ts
 * const lesson = createLesson({ id: 'L001', insight: 'Use Polars' });
 * const fullLesson = createLesson({ id: 'L002', severity: 'high' });
 * ```
 */
export function createLesson(overrides: Partial<Lesson> = {}): Lesson {
  const id = overrides.id ?? 'L001';
  const insight = overrides.insight ?? 'test insight';
  const type = overrides.type ?? 'lesson';

  return {
    id,
    type,
    trigger: overrides.trigger ?? `trigger for ${insight}`,
    insight,
    tags: overrides.tags ?? [],
    source: overrides.source ?? 'manual',
    context: overrides.context ?? { tool: 'test', intent: 'testing' },
    created: overrides.created ?? new Date().toISOString(),
    confirmed: overrides.confirmed ?? true,
    supersedes: overrides.supersedes ?? [],
    related: overrides.related ?? [],
    ...(overrides.evidence !== undefined && { evidence: overrides.evidence }),
    ...(overrides.severity !== undefined && { severity: overrides.severity }),
    ...(overrides.pattern !== undefined && { pattern: overrides.pattern }),
    ...(overrides.deleted !== undefined && { deleted: overrides.deleted }),
    ...(overrides.retrievalCount !== undefined && { retrievalCount: overrides.retrievalCount }),
  };
}

/**
 * Create a quick lesson for testing.
 *
 * @param id - Lesson ID
 * @param insight - Insight text
 * @param options - Additional options
 * @returns A Lesson object with type 'lesson' (no evidence/severity)
 *
 * @example
 * ```ts
 * const lesson = createQuickLesson('L001', 'Use Polars for data');
 * const lesson2 = createQuickLesson('L002', 'Test code', { trigger: 'custom trigger' });
 * ```
 */
export function createQuickLesson(
  id: string,
  insight: string,
  options: LessonOptions = {}
): Lesson {
  const created = resolveCreatedDate(options.created);

  return {
    id,
    type: 'lesson',
    trigger: options.trigger ?? `trigger for ${insight}`,
    insight,
    tags: options.tags ?? [],
    source: options.source ?? 'manual',
    context: { tool: 'test', intent: 'testing' },
    created,
    confirmed: options.confirmed ?? true,
    supersedes: [],
    related: [],
    ...(options.deleted !== undefined && { deleted: options.deleted }),
  };
}

/**
 * Create a full lesson for testing.
 *
 * @param id - Lesson ID
 * @param insight - Insight text
 * @param severity - Severity level (default: 'medium')
 * @param options - Additional options
 * @returns A Lesson object with type 'lesson' and evidence/severity set
 *
 * @example
 * ```ts
 * const lesson = createFullLesson('L001', 'Always validate input', 'high');
 * const lesson2 = createFullLesson('L002', 'Test first', 'medium', { confirmed: false });
 * ```
 */
export function createFullLesson(
  id: string,
  insight: string,
  severity: Severity = 'medium',
  options: LessonOptions = {}
): Lesson {
  const created = resolveCreatedDate(options.created);

  return {
    id,
    type: 'lesson',
    trigger: options.trigger ?? `trigger for ${insight}`,
    insight,
    evidence: options.evidence ?? 'Test evidence',
    severity,
    tags: options.tags ?? [],
    source: options.source ?? 'manual',
    context: { tool: 'test', intent: 'testing' },
    created,
    confirmed: options.confirmed ?? true,
    supersedes: [],
    related: [],
    ...(options.deleted !== undefined && { deleted: options.deleted }),
  };
}

/**
 * Create a solution memory item for testing.
 *
 * @param id - Item ID (should start with 'S')
 * @param insight - Resolution text
 * @param options - Additional options
 * @returns A Solution memory item
 */
export function createSolution(
  id: string,
  insight: string,
  options: LessonOptions = {}
): Solution {
  const created = resolveCreatedDate(options.created);

  return {
    id,
    type: 'solution',
    trigger: options.trigger ?? `problem for ${insight}`,
    insight,
    tags: options.tags ?? [],
    source: options.source ?? 'manual',
    context: { tool: 'test', intent: 'testing' },
    created,
    confirmed: options.confirmed ?? true,
    supersedes: [],
    related: [],
    ...(options.deleted !== undefined && { deleted: options.deleted }),
  };
}

/**
 * Create a pattern memory item for testing.
 * Pattern field (bad -> good) is REQUIRED.
 *
 * @param id - Item ID (should start with 'P')
 * @param insight - Pattern description
 * @param bad - Bad code example
 * @param good - Good code example
 * @param options - Additional options
 * @returns A PatternItem memory item
 */
export function createPattern(
  id: string,
  insight: string,
  bad: string,
  good: string,
  options: LessonOptions = {}
): PatternItem {
  const created = resolveCreatedDate(options.created);

  return {
    id,
    type: 'pattern',
    trigger: options.trigger ?? `trigger for ${insight}`,
    insight,
    pattern: { bad, good },
    tags: options.tags ?? [],
    source: options.source ?? 'manual',
    context: { tool: 'test', intent: 'testing' },
    created,
    confirmed: options.confirmed ?? true,
    supersedes: [],
    related: [],
    ...(options.deleted !== undefined && { deleted: options.deleted }),
  };
}

/**
 * Create a preference memory item for testing.
 *
 * @param id - Item ID (should start with 'R')
 * @param insight - Preference description
 * @param options - Additional options
 * @returns A Preference memory item
 */
export function createPreference(
  id: string,
  insight: string,
  options: LessonOptions = {}
): Preference {
  const created = resolveCreatedDate(options.created);

  return {
    id,
    type: 'preference',
    trigger: options.trigger ?? `trigger for ${insight}`,
    insight,
    tags: options.tags ?? [],
    source: options.source ?? 'manual',
    context: { tool: 'test', intent: 'testing' },
    created,
    confirmed: options.confirmed ?? true,
    supersedes: [],
    related: [],
    ...(options.deleted !== undefined && { deleted: options.deleted }),
  };
}

/**
 * Resolve created date from string, number (days ago), or undefined.
 */
function resolveCreatedDate(created: string | number | undefined): string {
  if (typeof created === 'string') {
    return created;
  }
  if (typeof created === 'number') {
    // Number represents days ago
    const date = new Date();
    date.setDate(date.getDate() - created);
    return date.toISOString();
  }
  return new Date().toISOString();
}

/**
 * Helper to calculate ISO date string for N days ago.
 *
 * @param days - Number of days in the past
 * @returns ISO8601 date string
 *
 * @example
 * ```ts
 * const weekAgo = daysAgo(7);
 * ```
 */
export function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

/**
 * Check if embedding tests should be skipped.
 *
 * Tests should be skipped if:
 * 1. SKIP_EMBEDDING_TESTS environment variable is set (any truthy value)
 * 2. Model file is not available
 * 3. Model runtime is not usable on this machine (native backend incompatibility)
 *
 * This provides a way for CI environments without compatible native runners
 * to skip embedding-dependent tests while still running business logic tests.
 *
 * @param modelAvailable - Result of isModelAvailable() check
 * @param runtimeUsable - Result of isModelUsable().usable check (defaults to modelAvailable)
 * @returns true if embedding tests should be skipped
 *
 * @example
 * ```ts
 * const modelAvailable = isModelAvailable();
 * it.skipIf(shouldSkipEmbeddingTests(modelAvailable))('test...', async () => {
 *   // This test requires embedding model
 * });
 * ```
 */
export function shouldSkipEmbeddingTests(
  modelAvailable: boolean,
  runtimeUsable: boolean = modelAvailable
): boolean {
  const envSkip = process.env.SKIP_EMBEDDING_TESTS;
  const skipByEnv = envSkip !== undefined && envSkip !== '' && envSkip !== '0' && envSkip !== 'false';
  return skipByEnv || !modelAvailable || !runtimeUsable;
}

// ---------------------------------------------------------------------------
// Section 3: CLI test setup
// ---------------------------------------------------------------------------

/** Test context for CLI tests */
export interface CliTestContext {
  tempDir: string;
}

/**
 * Result from running a CLI command.
 */
export interface CliResult {
  stdout: string;
  stderr: string;
  combined: string;
}

/**
 * Create a temporary directory for CLI tests.
 * Each test should call this in beforeEach.
 */
export async function setupCliTestDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'compound-agent-cli-'));
}

/**
 * Clean up the temporary directory after tests.
 * Each test should call this in afterEach.
 */
export async function cleanupCliTestDir(tempDir: string): Promise<void> {
  closeDb();
  await rm(tempDir, { recursive: true, force: true });
}

/**
 * Parse a CLI args string into an array, respecting quoted strings.
 * Simple implementation sufficient for test usage.
 */
function parseCliArgs(args: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuote: string | null = null;

  for (const char of args) {
    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = char;
    } else if (char === ' ') {
      if (current) {
        result.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) result.push(current);
  return result;
}

/**
 * Run the CLI with given arguments.
 *
 * @param args - Command line arguments
 * @param tempDir - Working directory (used as COMPOUND_AGENT_ROOT)
 * @returns Object with stdout, stderr, and combined output
 */
export function runCli(args: string, tempDir: string): CliResult {
  const cliPath = join(process.cwd(), 'dist', 'cli.js');
  const argArray = parseCliArgs(args);
  try {
    const result = execFileSync('node', [cliPath, ...argArray], {
      cwd: tempDir,
      encoding: 'utf-8',
      env: { ...process.env, COMPOUND_AGENT_ROOT: tempDir },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = result;
    return { stdout, stderr: '', combined: stdout };
  } catch (error) {
    const err = error as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
    const stdout = err.stdout?.toString() ?? '';
    const stderr = err.stderr?.toString() ?? '';
    const combined = stdout + stderr + (err.message ?? '');
    return { stdout, stderr, combined };
  }
}

/**
 * Run CLI with custom environment variables.
 *
 * @param args - Command line arguments
 * @param tempDir - Working directory
 * @param env - Additional environment variables
 * @returns Object with stdout, stderr, and combined output
 */
export function runCliWithEnv(
  args: string,
  tempDir: string,
  env: Record<string, string>
): CliResult {
  const cliPath = join(process.cwd(), 'dist', 'cli.js');
  const argArray = parseCliArgs(args);
  try {
    const result = execFileSync('node', [cliPath, ...argArray], {
      cwd: tempDir,
      encoding: 'utf-8',
      env: { ...process.env, COMPOUND_AGENT_ROOT: tempDir, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = result;
    return { stdout, stderr: '', combined: stdout };
  } catch (error) {
    const err = error as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
    const stdout = err.stdout?.toString() ?? '';
    const stderr = err.stderr?.toString() ?? '';
    const combined = stdout + stderr + (err.message ?? '');
    return { stdout, stderr, combined };
  }
}

/**
 * Create a runCli helper bound to a specific temp directory.
 */
export function createRunCli(getTempDir: () => string): (args: string) => CliResult {
  return (args: string): CliResult => runCli(args, getTempDir());
}

/**
 * Setup and teardown helpers for CLI tests.
 * Returns a function to get the current temp directory.
 */
export function setupCliTestContext(): {
  getTempDir: () => string;
  runCli: (args: string) => CliResult;
} {
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await setupCliTestDir();
  });

  afterEach(async () => {
    await cleanupCliTestDir(tempDir);
  });

  const getTempDir = (): string => tempDir;
  const boundRunCli = createRunCli(getTempDir);

  return { getTempDir, runCli: boundRunCli };
}
