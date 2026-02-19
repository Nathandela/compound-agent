/**
 * Worktree commands — manage git worktrees for parallel epic execution.
 *
 * Subcommands: create, wire-deps, merge, list, cleanup
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';

import { getRepoRoot } from '../cli-utils.js';

const EPIC_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function validateEpicId(epicId: string): void {
  if (!EPIC_ID_PATTERN.test(epicId)) {
    throw new Error(`Invalid epic ID: "${epicId}" (must be alphanumeric with hyphens/underscores)`);
  }
}

/** Parse worktree entries from `git worktree list --porcelain` output. */
function parseWorktreeList(raw: string): Array<{ path: string; branch: string }> {
  const entries: Array<{ path: string; branch: string }> = [];
  let currentPath = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('worktree ')) {
      currentPath = line.slice('worktree '.length);
    } else if (line.startsWith('branch ')) {
      const branch = line.slice('branch refs/heads/'.length);
      entries.push({ path: currentPath, branch });
    }
  }
  return entries;
}

/** Parse deps from `bd show --json` output. */
function parseDepsJson(raw: string): Array<{ id: string; title: string; status: string }> {
  const data = JSON.parse(raw);
  const issue = Array.isArray(data) ? data[0] : data;
  if (!issue) return [];
  const depsArray = issue.depends_on ?? issue.dependencies ?? [];
  return depsArray.map((dep: { id?: string; title?: string; status?: string }) => ({
    id: dep.id ?? '',
    title: dep.title ?? '',
    status: dep.status ?? 'open',
  }));
}

/** Extract short ID from full beads ID (e.g., "learning_agent-m001" -> "m001"). */
function shortId(fullId: string): string {
  const parts = fullId.split('-');
  return parts[parts.length - 1] ?? fullId;
}

// ============================================================================
// worktree create
// ============================================================================

export interface WorktreeCreateResult {
  worktreePath: string;
  branch: string;
  mergeTaskId: string;
  alreadyExists: boolean;
}

export async function runWorktreeCreate(epicId: string): Promise<WorktreeCreateResult> {
  validateEpicId(epicId);

  const repoRoot = getRepoRoot();
  const basename = path.basename(repoRoot);
  const worktreePath = path.resolve(repoRoot, '..', `${basename}-wt-${epicId}`);
  const branch = `epic/${epicId}`;

  // Idempotency: check if worktree already exists
  const listRaw = execFileSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf-8' });
  const existing = parseWorktreeList(listRaw);
  if (existing.some(e => e.path === worktreePath || e.branch === branch)) {
    return { worktreePath, branch, mergeTaskId: '', alreadyExists: true };
  }

  // Create worktree
  execFileSync('git', ['worktree', 'add', worktreePath, '-b', branch], { encoding: 'utf-8' });

  // Install deps
  execFileSync('pnpm', ['install', '--frozen-lockfile'], { cwd: worktreePath, encoding: 'utf-8' });

  // Copy lessons JSONL
  const srcJsonl = path.join(repoRoot, '.claude', 'lessons', 'index.jsonl');
  const dstDir = path.join(worktreePath, '.claude', 'lessons');
  const dstJsonl = path.join(dstDir, 'index.jsonl');
  if (existsSync(srcJsonl)) {
    mkdirSync(dstDir, { recursive: true });
    copyFileSync(srcJsonl, dstJsonl);
  }

  // Run setup
  execFileSync('npx', ['ca', 'setup', '--skip-model'], { cwd: worktreePath, encoding: 'utf-8' });

  // Create Merge task
  const mergeTitle = `Merge: merge ${branch} to main`;
  const mergeDesc = `INSTRUCTIONS: This task merges the worktree branch back to main. Run \`npx ca worktree merge ${epicId}\` when all other blocking tasks are resolved.`;
  const bdOutput = execFileSync('bd', [
    'create',
    `--title=${mergeTitle}`,
    '--type=task',
    '--priority=1',
    `--description=${mergeDesc}`,
  ], { encoding: 'utf-8' });

  // Parse merge task ID from bd output (e.g., "Created learning_agent-m001")
  const idMatch = bdOutput.match(/(\S+)$/);
  const mergeFullId = idMatch?.[1] ?? '';
  const mergeTaskId = shortId(mergeFullId);

  // Wire dep: epic depends on merge
  execFileSync('bd', ['dep', 'add', epicId, mergeTaskId], { encoding: 'utf-8' });

  return { worktreePath, branch, mergeTaskId, alreadyExists: false };
}

// ============================================================================
// worktree wire-deps
// ============================================================================

export interface WireDepsResult {
  noWorktree: boolean;
  wired: string[];
  warnings: string[];
}

