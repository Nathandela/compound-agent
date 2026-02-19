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
}));

vi.mock('../cli-utils.js', () => ({
  getRepoRoot: vi.fn(() => '/fake/repo'),
  parseBdShowDeps: vi.fn((raw: string) => {
    const data = JSON.parse(raw);
    const issue = Array.isArray(data) ? data[0] : data;
    return (issue?.depends_on ?? []).map((d: any) => ({
      id: d.id,
      title: d.title,
      status: d.status,
    }));
  }),
  shortId: vi.fn((fullId: string) => fullId.replace(/^[^-]+-/, '')),
  validateEpicId: vi.fn((id: string) => {
    if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
      throw new Error(`Invalid epic ID: "${id}"`);
    }
  }),
}));

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
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
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockCopyFileSync = vi.mocked(copyFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);
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
    vi.clearAllMocks();
    mockGetRepoRoot.mockReturnValue('/fake/repo');
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

  it('rejects invalid epic IDs', () => {
    expect(() => runWorktreeCreate('test; rm -rf /')).toThrow(/invalid epic id/i);
    expect(() => runWorktreeCreate('$(whoami)')).toThrow(/invalid epic id/i);
  });

  it('skips creation when worktree already exists', () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.[0] === 'worktree' && args?.[1] === 'list') {
        return worktreeListPorcelain([
          { path: '/fake/repo', branch: 'main' },
          { path: '/fake/repo-wt-epic1', branch: 'epic/epic1' },
        ]);
      }
      return '';
    });

    const result = runWorktreeCreate('epic1');
    expect(result.alreadyExists).toBe(true);
  });

  it('creates worktree with correct path and branch', () => {
    const result = runWorktreeCreate('epic1');

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['worktree', 'add', '/fake/repo-wt-epic1', '-b', 'epic/epic1'],
      expect.any(Object),
    );
    expect(result.worktreePath).toBe('/fake/repo-wt-epic1');
    expect(result.branch).toBe('epic/epic1');
  });

  it('runs pnpm install in worktree', () => {
    runWorktreeCreate('epic1');

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'pnpm',
      ['install', '--frozen-lockfile'],
      expect.objectContaining({ cwd: '/fake/repo-wt-epic1' }),
    );
  });

  it('copies lessons JSONL to worktree', () => {
    runWorktreeCreate('epic1');

    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('repo-wt-epic1'),
      expect.objectContaining({ recursive: true }),
    );
    expect(mockCopyFileSync).toHaveBeenCalled();
  });

  it('runs ca setup --skip-model in worktree', () => {
    runWorktreeCreate('epic1');

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'pnpm',
      ['exec', 'ca', 'setup', '--skip-model'],
      expect.objectContaining({ cwd: '/fake/repo-wt-epic1' }),
    );
  });

  it('creates Merge task and wires dependency', () => {
    runWorktreeCreate('epic1');

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

  it('returns summary with worktree path, branch, and merge task ID', () => {
    const result = runWorktreeCreate('epic1');

    expect(result.worktreePath).toBe('/fake/repo-wt-epic1');
    expect(result.branch).toBe('epic/epic1');
    expect(result.mergeTaskId).toBe('m001');
    expect(result.alreadyExists).toBe(false);
  });

  it('throws when bd create returns empty ID', () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.[0] === 'worktree' && args?.[1] === 'list') {
        return 'worktree /fake/repo\nHEAD abc123\nbranch refs/heads/main\n';
      }
      if (cmd === 'bd' && args?.[0] === 'create') {
        return '';
      }
      return '';
    });
    mockExistsSync.mockReturnValue(true);

    expect(() => runWorktreeCreate('epic1')).toThrow(/no task id/i);
  });
});

