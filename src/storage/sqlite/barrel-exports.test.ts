/**
 * Tests that the sqlite barrel (index.ts) does NOT leak test-only
 * or internal-only symbols through the public API.
 */

import { describe, it, expect } from 'vitest';

describe('sqlite barrel exports', () => {
  it('does not export _resetSqliteState', async () => {
    const barrel = await import('./index.js');
    expect('_resetSqliteState' in barrel).toBe(false);
  });

  it('does not export _setForceUnavailable', async () => {
    const barrel = await import('./index.js');
    expect('_setForceUnavailable' in barrel).toBe(false);
  });

  it('does not export SCHEMA_SQL', async () => {
    const barrel = await import('./index.js');
    expect('SCHEMA_SQL' in barrel).toBe(false);
  });

  it('does not export collectCachedEmbeddings', async () => {
    const barrel = await import('./index.js');
    expect('collectCachedEmbeddings' in barrel).toBe(false);
  });
});

describe('sqlite test-helpers exports', () => {
  it('exports _resetSqliteState', async () => {
    const helpers = await import('./test-helpers.js');
    expect(typeof helpers._resetSqliteState).toBe('function');
  });

  it('exports _setForceUnavailable', async () => {
    const helpers = await import('./test-helpers.js');
    expect(typeof helpers._setForceUnavailable).toBe('function');
  });
});
