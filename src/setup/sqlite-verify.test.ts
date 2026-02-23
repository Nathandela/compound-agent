/**
 * Tests for SQLite verification + auto-rebuild during setup.
 *
 * Follows TDD: Tests written BEFORE implementation.
 * Pattern follows beads-check.test.ts: mock child_process at module level.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as childProcess from 'node:child_process';

import { ensureSqliteAvailable, resetSqliteAvailability } from '../memory/storage/sqlite/availability.js';
import { verifySqlite, type SqliteVerifyResult, type PnpmConfigResult } from './primitives.js';

// Mock child_process to control rebuild behavior
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual('node:child_process');
  return { ...actual, execFileSync: vi.fn() };
});

// Mock availability module to control sqlite load behavior
vi.mock('../memory/storage/sqlite/availability.js', () => ({
  ensureSqliteAvailable: vi.fn(),
  resetSqliteAvailability: vi.fn(),
}));

const mockedExecFileSync = vi.mocked(childProcess.execFileSync);
const mockedEnsureSqlite = vi.mocked(ensureSqliteAvailable);
const mockedResetSqlite = vi.mocked(resetSqliteAvailability);

/** Helper: create a PnpmConfigResult. */
function pnpmConfig(overrides: Partial<PnpmConfigResult> = {}): PnpmConfigResult {
  return { isPnpm: true, alreadyConfigured: true, added: [], ...overrides };
}

