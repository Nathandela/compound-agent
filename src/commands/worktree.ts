/**
 * Worktree commands — manage git worktrees for parallel epic execution.
 *
 * Subcommands: create, wire-deps, merge, list, cleanup
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';

import { getRepoRoot, parseBdShowDeps, shortId, validateEpicId } from '../cli-utils.js';

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

// ============================================================================
// worktree create
// ============================================================================

export interface WorktreeCreateResult {
  worktreePath: string;
  branch: string;
  mergeTaskId: string;
  alreadyExists: boolean;
}

export function runWorktreeCreate(epicId: string): WorktreeCreateResult {
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

  // Run setup (pnpm exec guarantees the local installed binary)
  execFileSync('pnpm', ['exec', 'ca', 'setup', '--skip-model'], { cwd: worktreePath, encoding: 'utf-8' });

  // Create Merge task (--silent outputs only the ID, BEADS_NO_DAEMON prevents daemon interference)
  const mergeTitle = `Merge: merge ${branch} to main`;
  const mergeDesc = `INSTRUCTIONS: This task merges the worktree branch back to main. Worktree path: ${worktreePath}. Run \`pnpm exec ca worktree merge ${epicId}\` when all other blocking tasks are resolved.`;
  const bdOutput = execFileSync('bd', [
    'create',
    '--silent',
    `--title=${mergeTitle}`,
    '--type=task',
    '--priority=1',
    `--description=${mergeDesc}`,
  ], {
    encoding: 'utf-8',
    env: { ...process.env, BEADS_NO_DAEMON: '1' },
  });

  const mergeFullId = bdOutput.trim();
  if (!mergeFullId) {
    throw new Error('bd create returned no task ID');
  }
  const mergeTaskId = shortId(mergeFullId);

  // Wire dep: epic depends on merge
  execFileSync('bd', ['dep', 'add', epicId, mergeTaskId], { encoding: 'utf-8' });

  return { worktreePath, branch, mergeTaskId, alreadyExists: false };
}

// ============================================================================
// worktree wire-deps
// ============================================================================

export interface WireDepsResult {
  noMergeTask: boolean;
  wired: string[];
  warnings: string[];
}

export function runWorktreeWireDeps(epicId: string): WireDepsResult {
  validateEpicId(epicId);

  const raw = execFileSync('bd', ['show', epicId, '--json'], { encoding: 'utf-8' });
  const deps = parseBdShowDeps(raw);

  const mergeDep = deps.find(d => d.title.startsWith('Merge:'));
  if (!mergeDep) {
    return { noMergeTask: true, wired: [], warnings: [] };
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

  return { noMergeTask: false, wired, warnings };
}

// ============================================================================
// worktree merge
// ============================================================================

export interface WorktreeMergeResult {
  mainRepo: string;
  newLessons: number;
}

export function runWorktreeMerge(epicId: string): WorktreeMergeResult {
  validateEpicId(epicId);

  const branch = `epic/${epicId}`;

  // Discover main repo
  const gitCommonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf-8' }).trim();
  const mainRepo = path.resolve(gitCommonDir, '..');

  // Verify main repo is on the main branch
  const currentBranch = execFileSync(
    'git', ['-C', mainRepo, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf-8' },
  ).trim();
  if (currentBranch !== 'main') {
    throw new Error(`Main repo is on branch "${currentBranch}", expected "main". Checkout main before merging.`);
  }

  // Discover worktree path
  const listRaw = execFileSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf-8' });
  const entries = parseWorktreeList(listRaw);
  const wtEntry = entries.find(e => e.branch === branch);
  if (!wtEntry) {
    throw new Error(`Worktree not found for branch "${branch}". Run \`ca worktree list\` to see active worktrees.`);
  }
  const worktreePath = wtEntry.path;

  // Phase 1: Sync (merge main into worktree)
  try {
    execFileSync('git', ['merge', 'main'], { cwd: worktreePath, encoding: 'utf-8' });
  } catch (err) {
    throw new Error(
      `Merge conflict in worktree at ${worktreePath}. ` +
      `Resolve conflicts there and run \`ca worktree merge ${epicId}\` again. ` +
      `Detail: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Phase 2: Run tests in worktree
  try {
    execFileSync('pnpm', ['test'], { cwd: worktreePath, encoding: 'utf-8' });
  } catch (err) {
    throw new Error(
      `Tests failed in worktree at ${worktreePath}. ` +
      `Fix failures before merging. ` +
      `Detail: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Phase 3: Land (merge worktree branch into main)
  execFileSync('git', ['-C', mainRepo, 'merge', branch, '--no-edit'], { encoding: 'utf-8' });

  // Phase 4: Reconcile JSONL (handle uncommitted worktree changes not captured by git merge).
  // Uses line-based dedup: appends any worktree lines not already in main.
  // This preserves last-write-wins semantics for same-ID updates/deletes.
  const mainJsonlPath = path.join(mainRepo, '.claude', 'lessons', 'index.jsonl');
  const wtJsonlPath = path.join(worktreePath, '.claude', 'lessons', 'index.jsonl');
  let newLessons = 0;

  if (existsSync(wtJsonlPath)) {
    const mainContent = existsSync(mainJsonlPath)
      ? readFileSync(mainJsonlPath, 'utf-8')
      : '';
    const mainLineSet = new Set(mainContent.split('\n').filter(Boolean));
    const wtLines = readFileSync(wtJsonlPath, 'utf-8').split('\n').filter(Boolean);

    const newLines = wtLines.filter(line => !mainLineSet.has(line));
    if (newLines.length > 0) {
      const base = mainContent.trimEnd();
      const appended = base ? `${base}\n${newLines.join('\n')}\n` : `${newLines.join('\n')}\n`;
      writeFileSync(mainJsonlPath, appended, 'utf-8');
      newLessons = newLines.length;
    }
  }

  // Phase 5: Clean up worktree and branch
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

export function runWorktreeList(): WorktreeEntry[] {
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

export function runWorktreeCleanup(
  epicId: string,
  options: { force?: boolean } = {},
): WorktreeCleanupResult {
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

  // Delete branch: -d (safe) by default, -D (force) only with --force
  const branchFlag = options.force ? '-D' : '-d';
  execFileSync('git', ['branch', branchFlag, branch], { encoding: 'utf-8' });

  // Find and close Merge task
  let mergeTaskClosed = false;
  try {
    const raw = execFileSync('bd', ['show', epicId, '--json'], { encoding: 'utf-8' });
    const deps = parseBdShowDeps(raw);
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
    .action((epicId: string) => {
      try {
        const result = runWorktreeCreate(epicId);
        if (result.alreadyExists) {
          console.log(`Worktree already exists at ${result.worktreePath}`);
          console.log(`  To use: cd ${result.worktreePath} && claude`);
          return;
        }
        console.log(`Worktree created:`);
        console.log(`  Path:       ${result.worktreePath}`);
        console.log(`  Branch:     ${result.branch}`);
        console.log(`  Merge task: ${result.mergeTaskId}`);
        console.log('');
        console.log('Next step: open a NEW Claude session with the worktree as primary directory:');
        console.log(`  cd ${result.worktreePath} && claude`);
      } catch (err) { handleError(err); }
    });
}

function addWireDepsCommand(wt: Command): void {
  wt.command('wire-deps <epic-id>')
    .description('Wire Review/Compound tasks as merge dependencies')
    .action((epicId: string) => {
      try {
        const result = runWorktreeWireDeps(epicId);
        if (result.noMergeTask) {
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
    .action((epicId: string) => {
      try {
        const result = runWorktreeMerge(epicId);
        console.log(`Merged epic/${epicId} to main`);
        console.log(`  New lessons: ${result.newLessons}`);
      } catch (err) { handleError(err); }
    });
}

function addListCommand(wt: Command): void {
  wt.command('list')
    .description('List active worktrees')
    .action(() => {
      try {
        const entries = runWorktreeList();
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
    .action((epicId: string, opts: { force?: boolean }) => {
      try {
        const result = runWorktreeCleanup(epicId, { force: opts.force });
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
