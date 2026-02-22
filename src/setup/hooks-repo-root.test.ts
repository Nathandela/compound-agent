import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('hooks.ts repo root routing', () => {
  it('uses getRepoRoot for all state path resolution, not process.cwd()', () => {
    const source = readFileSync(join(import.meta.dirname, 'hooks.ts'), 'utf-8');
    // Filter out comments to only check actual code
    const codeLines = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'));
    const cwdUsages = codeLines.filter((line) => line.includes('process.cwd()'));
    expect(cwdUsages).toHaveLength(0);
    // Must import and use getRepoRoot
    expect(source).toContain('getRepoRoot');
  });
});