export async function runWorktreeWireDeps(epicId: string): Promise<WireDepsResult> {
  validateEpicId(epicId);

  const raw = execFileSync('bd', ['show', epicId, '--json'], { encoding: 'utf-8' });
  const deps = parseDepsJson(raw);

  const mergeDep = deps.find(d => d.title.startsWith('Merge:'));
  if (!mergeDep) {
    return { noWorktree: true, wired: [], warnings: [] };
  }
  const mergeId = shortId(mergeDep.id);

  const wired: string[] = [];
  const warnings: string[] = [];

  const reviewDep = deps.find(d => d.title.startsWith('Review:'));
  const compoundDep = deps.find(d => d.title.startsWith('Compound:'));

  if (reviewDep) {
    const reviewId = shortId(reviewDep.id);
    execFileSync('bd', ['dep', 'add', mergeId, reviewId], { encoding: 'utf-8' });
    wired.push(reviewId);
  } else {
    warnings.push('No Review task found — it may not exist yet');
  }

  if (compoundDep) {
    const compoundId = shortId(compoundDep.id);
    execFileSync('bd', ['dep', 'add', mergeId, compoundId], { encoding: 'utf-8' });
    wired.push(compoundId);
  } else {
    warnings.push('No Compound task found — it may not exist yet');
  }

  return { noWorktree: false, wired, warnings };
}

// ============================================================================
// worktree merge
// ============================================================================

export interface WorktreeMergeResult {
  mainRepo: string;
  newLessons: number;
}

