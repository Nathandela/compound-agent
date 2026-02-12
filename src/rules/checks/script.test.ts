/**
 * Tests for script rule check.
 */

import { describe, expect, it } from 'vitest';

import { runScriptCheck } from './script.js';

describe('runScriptCheck', () => {
  it('passes when command exits 0 (default expectExitCode)', () => {
    const violations = runScriptCheck({
      type: 'script',
      command: 'true',
    });

    expect(violations).toHaveLength(0);
  });

  it('flags when command exits non-zero (default expectExitCode)', () => {
    const violations = runScriptCheck({
      type: 'script',
      command: 'false',
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('exit code');
  });

  it('uses custom expectExitCode', () => {
    // "false" exits with 1, so expecting 1 should pass
    const violations = runScriptCheck({
      type: 'script',
      command: 'false',
      expectExitCode: 1,
    });

    expect(violations).toHaveLength(0);
  });

  it('captures stderr in violation message', () => {
    const violations = runScriptCheck({
      type: 'script',
      command: 'echo "error message" >&2 && exit 1',
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('error message');
  });

  it('handles command not found', () => {
    const violations = runScriptCheck({
      type: 'script',
      command: 'nonexistent-command-xyz-123',
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('exit code');
  });
});
