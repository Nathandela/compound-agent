/**
 * Tests for worktree commands — manage git worktrees for parallel epic execution.
 *
 * Follows TDD: Tests written BEFORE implementation.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock execFileSync and fs before importing module under test
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  copyFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock('../cli-utils.js', () => ({
  getRepoRoot: vi.fn(() => '/fake/repo'),
}));

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, copyFileSync, mkdirSync, statSync } from 'node:fs';
import { getRepoRoot } from '../cli-utils.js';
import {
  runWorktreeCreate,
  runWorktreeWireDeps,
  runWorktreeMerge,
  runWorktreeList,
  runWorktreeCleanup,
} from './worktree.js';

const mockExecFileSync = vi.mocked(execFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockCopyFileSync = vi.mocked(copyFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockStatSync = vi.mocked(statSync);
const mockGetRepoRoot = vi.mocked(getRepoRoot);

// Helper: bd show --json output for an epic with deps
function bdShowJson(deps: Array<{ title: string; status: string; id: string }>): string {
  return JSON.stringify([{
    id: 'learning_agent-epic1',
    title: 'EPIC: Test',
    status: 'open',
    depends_on: deps.map(d => ({
      id: `learning_agent-${d.id}`,
      title: d.title,
      status: d.status,
    })),
  }]);
}

// Helper: git worktree list --porcelain output
function worktreeListPorcelain(entries: Array<{ path: string; branch: string }>): string {
  return entries.map(e =>
    `worktree ${e.path}\nHEAD abc123\nbranch refs/heads/${e.branch}\n`
  ).join('\n');
}

describe('worktree create', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetRepoRoot.mockReturnValue('/fake/repo');
    // Default: .git is a directory (main repo)
    mockStatSync.mockReturnValue({ isDirectory: () => true } as any);
    // Default: no existing worktree
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.[0] === 'worktree' && args?.[1] === 'list') {
        return 'worktree /fake/repo\nHEAD abc123\nbranch refs/heads/main\n';
      }
      // bd create returns task ID
      if (cmd === 'bd' && args?.[0] === 'create') {
        return 'Created learning_agent-m001';
      }
      return '';
    });
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('');
  });

  it('rejects invalid epic IDs', async () => {
    await expect(runWorktreeCreate('test; rm -rf /')).rejects.toThrow(/invalid epic id/i);
    await expect(runWorktreeCreate('$(whoami)')).rejects.toThrow(/invalid epic id/i);
  });

  it('skips creation when worktree already exists', async () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.[0] === 'worktree' && args?.[1] === 'list') {
        return worktreeListPorcelain([
          { path: '/fake/repo', branch: 'main' },
          { path: '/fake/repo-wt-epic1', branch: 'epic/epic1' },
        ]);
      }
      return '';
    });

    const result = await runWorktreeCreate('epic1');
    expect(result.alreadyExists).toBe(true);
  });

  it('creates worktree with correct path and branch', async () => {
    const result = await runWorktreeCreate('epic1');

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['worktree', 'add', '/fake/repo-wt-epic1', '-b', 'epic/epic1'],
      expect.any(Object),
    );
    expect(result.worktreePath).toBe('/fake/repo-wt-epic1');
    expect(result.branch).toBe('epic/epic1');
  });

  it('runs pnpm install in worktree', async () => {
    await runWorktreeCreate('epic1');

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'pnpm',
      ['install', '--frozen-lockfile'],
      expect.objectContaining({ cwd: '/fake/repo-wt-epic1' }),
    );
  });

  it('copies lessons JSONL to worktree', async () => {
    await runWorktreeCreate('epic1');

    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('repo-wt-epic1'),
      expect.objectContaining({ recursive: true }),
    );
    expect(mockCopyFileSync).toHaveBeenCalled();
  });

  it('runs ca setup --skip-model in worktree', async () => {
    await runWorktreeCreate('epic1');

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'npx',
      ['ca', 'setup', '--skip-model'],
      expect.objectContaining({ cwd: '/fake/repo-wt-epic1' }),
    );
  });

  it('creates Merge task and wires dependency', async () => {
    await runWorktreeCreate('epic1');

    // Should create merge task
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bd',
      expect.arrayContaining(['create', '--title=Merge: merge epic/epic1 to main']),
      expect.any(Object),
    );

    // Should wire epic depends on merge
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bd',
      ['dep', 'add', 'epic1', 'm001'],
      expect.any(Object),
    );
  });

  it('returns summary with worktree path, branch, and merge task ID', async () => {
    const result = await runWorktreeCreate('epic1');

    expect(result.worktreePath).toBe('/fake/repo-wt-epic1');
    expect(result.branch).toBe('epic/epic1');
    expect(result.mergeTaskId).toBe('m001');
    expect(result.alreadyExists).toBe(false);
  });
});

describe('worktree wire-deps', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rejects invalid epic IDs', async () => {
    await expect(runWorktreeWireDeps('bad; id')).rejects.toThrow(/invalid epic id/i);
  });

  it('exits gracefully when no Merge task exists', async () => {
    mockExecFileSync.mockReturnValue(bdShowJson([
      { title: 'Review: check', status: 'open', id: 'r1' },
    ]));

    const result = await runWorktreeWireDeps('epic1');
    expect(result.noWorktree).toBe(true);
  });

  it('wires Review and Compound tasks as merge dependencies', async () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === 'bd' && args?.[0] === 'show') {
        return bdShowJson([
          { title: 'Merge: merge epic/epic1 to main', status: 'open', id: 'merge1' },
          { title: 'Review: check implementation', status: 'open', id: 'review1' },
          { title: 'Compound: capture learnings', status: 'open', id: 'compound1' },
        ]);
      }
      return '';
    });

    const result = await runWorktreeWireDeps('epic1');

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bd', ['dep', 'add', 'merge1', 'review1'], expect.any(Object),
    );
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bd', ['dep', 'add', 'merge1', 'compound1'], expect.any(Object),
    );
    expect(result.noWorktree).toBe(false);
    expect(result.wired).toEqual(['review1', 'compound1']);
  });

  it('warns but does not error when Review or Compound is missing', async () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === 'bd' && args?.[0] === 'show') {
        return bdShowJson([
          { title: 'Merge: merge epic/epic1 to main', status: 'open', id: 'merge1' },
        ]);
      }
      return '';
    });

    const result = await runWorktreeWireDeps('epic1');
    expect(result.noWorktree).toBe(false);
    expect(result.wired).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('worktree merge', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rejects invalid epic IDs', async () => {
    await expect(runWorktreeMerge('bad; id')).rejects.toThrow(/invalid epic id/i);
  });

  it('discovers main repo and worktree paths', async () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.[0] === 'rev-parse' && args?.[1] === '--git-common-dir') {
        return '/fake/repo/.git\n';
      }
      if (cmd === 'git' && args?.[0] === 'worktree' && args?.[1] === 'list') {
        return worktreeListPorcelain([
          { path: '/fake/repo', branch: 'main' },
          { path: '/fake/repo-wt-epic1', branch: 'epic/epic1' },
        ]);
      }
      if (cmd === 'git' && args?.[0] === 'merge') {
        return '';
      }
      if (cmd === 'pnpm' && args?.[0] === 'test') {
        return '';
      }
      return '';
    });
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('');

    const result = await runWorktreeMerge('epic1');
    expect(result.mainRepo).toBe('/fake/repo');
  });

  it('reports conflicts when merge fails', async () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.[0] === 'rev-parse') {
        return '/fake/repo/.git\n';
      }
      if (cmd === 'git' && args?.[0] === 'worktree' && args?.[1] === 'list') {
        return worktreeListPorcelain([
          { path: '/fake/repo', branch: 'main' },
          { path: '/fake/repo-wt-epic1', branch: 'epic/epic1' },
        ]);
      }
      if (cmd === 'git' && args?.[0] === 'merge' && args?.[1] === 'main') {
        throw new Error('CONFLICT (content): Merge conflict in file.ts');
      }
      return '';
    });

    await expect(runWorktreeMerge('epic1')).rejects.toThrow(/conflict/i);
  });

  it('merges JSONL by deduplicating on id field', async () => {
    const mainJsonl = '{"id":"lesson-1","text":"main lesson"}\n';
    const wtJsonl = '{"id":"lesson-1","text":"main lesson"}\n{"id":"lesson-2","text":"new lesson"}\n';

    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.[0] === 'rev-parse') {
        return '/fake/repo/.git\n';
      }
      if (cmd === 'git' && args?.[0] === 'worktree' && args?.[1] === 'list') {
        return worktreeListPorcelain([
          { path: '/fake/repo', branch: 'main' },
          { path: '/fake/repo-wt-epic1', branch: 'epic/epic1' },
        ]);
      }
      return '';
    });
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p: any) => {
      const path = String(p);
      if (path.includes('repo-wt-epic1')) return wtJsonl;
      return mainJsonl;
    });

    const result = await runWorktreeMerge('epic1');
    expect(result.newLessons).toBe(1);
  });

  it('removes worktree and deletes branch after successful merge', async () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.[0] === 'rev-parse') {
        return '/fake/repo/.git\n';
      }
      if (cmd === 'git' && args?.[0] === 'worktree' && args?.[1] === 'list') {
        return worktreeListPorcelain([
          { path: '/fake/repo', branch: 'main' },
          { path: '/fake/repo-wt-epic1', branch: 'epic/epic1' },
        ]);
      }
      return '';
    });
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('');

    await runWorktreeMerge('epic1');

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git', ['worktree', 'remove', '/fake/repo-wt-epic1'], expect.any(Object),
    );
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git', ['branch', '-d', 'epic/epic1'], expect.any(Object),
    );
  });
});

describe('worktree list', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetRepoRoot.mockReturnValue('/fake/repo');
  });

  it('returns empty list when no worktrees match convention', async () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.[0] === 'worktree') {
        return worktreeListPorcelain([
          { path: '/fake/repo', branch: 'main' },
        ]);
      }
      return '';
    });

    const result = await runWorktreeList();
    expect(result).toEqual([]);
  });

  it('returns worktree entries matching -wt- convention', async () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.[0] === 'worktree') {
        return worktreeListPorcelain([
          { path: '/fake/repo', branch: 'main' },
          { path: '/fake/repo-wt-epic1', branch: 'epic/epic1' },
        ]);
      }
      if (cmd === 'bd' && args?.[0] === 'show') {
        return JSON.stringify([{ id: 'learning_agent-epic1', status: 'open' }]);
      }
      return '';
    });

    const result = await runWorktreeList();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      epicId: 'epic1',
      path: '/fake/repo-wt-epic1',
      branch: 'epic/epic1',
    });
  });
});

describe('worktree cleanup', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetRepoRoot.mockReturnValue('/fake/repo');
  });

  it('rejects invalid epic IDs', async () => {
    await expect(runWorktreeCleanup('bad; id')).rejects.toThrow(/invalid epic id/i);
  });

  it('throws when worktree not found', async () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.[0] === 'worktree') {
        return worktreeListPorcelain([
          { path: '/fake/repo', branch: 'main' },
        ]);
      }
      return '';
    });

    await expect(runWorktreeCleanup('nonexistent')).rejects.toThrow(/not found/i);
  });

  it('requires --force for dirty worktrees', async () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.[0] === 'worktree' && args?.[1] === 'list') {
        return worktreeListPorcelain([
          { path: '/fake/repo', branch: 'main' },
          { path: '/fake/repo-wt-epic1', branch: 'epic/epic1' },
        ]);
      }
      // git status shows uncommitted changes
      if (cmd === 'git' && args?.[0] === 'status' && args?.[1] === '--porcelain') {
        return ' M dirty-file.ts\n';
      }
      return '';
    });

    await expect(runWorktreeCleanup('epic1')).rejects.toThrow(/uncommitted/i);
  });

  it('proceeds with --force even if dirty', async () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.[0] === 'worktree' && args?.[1] === 'list') {
        return worktreeListPorcelain([
          { path: '/fake/repo', branch: 'main' },
          { path: '/fake/repo-wt-epic1', branch: 'epic/epic1' },
        ]);
      }
      if (cmd === 'git' && args?.[0] === 'status') {
        return ' M dirty-file.ts\n';
      }
      if (cmd === 'bd' && args?.[0] === 'show') {
        return bdShowJson([
          { title: 'Merge: merge epic/epic1 to main', status: 'open', id: 'merge1' },
        ]);
      }
      return '';
    });

    const result = await runWorktreeCleanup('epic1', { force: true });
    expect(result.removed).toBe(true);
  });

  it('removes worktree, deletes branch, and closes Merge task', async () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.[0] === 'worktree' && args?.[1] === 'list') {
        return worktreeListPorcelain([
          { path: '/fake/repo', branch: 'main' },
          { path: '/fake/repo-wt-epic1', branch: 'epic/epic1' },
        ]);
      }
      if (cmd === 'git' && args?.[0] === 'status') {
        return '';
      }
      if (cmd === 'bd' && args?.[0] === 'show') {
        return bdShowJson([
          { title: 'Merge: merge epic/epic1 to main', status: 'open', id: 'merge1' },
        ]);
      }
      return '';
    });

    const result = await runWorktreeCleanup('epic1');

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git', ['worktree', 'remove', '/fake/repo-wt-epic1'], expect.any(Object),
    );
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git', ['branch', '-D', 'epic/epic1'], expect.any(Object),
    );
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bd', ['close', 'merge1'], expect.any(Object),
    );
    expect(result.removed).toBe(true);
    expect(result.mergeTaskClosed).toBe(true);
  });
});