describe('verifySqlite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // Fast path: already works
  // ============================================================================

  it('returns already_ok when sqlite loads on first try', () => {
    mockedEnsureSqlite.mockImplementation(() => {}); // succeeds

    const result = verifySqlite('/repo', pnpmConfig());

    expect(result).toEqual({ available: true, action: 'already_ok' });
  });

  it('does not call execFileSync when sqlite already works', () => {
    mockedEnsureSqlite.mockImplementation(() => {}); // succeeds

    verifySqlite('/repo', pnpmConfig());

    expect(mockedExecFileSync).not.toHaveBeenCalled();
  });

  it('does not call resetSqliteAvailability when sqlite already works', () => {
    mockedEnsureSqlite.mockImplementation(() => {}); // succeeds

    verifySqlite('/repo', pnpmConfig());

    expect(mockedResetSqlite).not.toHaveBeenCalled();
  });

  // ============================================================================
  // Non-pnpm project: no auto-fix
  // ============================================================================

  it('returns failed for non-pnpm project when sqlite is broken', () => {
    mockedEnsureSqlite.mockImplementation(() => { throw new Error('not found'); });

    const result = verifySqlite('/repo', pnpmConfig({ isPnpm: false }));

    expect(result.available).toBe(false);
    expect(result.action).toBe('failed');
  });

  it('does not attempt rebuild for non-pnpm project', () => {
    mockedEnsureSqlite.mockImplementation(() => { throw new Error('not found'); });

    verifySqlite('/repo', pnpmConfig({ isPnpm: false }));

    expect(mockedExecFileSync).not.toHaveBeenCalled();
  });

  it('includes rebuild suggestion in error for non-pnpm project', () => {
    mockedEnsureSqlite.mockImplementation(() => { throw new Error('not found'); });

    const result = verifySqlite('/repo', pnpmConfig({ isPnpm: false }));

    expect(result.error).toBeDefined();
    expect(result.error).toContain('npm rebuild better-sqlite3');
  });

  // ============================================================================
  // pnpm project: rebuild fixes it
  // ============================================================================

  it('returns rebuilt when pnpm rebuild fixes sqlite', () => {
    let callCount = 0;
    mockedEnsureSqlite.mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new Error('not found');
      // second call succeeds (after rebuild)
    });

    const result = verifySqlite('/repo', pnpmConfig());

    expect(result).toEqual({ available: true, action: 'rebuilt' });
  });

  it('calls pnpm rebuild better-sqlite3 with correct args', () => {
    let callCount = 0;
    mockedEnsureSqlite.mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new Error('not found');
    });

    verifySqlite('/repo', pnpmConfig());

    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'pnpm',
      ['rebuild', 'better-sqlite3'],
      expect.objectContaining({ cwd: '/repo', stdio: 'pipe' }),
    );
  });

  // ============================================================================
  // pnpm project: rebuild fails, install + rebuild fixes it
  // ============================================================================

  it('returns installed_and_rebuilt when install + rebuild fixes sqlite', () => {
    let callCount = 0;
    mockedEnsureSqlite.mockImplementation(() => {
      callCount++;
      if (callCount <= 2) throw new Error('not found');
      // third call succeeds (after install + rebuild)
    });

    const result = verifySqlite('/repo', pnpmConfig());

    expect(result).toEqual({ available: true, action: 'installed_and_rebuilt' });
  });

  it('calls pnpm install then pnpm rebuild as escalation', () => {
    let callCount = 0;
    mockedEnsureSqlite.mockImplementation(() => {
      callCount++;
      if (callCount <= 2) throw new Error('not found');
    });

    verifySqlite('/repo', pnpmConfig());

    // Should have called: rebuild, then install, then rebuild again
    const calls = mockedExecFileSync.mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0]![1]).toEqual(['rebuild', 'better-sqlite3']);
    expect(calls[1]![1]).toEqual(['install']);
    expect(calls[2]![1]).toEqual(['rebuild', 'better-sqlite3']);
  });

  // ============================================================================
  // pnpm project: all attempts fail
  // ============================================================================

  it('returns failed when all rebuild attempts fail', () => {
    mockedEnsureSqlite.mockImplementation(() => { throw new Error('not found'); });

    const result = verifySqlite('/repo', pnpmConfig());

    expect(result.available).toBe(false);
    expect(result.action).toBe('failed');
  });

  it('includes manual instructions in error when all attempts fail', () => {
    mockedEnsureSqlite.mockImplementation(() => { throw new Error('not found'); });

    const result = verifySqlite('/repo', pnpmConfig());

    expect(result.error).toBeDefined();
    expect(result.error).toContain('pnpm install');
    expect(result.error).toContain('pnpm rebuild better-sqlite3');
  });

  // ============================================================================
  // Cache reset behavior
  // ============================================================================

  it('calls resetSqliteAvailability before each retry', () => {
    mockedEnsureSqlite.mockImplementation(() => { throw new Error('not found'); });

    verifySqlite('/repo', pnpmConfig());

    // Should reset before retry after rebuild, and before retry after install+rebuild
    expect(mockedResetSqlite).toHaveBeenCalledTimes(2);
  });

  // ============================================================================
  // Non-blocking: never throws
  // ============================================================================

  it('never throws even when everything fails', () => {
    mockedEnsureSqlite.mockImplementation(() => { throw new Error('catastrophic'); });
    mockedExecFileSync.mockImplementation(() => { throw new Error('rebuild failed'); });

    expect(() => verifySqlite('/repo', pnpmConfig())).not.toThrow();
  });

  it('never throws for non-pnpm project', () => {
    mockedEnsureSqlite.mockImplementation(() => { throw new Error('catastrophic'); });

    expect(() => verifySqlite('/repo', pnpmConfig({ isPnpm: false }))).not.toThrow();
  });

  // ============================================================================
  // Timeout configuration
  // ============================================================================

  it('passes timeout to execFileSync calls', () => {
    let callCount = 0;
    mockedEnsureSqlite.mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new Error('not found');
    });

    verifySqlite('/repo', pnpmConfig());

    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'pnpm',
      expect.any(Array),
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  // ============================================================================
  // Return type shape
  // ============================================================================

  it('always returns SqliteVerifyResult shape', () => {
    mockedEnsureSqlite.mockImplementation(() => {});

    const result = verifySqlite('/repo', pnpmConfig());

    expect(result).toHaveProperty('available');
    expect(result).toHaveProperty('action');
    expect(typeof result.available).toBe('boolean');
    expect(['already_ok', 'rebuilt', 'installed_and_rebuilt', 'failed']).toContain(result.action);
  });
});