describe('worktree wire-deps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid epic IDs', () => {
    expect(() => runWorktreeWireDeps('bad; id')).toThrow(/invalid epic id/i);
  });

  it('exits gracefully when no Merge task exists', () => {
    mockExecFileSync.mockReturnValue(bdShowJson([
      { title: 'Review: check', status: 'open', id: 'r1' },
    ]));

    const result = runWorktreeWireDeps('epic1');
    expect(result.noMergeTask).toBe(true);
  });

  it('wires Review and Compound tasks as merge dependencies', () => {
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

    const result = runWorktreeWireDeps('epic1');

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bd', ['dep', 'add', 'merge1', 'review1'], expect.any(Object),
    );
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bd', ['dep', 'add', 'merge1', 'compound1'], expect.any(Object),
    );
    expect(result.noMergeTask).toBe(false);
    expect(result.wired).toEqual(['review1', 'compound1']);
  });

  it('warns but does not error when Review or Compound is missing', () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === 'bd' && args?.[0] === 'show') {
        return bdShowJson([
          { title: 'Merge: merge epic/epic1 to main', status: 'open', id: 'merge1' },
        ]);
      }
      return '';
    });

    const result = runWorktreeWireDeps('epic1');
    expect(result.noMergeTask).toBe(false);
    expect(result.wired).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('worktree merge', () => {
  /** Standard mock for merge tests: routes git and pnpm calls. */
  function setupMergeMocks(overrides?: {
    currentBranch?: string;
    worktreeEntries?: Array<{ path: string; branch: string }>;
    mergeThrows?: Error;
    testThrows?: Error;
  }) {
    const entries = overrides?.worktreeEntries ?? [
      { path: '/fake/repo', branch: 'main' },
      { path: '/fake/repo-wt-epic1', branch: 'epic/epic1' },
    ];
    const currentBranch = overrides?.currentBranch ?? 'main';

    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.[0] === 'rev-parse' && args?.[1] === '--git-common-dir') {
        return '/fake/repo/.git\n';
      }
      if (cmd === 'git' && args?.[0] === '-C' && args?.[2] === 'rev-parse' && args?.[3] === '--abbrev-ref') {
        return `${currentBranch}\n`;
      }
      if (cmd === 'git' && args?.[0] === 'worktree' && args?.[1] === 'list') {
        return worktreeListPorcelain(entries);
      }
      if (cmd === 'git' && args?.[0] === 'merge' && args?.[1] === 'main') {
        if (overrides?.mergeThrows) throw overrides.mergeThrows;
        return '';
      }
      if (cmd === 'pnpm' && args?.[0] === 'test') {
        if (overrides?.testThrows) throw overrides.testThrows;
        return '';
      }
      return '';
    });
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('');
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid epic IDs', () => {
    expect(() => runWorktreeMerge('bad; id')).toThrow(/invalid epic id/i);
  });

  it('discovers main repo and worktree paths', () => {
    setupMergeMocks();

    const result = runWorktreeMerge('epic1');
    expect(result.mainRepo).toBe('/fake/repo');
  });

  it('throws when worktree not found', () => {
    setupMergeMocks({
      worktreeEntries: [{ path: '/fake/repo', branch: 'main' }],
    });

    expect(() => runWorktreeMerge('nonexistent')).toThrow(/worktree not found/i);
  });

  it('throws when main repo not on main branch', () => {
    setupMergeMocks({ currentBranch: 'feature-branch' });

    expect(() => runWorktreeMerge('epic1')).toThrow(/expected "main"/i);
  });

  it('reports conflicts when merge fails', () => {
    setupMergeMocks({
      mergeThrows: new Error('CONFLICT (content): Merge conflict in file.ts'),
    });

    expect(() => runWorktreeMerge('epic1')).toThrow(/conflict/i);
  });

  it('throws when tests fail with worktree path in message', () => {
    setupMergeMocks({
      testThrows: new Error('Test suite failed'),
    });

    expect(() => runWorktreeMerge('epic1')).toThrow(/repo-wt-epic1/);
  });

  it('merges JSONL by line-based dedup', () => {
    const mainJsonl = '{"id":"lesson-1","text":"main lesson"}\n';
    const wtJsonl = '{"id":"lesson-1","text":"main lesson"}\n{"id":"lesson-2","text":"new lesson"}\n';

    setupMergeMocks();
    mockReadFileSync.mockImplementation((p: any) => {
      const filePath = String(p);
      if (filePath.includes('repo-wt-epic1')) return wtJsonl;
      return mainJsonl;
    });

    const result = runWorktreeMerge('epic1');
    expect(result.newLessons).toBe(1);
  });

  it('JSONL line-based dedup preserves same-ID updates', () => {
    // Same ID but different content -- line-based dedup sees them as different lines
    const mainJsonl = '{"id":"1","text":"old"}\n';
    const wtJsonl = '{"id":"1","text":"new"}\n';

    setupMergeMocks();
    mockReadFileSync.mockImplementation((p: any) => {
      const filePath = String(p);
      if (filePath.includes('repo-wt-epic1')) return wtJsonl;
      return mainJsonl;
    });

    runWorktreeMerge('epic1');

    // The worktree line is NOT in main (different text), so it should be appended
    expect(mockWriteFileSync).toHaveBeenCalled();
    const writtenContent = String(mockWriteFileSync.mock.calls[0][1]);
    expect(writtenContent).toContain('{"id":"1","text":"old"}');
    expect(writtenContent).toContain('{"id":"1","text":"new"}');
  });

  it('removes worktree and deletes branch after successful merge', () => {
    setupMergeMocks();

    runWorktreeMerge('epic1');

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
    vi.clearAllMocks();
    mockGetRepoRoot.mockReturnValue('/fake/repo');
  });

  it('returns empty list when no worktrees match convention', () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.[0] === 'worktree') {
        return worktreeListPorcelain([
          { path: '/fake/repo', branch: 'main' },
        ]);
      }
      return '';
    });

    const result = runWorktreeList();
    expect(result).toEqual([]);
  });

  it('returns worktree entries matching -wt- convention', () => {
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

    const result = runWorktreeList();
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
    vi.clearAllMocks();
    mockGetRepoRoot.mockReturnValue('/fake/repo');
  });

  it('rejects invalid epic IDs', () => {
    expect(() => runWorktreeCleanup('bad; id')).toThrow(/invalid epic id/i);
  });

  it('throws when worktree not found', () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.[0] === 'worktree') {
        return worktreeListPorcelain([
          { path: '/fake/repo', branch: 'main' },
        ]);
      }
      return '';
    });

    expect(() => runWorktreeCleanup('nonexistent')).toThrow(/not found/i);
  });

  it('requires --force for dirty worktrees', () => {
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

    expect(() => runWorktreeCleanup('epic1')).toThrow(/uncommitted/i);
  });

  it('proceeds with --force even if dirty', () => {
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

    const result = runWorktreeCleanup('epic1', { force: true });
    expect(result.removed).toBe(true);
  });

  it('uses -d by default for branch delete', () => {
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

    runWorktreeCleanup('epic1');

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git', ['branch', '-d', 'epic/epic1'], expect.any(Object),
    );
  });

  it('uses -D with --force for branch delete', () => {
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

    runWorktreeCleanup('epic1', { force: true });

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git', ['branch', '-D', 'epic/epic1'], expect.any(Object),
    );
  });

  it('removes worktree, deletes branch, and closes Merge task', () => {
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

    const result = runWorktreeCleanup('epic1');

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git', ['worktree', 'remove', '/fake/repo-wt-epic1'], expect.any(Object),
    );
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git', ['branch', '-d', 'epic/epic1'], expect.any(Object),
    );
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bd', ['close', 'merge1'], expect.any(Object),
    );
    expect(result.removed).toBe(true);
    expect(result.mergeTaskClosed).toBe(true);
  });
});
