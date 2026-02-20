/**
 * Tests for Beads CLI availability checker.
 *
 * Follows TDD: Tests written BEFORE implementation.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as childProcess from 'node:child_process';

import { checkBeadsAvailable, type BeadsCheckResult } from './beads-check.js';

// Mock child_process to control `which bd` behavior
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual('node:child_process');
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

const mockedExecSync = vi.mocked(childProcess.execSync);

describe('checkBeadsAvailable', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // bd found
  // ============================================================================

  it('returns available: true when bd is found', async () => {
    mockedExecSync.mockReturnValue('/usr/local/bin/bd\n');

    const result = await checkBeadsAvailable();

    expect(result.available).toBe(true);
  });

  it('does not include a message when bd is found', async () => {
    mockedExecSync.mockReturnValue('/usr/local/bin/bd\n');

    const result = await checkBeadsAvailable();

    expect(result.message).toBeUndefined();
  });

  // ============================================================================
  // bd not found
  // ============================================================================

  it('returns available: false when bd is not found', async () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('not found');
    });

    const result = await checkBeadsAvailable();

    expect(result.available).toBe(false);
  });

  it('includes install URL in message when bd is not found', async () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('not found');
    });

    const result = await checkBeadsAvailable();

    expect(result.message).toBeDefined();
    expect(result.message).toContain('https://github.com/Nathandela/beads');
  });

  it('includes helpful description when bd is not found', async () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('not found');
    });

    const result = await checkBeadsAvailable();

    expect(result.message).toContain('Beads CLI not found');
  });

  // ============================================================================
  // Return type
  // ============================================================================

  it('returns BeadsCheckResult shape', async () => {
    mockedExecSync.mockReturnValue('/usr/local/bin/bd\n');

    const result = await checkBeadsAvailable();

    expect(result).toHaveProperty('available');
    expect(typeof result.available).toBe('boolean');
  });

  // ============================================================================
  // Non-blocking behavior
  // ============================================================================

  it('does not throw when bd check fails', async () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('command not found: bd');
    });

    await expect(checkBeadsAvailable()).resolves.not.toThrow();
  });
});
