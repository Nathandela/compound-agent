/**
 * Tests for printBeadsFullStatus display utility.
 *
 * Follows TDD: Tests written BEFORE implementation changes.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';

import { printBeadsFullStatus } from './display-utils.js';
import type { BeadsFullCheck } from './beads-check.js';

describe('printBeadsFullStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // CLI not available
  // ==========================================================================

  it('prints "not found" when CLI is not available', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const check: BeadsFullCheck = {
      cliAvailable: false,
      initialized: false,
      healthy: false,
      healthMessage:
        'Beads CLI not found. Recommended for full workflow (issue tracking, deps, TDD pipeline).\n' +
        'Install: curl -sSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash\n' +
        'Or run: ca install-beads',
    };

    printBeadsFullStatus(check);

    const output = spy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('not found');
  });

  it('prints the install hint (curl command) when CLI is not available', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const check: BeadsFullCheck = {
      cliAvailable: false,
      initialized: false,
      healthy: false,
      healthMessage:
        'Beads CLI not found. Recommended for full workflow (issue tracking, deps, TDD pipeline).\n' +
        'Install: curl -sSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash\n' +
        'Or run: ca install-beads',
    };

    printBeadsFullStatus(check);

    const output = spy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain(
      'curl -sSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash',
    );
  });

  // ==========================================================================
  // CLI available, not initialized
  // ==========================================================================

  it('prints "not initialized" with bd init hint when CLI available but not initialized', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const check: BeadsFullCheck = {
      cliAvailable: true,
      initialized: false,
      healthy: false,
    };

    printBeadsFullStatus(check);

    const output = spy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('not initialized');
    expect(output).toContain('bd init');
  });

  // ==========================================================================
  // CLI available, initialized, healthy
  // ==========================================================================

  it('prints OK lines with no hint when fully healthy', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const check: BeadsFullCheck = {
      cliAvailable: true,
      initialized: true,
      healthy: true,
    };

    printBeadsFullStatus(check);

    const output = spy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('OK');
    expect(output).not.toContain('not found');
    expect(output).not.toContain('not initialized');
    expect(output).not.toContain('issues found');
  });

  // ==========================================================================
  // CLI available, initialized, unhealthy
  // ==========================================================================

  it('prints health issue message when unhealthy', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const check: BeadsFullCheck = {
      cliAvailable: true,
      initialized: true,
      healthy: false,
      healthMessage: 'dolt server not running',
    };

    printBeadsFullStatus(check);

    const output = spy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('issues found');
    expect(output).toContain('dolt server not running');
  });
});
