/**
 * Tests that the sqlite barrel (index.ts) does NOT leak
 * internal-only symbols through the public API.
 */

import { accessSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

describe('deprecated sqlite shim removed', () => {
  it('src/storage/sqlite.ts shim file does not exist', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const shimPath = join(thisDir, '..', 'sqlite.ts');
    let exists = false;
    try {
      accessSync(shimPath);
      exists = true;
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });
});

describe('sqlite barrel exports', () => {
  it('does not export SCHEMA_SQL', async () => {
    const barrel = await import('./index.js');
    expect('SCHEMA_SQL' in barrel).toBe(false);
  });

  it('does not export collectCachedEmbeddings', async () => {
    const barrel = await import('./index.js');
    expect('collectCachedEmbeddings' in barrel).toBe(false);
  });

  it('does not export isSqliteMode (removed with degradation layer)', async () => {
    const barrel = await import('./index.js');
    expect('isSqliteMode' in barrel).toBe(false);
  });
});
