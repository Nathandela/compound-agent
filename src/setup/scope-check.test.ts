/**
 * Tests for user-scope detection.
 *
 * Follows TDD: Tests written BEFORE implementation.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { checkUserScope, type ScopeCheckResult } from './scope-check.js';

describe('checkUserScope', () => {
  const home = homedir();

  // ============================================================================
  // User-scope detection (home directory)
  // ============================================================================

  it('detects user scope when repoRoot is homedir', () => {
    const result = checkUserScope(home);

    expect(result.isUserScope).toBe(true);
  });

  it('returns warning message when user-scope detected', () => {
    const result = checkUserScope(home);

    expect(result.message).toBeDefined();
    expect(result.message).toContain('user scope');
  });

  it('mentions repository scope recommendation in warning', () => {
    const result = checkUserScope(home);

    expect(result.message).toContain('repository scope');
  });

  // ============================================================================
  // User-scope detection (direct child of homedir)
  // ============================================================================

  it('detects user scope when repoRoot is direct child of homedir', () => {
    const result = checkUserScope(join(home, 'Desktop'));

    expect(result.isUserScope).toBe(true);
  });

  // ============================================================================
  // Repository scope (not user scope)
  // ============================================================================

  it('returns isUserScope: false for nested project directory', () => {
    const result = checkUserScope(join(home, 'Documents', 'Code', 'my-project'));

    expect(result.isUserScope).toBe(false);
  });

  it('does not include message for repo-scope', () => {
    const result = checkUserScope(join(home, 'Documents', 'Code', 'my-project'));

    expect(result.message).toBeUndefined();
  });

  it('returns isUserScope: false for unrelated path', () => {
    const result = checkUserScope('/tmp/some-project');

    expect(result.isUserScope).toBe(false);
  });

  it('returns isUserScope: false for deeply nested path under home', () => {
    const result = checkUserScope(join(home, 'a', 'b', 'c'));

    expect(result.isUserScope).toBe(false);
  });

  // ============================================================================
  // Return type
  // ============================================================================

  it('returns ScopeCheckResult shape', () => {
    const result = checkUserScope('/some/path');

    expect(result).toHaveProperty('isUserScope');
    expect(typeof result.isUserScope).toBe('boolean');
  });
});
