import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  processToolFailure,
  processToolSuccess,
  resetFailureState,
  STATE_FILE_NAME,
} from './hooks.js';

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

describe('hooks failure state respects COMPOUND_AGENT_ROOT', () => {
  let targetDir: string;
  let stateDir: string;
  const originalEnv = process.env['COMPOUND_AGENT_ROOT'];

  beforeEach(async () => {
    targetDir = await mkdtemp(join(tmpdir(), 'hooks-root-'));
    stateDir = join(targetDir, '.claude');
    mkdirSync(stateDir, { recursive: true });
    // Reset in-memory counters between tests
    resetFailureState();
  });

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env['COMPOUND_AGENT_ROOT'];
    } else {
      process.env['COMPOUND_AGENT_ROOT'] = originalEnv;
    }
    resetFailureState(stateDir);
    await rm(targetDir, { recursive: true, force: true });
  });

  it('writes failure state file to stateDir, not cwd', () => {
    // processToolFailure with explicit stateDir writes to that dir
    processToolFailure('Bash', { command: 'npm test' }, stateDir);

    const stateFile = join(stateDir, STATE_FILE_NAME);
    expect(existsSync(stateFile)).toBe(true);

    const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
    expect(state.count).toBe(1);
    expect(state.lastTarget).toBe('npm');
  });

  it('processToolSuccess clears failure state from stateDir', () => {
    processToolFailure('Bash', { command: 'npm test' }, stateDir);
    const stateFile = join(stateDir, STATE_FILE_NAME);
    expect(existsSync(stateFile)).toBe(true);

    processToolSuccess(stateDir);
    expect(existsSync(stateFile)).toBe(false);
  });

  it('state file never appears in cwd when stateDir points elsewhere', () => {
    const cwdStateFile = join(process.cwd(), '.claude', STATE_FILE_NAME);
    const existedBefore = existsSync(cwdStateFile);

    processToolFailure('Bash', { command: 'npm test' }, stateDir);

    // cwd state file should not have been created or modified
    if (!existedBefore) {
      expect(existsSync(cwdStateFile)).toBe(false);
    }
    // But target stateDir should have the file
    expect(existsSync(join(stateDir, STATE_FILE_NAME))).toBe(true);
  });
});