export async function runWorktreeMerge(epicId: string): Promise<WorktreeMergeResult> {
  validateEpicId(epicId);

  const branch = `epic/${epicId}`;

  // Discover main repo
  const gitCommonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf-8' }).trim();
  const mainRepo = path.resolve(gitCommonDir, '..');

  // Discover worktree path
  const listRaw = execFileSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf-8' });
  const entries = parseWorktreeList(listRaw);
  const wtEntry = entries.find(e => e.branch === branch);
  const worktreePath = wtEntry?.path ?? '';

  // Phase 1: Sync (in worktree)
  try {
    execFileSync('git', ['merge', 'main'], { cwd: worktreePath, encoding: 'utf-8' });
  } catch (err) {
    throw new Error(`Merge conflict in worktree: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Run tests
  execFileSync('pnpm', ['test'], { cwd: worktreePath, encoding: 'utf-8' });

  // Commit merge (no-op if fast-forward)
  try {
    execFileSync('git', ['commit', '--no-edit'], { cwd: worktreePath, encoding: 'utf-8' });
  } catch {
    // Already committed or fast-forward — ignore
  }

  // Phase 2: Land (on main)
  execFileSync('git', ['-C', mainRepo, 'merge', branch, '--no-edit'], { encoding: 'utf-8' });

  // Merge JSONL
  const mainJsonlPath = path.join(mainRepo, '.claude', 'lessons', 'index.jsonl');
  const wtJsonlPath = path.join(worktreePath, '.claude', 'lessons', 'index.jsonl');
  let newLessons = 0;

  if (existsSync(wtJsonlPath)) {
    const mainLines = existsSync(mainJsonlPath)
      ? readFileSync(mainJsonlPath, 'utf-8').split('\n').filter(Boolean)
      : [];
    const wtLines = readFileSync(wtJsonlPath, 'utf-8').split('\n').filter(Boolean);

    const mainIds = new Set<string>();
    for (const line of mainLines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.id) mainIds.add(parsed.id);
      } catch { /* skip malformed */ }
    }

    const newLines: string[] = [];
    for (const line of wtLines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.id && !mainIds.has(parsed.id)) {
          newLines.push(line);
        }
      } catch { /* skip malformed */ }
    }

    if (newLines.length > 0) {
      const existing = mainLines.join('\n');
      const appended = existing ? `${existing}\n${newLines.join('\n')}\n` : `${newLines.join('\n')}\n`;
      writeFileSync(mainJsonlPath, appended, 'utf-8');
      newLessons = newLines.length;
    }
  }

  // Clean up worktree and branch
  execFileSync('git', ['worktree', 'remove', worktreePath], { encoding: 'utf-8' });
  execFileSync('git', ['branch', '-d', branch], { encoding: 'utf-8' });

  return { mainRepo, newLessons };
}

// ============================================================================
// worktree list
// ============================================================================

export interface WorktreeEntry {
  epicId: string;
  path: string;
  branch: string;
  status: string;
}

export async function runWorktreeList(): Promise<WorktreeEntry[]> {
  const listRaw = execFileSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf-8' });
  const entries = parseWorktreeList(listRaw);

  const results: WorktreeEntry[] = [];
  for (const entry of entries) {
    if (!entry.path.includes('-wt-')) continue;

    const epicIdMatch = entry.path.match(/-wt-(.+)$/);
    if (!epicIdMatch?.[1]) continue;
    const epicId: string = epicIdMatch[1];

    let status = 'unknown';
    try {
      const raw = execFileSync('bd', ['show', epicId, '--json'], { encoding: 'utf-8' });
      const data = JSON.parse(raw);
      const issue = Array.isArray(data) ? data[0] : data;
      status = issue?.status ?? 'unknown';
    } catch {
      // bd show failed — status stays unknown
    }

    results.push({ epicId, path: entry.path, branch: entry.branch, status });
  }

  return results;
}

// ============================================================================
// worktree cleanup
// ============================================================================

export interface WorktreeCleanupResult {
  removed: boolean;
  mergeTaskClosed: boolean;
}

export async function runWorktreeCleanup(
  epicId: string,
  options: { force?: boolean } = {},
): Promise<WorktreeCleanupResult> {
  validateEpicId(epicId);

  const listRaw = execFileSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf-8' });
  const entries = parseWorktreeList(listRaw);
  const branch = `epic/${epicId}`;
  const wtEntry = entries.find(e => e.branch === branch || e.path.endsWith(`-wt-${epicId}`));

  if (!wtEntry) {
    throw new Error(`Worktree not found for epic "${epicId}"`);
  }

  // Check for dirty state
  if (!options.force) {
    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd: wtEntry.path,
      encoding: 'utf-8',
    });
    if (status.trim()) {
      throw new Error(`Worktree has uncommitted changes. Use --force to override.`);
    }
  }

  // Remove worktree
  const removeArgs = options.force
    ? ['worktree', 'remove', wtEntry.path, '--force']
    : ['worktree', 'remove', wtEntry.path];
  execFileSync('git', removeArgs, { encoding: 'utf-8' });

  // Delete branch
  execFileSync('git', ['branch', '-D', branch], { encoding: 'utf-8' });

  // Find and close Merge task
  let mergeTaskClosed = false;
  try {
    const raw = execFileSync('bd', ['show', epicId, '--json'], { encoding: 'utf-8' });
    const deps = parseDepsJson(raw);
    const mergeDep = deps.find(d => d.title.startsWith('Merge:'));
    if (mergeDep) {
      const mergeId = shortId(mergeDep.id);
      execFileSync('bd', ['close', mergeId], { encoding: 'utf-8' });
      mergeTaskClosed = true;
    }
  } catch {
    // bd operations may fail if epic not found — that's fine
  }

  return { removed: true, mergeTaskClosed };
}

// ============================================================================
// Command Registration
// ============================================================================

function handleError(err: unknown): void {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}

function addCreateCommand(wt: Command): void {
  wt.command('create <epic-id>')
    .description('Create a new worktree for an epic')
    .action(async (epicId: string) => {
      try {
        const result = await runWorktreeCreate(epicId);
        if (result.alreadyExists) {
          console.log(`Worktree already exists at ${result.worktreePath}`);
          return;
        }
        console.log(`Worktree created:`);
        console.log(`  Path:       ${result.worktreePath}`);
        console.log(`  Branch:     ${result.branch}`);
        console.log(`  Merge task: ${result.mergeTaskId}`);
      } catch (err) { handleError(err); }
    });
}

function addWireDepsCommand(wt: Command): void {
  wt.command('wire-deps <epic-id>')
    .description('Wire Review/Compound tasks as merge dependencies')
    .action(async (epicId: string) => {
      try {
        const result = await runWorktreeWireDeps(epicId);
        if (result.noWorktree) {
          console.log('No worktree detected, working on main branch');
          return;
        }
        if (result.wired.length > 0) {
          console.log(`Wired dependencies: ${result.wired.join(', ')}`);
        }
        for (const w of result.warnings) {
          console.log(`Warning: ${w}`);
        }
      } catch (err) { handleError(err); }
    });
}

function addMergeCommand(wt: Command): void {
  wt.command('merge <epic-id>')
    .description('Merge worktree branch back to main')
    .action(async (epicId: string) => {
      try {
        const result = await runWorktreeMerge(epicId);
        console.log(`Merged epic/${epicId} to main`);
        console.log(`  New lessons: ${result.newLessons}`);
      } catch (err) { handleError(err); }
    });
}

function addListCommand(wt: Command): void {
  wt.command('list')
    .description('List active worktrees')
    .action(async () => {
      try {
        const entries = await runWorktreeList();
        if (entries.length === 0) {
          console.log('No active worktrees.');
          return;
        }
        console.log('Epic ID     | Path                          | Branch          | Status');
        console.log('------------|-------------------------------|-----------------|-------');
        for (const e of entries) {
          console.log(`${e.epicId.padEnd(12)}| ${e.path.padEnd(30)}| ${e.branch.padEnd(16)}| ${e.status}`);
        }
      } catch (err) { handleError(err); }
    });
}

function addCleanupCommand(wt: Command): void {
  wt.command('cleanup <epic-id>')
    .description('Remove a worktree and clean up associated resources')
    .option('--force', 'Force removal even with uncommitted changes')
    .action(async (epicId: string, opts: { force?: boolean }) => {
      try {
        const result = await runWorktreeCleanup(epicId, { force: opts.force });
        console.log(`Worktree removed for epic/${epicId}`);
        if (result.mergeTaskClosed) {
          console.log('Merge task closed.');
        }
      } catch (err) { handleError(err); }
    });
}

export function registerWorktreeCommands(program: Command): void {
  const wt = program
    .command('worktree')
    .description('Manage git worktrees for parallel epic execution');

  addCreateCommand(wt);
  addWireDepsCommand(wt);
  addMergeCommand(wt);
  addListCommand(wt);
  addCleanupCommand(wt);
}
