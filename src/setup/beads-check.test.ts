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

  it('returns available: true when bd is found', () => {
    mockedExecSync.mockReturnValue('/usr/local/bin/bd\n');

    const result = checkBeadsAvailable();

    expect(result.available).toBe(true);
  });

  it('does not include a message when bd is found', () => {
    mockedExecSync.mockReturnValue('/usr/local/bin/bd\n');

    const result = checkBeadsAvailable();

    expect(result.message).toBeUndefined();
  });

  // ============================================================================
  // bd not found
  // ============================================================================

  it('returns available: false when bd is not found', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('not found');
    });

    const result = checkBeadsAvailable();

    expect(result.available).toBe(false);
  });

  it('includes curl install command in message when bd is not found', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('not found');
    });

    const result = checkBeadsAvailable();

    expect(result.message).toBeDefined();
    expect(result.message).toContain(
      'curl -sSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash',
    );
  });

  it('mentions ca install-beads command when bd is not found', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('not found');
    });

    const result = checkBeadsAvailable();

    expect(result.message).toContain('ca install-beads');
  });

  it('includes helpful description when bd is not found', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('not found');
    });

    const result = checkBeadsAvailable();

    expect(result.message).toContain('Beads CLI not found');
  });

  // ============================================================================
  // Return type
  // ============================================================================

  it('returns BeadsCheckResult shape', () => {
    mockedExecSync.mockReturnValue('/usr/local/bin/bd\n');

    const result = checkBeadsAvailable();

    expect(result).toHaveProperty('available');
    expect(typeof result.available).toBe('boolean');
  });

  // ============================================================================
  // Non-blocking behavior
  // ============================================================================

  it('does not throw when bd check fails', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('command not found: bd');
    });

    expect(() => checkBeadsAvailable()).not.toThrow();
  });
});
