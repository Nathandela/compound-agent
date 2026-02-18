/**
 * Tests for verify-gates command — verify workflow gates before epic closure.
 *
 * Follows TDD: Tests written BEFORE implementation.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock execFileSync before importing the module under test
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import { runVerifyGates, type GateCheck } from './verify-gates.js';

const mockExecFileSync = vi.mocked(execFileSync);

// Helper to build bd show --json output (array format, matching real bd CLI)
function bdShowJson(opts: {
  epicId?: string;
  title?: string;
  deps?: Array<{ closed: boolean; title: string; id: string }>;
}): string {
  return JSON.stringify([{
    id: `learning_agent-${opts.epicId ?? 'test1'}`,
    title: opts.title ?? 'EPIC: Test epic',
    status: 'open',
    depends_on: (opts.deps ?? []).map(dep => ({
      id: `learning_agent-${dep.id}`,
      title: dep.title,
      status: dep.closed ? 'closed' : 'open',
    })),
  }]);
}

// Helper to build bd show text output (fallback path)
function bdShowText(opts: {
  epicId?: string;
  title?: string;
  deps?: Array<{ closed: boolean; title: string; id: string }>;
}): string {
  const id = opts.epicId ?? 'test1';
  const title = opts.title ?? 'EPIC: Test epic';
  const lines = [
    `○ learning_agent-${id} · ${title}   [P0 · OPEN]`,
    `Owner: Test · Type: epic`,
    `Created: 2026-01-01 · Updated: 2026-01-01`,
    '',
    'DESCRIPTION',
    'Test epic description.',
  ];

  if (opts.deps && opts.deps.length > 0) {
    lines.push('');
    lines.push('DEPENDS ON');
    for (const dep of opts.deps) {
      const sym = dep.closed ? '✓' : '○';
      lines.push(`  → ${sym} learning_agent-${dep.id}: ${dep.title} ● P0`);
    }
  }

  return lines.join('\n');
}

describe('verify-gates', () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  // ==========================================================================
  // Shell injection prevention
  // ==========================================================================

  it('rejects epic IDs with shell metacharacters', async () => {
    await expect(runVerifyGates('test; rm -rf /')).rejects.toThrow(/invalid epic id/i);
    await expect(runVerifyGates('$(whoami)')).rejects.toThrow(/invalid epic id/i);
    await expect(runVerifyGates('test`cmd`')).rejects.toThrow(/invalid epic id/i);
    await expect(runVerifyGates('id && echo pwned')).rejects.toThrow(/invalid epic id/i);
  });

  // ==========================================================================
  // JSON parsing path (primary)
  // ==========================================================================

  it('parses JSON output from bd show --json', async () => {
    mockExecFileSync.mockReturnValue(bdShowJson({
      deps: [
        { closed: true, title: 'Review: check', id: 'r1' },
        { closed: true, title: 'Compound: capture', id: 'c1' },
      ],
    }));

    const checks = await runVerifyGates('test1');
    expect(checks.every(c => c.status === 'pass')).toBe(true);
    // Should call with --json flag
    expect(mockExecFileSync).toHaveBeenCalledWith('bd', ['show', 'test1', '--json'], { encoding: 'utf-8' });
  });

  // ==========================================================================
  // Text fallback path
  // ==========================================================================

  it('falls back to text parsing when JSON parse fails', async () => {
    // First call (--json) returns invalid JSON, second call (text) returns text
    mockExecFileSync
      .mockReturnValueOnce('not valid json')
      .mockReturnValueOnce(bdShowText({
        deps: [
          { closed: true, title: 'Review: check', id: 'r1' },
          { closed: true, title: 'Compound: capture', id: 'c1' },
        ],
      }));

    const checks = await runVerifyGates('test1');
    expect(checks.every(c => c.status === 'pass')).toBe(true);
    expect(mockExecFileSync).toHaveBeenCalledTimes(2);
  });

  // ==========================================================================
  // Return type
  // ==========================================================================

  it('returns an array of GateCheck objects', async () => {
    mockExecFileSync.mockReturnValue(bdShowJson({
      deps: [
        { closed: true, title: 'Review: something', id: 'r1' },
        { closed: true, title: 'Compound: something', id: 'c1' },
      ],
    }));

    const checks = await runVerifyGates('test1');
    expect(Array.isArray(checks)).toBe(true);
    for (const check of checks) {
      expect(check).toHaveProperty('name');
      expect(check).toHaveProperty('status');
      expect(['pass', 'fail']).toContain(check.status);
    }
  });

  // ==========================================================================
  // Missing review task -> FAIL
  // ==========================================================================

  it('fails when no review task exists', async () => {
    mockExecFileSync.mockReturnValue(bdShowJson({
      deps: [
        { closed: true, title: 'Compound: some task', id: 'c1' },
      ],
    }));

    const checks = await runVerifyGates('test1');
    const reviewCheck = checks.find(c => c.name === 'Review task');
    expect(reviewCheck).toBeDefined();
    expect(reviewCheck!.status).toBe('fail');
    expect(reviewCheck!.detail).toMatch(/missing/i);
  });

  // ==========================================================================
  // Open review task -> FAIL
  // ==========================================================================

  it('fails when review task exists but is open', async () => {
    mockExecFileSync.mockReturnValue(bdShowJson({
      deps: [
        { closed: false, title: 'Review: check implementation', id: 'r1' },
        { closed: true, title: 'Compound: capture learnings', id: 'c1' },
      ],
    }));

    const checks = await runVerifyGates('test1');
    const reviewCheck = checks.find(c => c.name === 'Review task');
    expect(reviewCheck).toBeDefined();
    expect(reviewCheck!.status).toBe('fail');
    expect(reviewCheck!.detail).toMatch(/not closed/i);
  });

  // ==========================================================================
  // Closed review + no compound task -> FAIL
  // ==========================================================================

  it('fails when review is closed but compound task is missing', async () => {
    mockExecFileSync.mockReturnValue(bdShowJson({
      deps: [
        { closed: true, title: 'Review: check implementation', id: 'r1' },
      ],
    }));

    const checks = await runVerifyGates('test1');
    const reviewCheck = checks.find(c => c.name === 'Review task');
    const compoundCheck = checks.find(c => c.name === 'Compound task');
    expect(reviewCheck!.status).toBe('pass');
    expect(compoundCheck).toBeDefined();
    expect(compoundCheck!.status).toBe('fail');
    expect(compoundCheck!.detail).toMatch(/missing/i);
  });

  // ==========================================================================
  // All gates pass
  // ==========================================================================

  it('passes when both review and compound tasks are closed', async () => {
    mockExecFileSync.mockReturnValue(bdShowJson({
      deps: [
        { closed: true, title: 'Review: check implementation', id: 'r1' },
        { closed: true, title: 'Compound: capture learnings', id: 'c1' },
      ],
    }));

    const checks = await runVerifyGates('test1');
    expect(checks.every(c => c.status === 'pass')).toBe(true);
  });

  // ==========================================================================
  // Open compound task -> FAIL
  // ==========================================================================

  it('fails when compound task exists but is open', async () => {
    mockExecFileSync.mockReturnValue(bdShowJson({
      deps: [
        { closed: true, title: 'Review: check implementation', id: 'r1' },
        { closed: false, title: 'Compound: capture learnings', id: 'c1' },
      ],
    }));

    const checks = await runVerifyGates('test1');
    const compoundCheck = checks.find(c => c.name === 'Compound task');
    expect(compoundCheck).toBeDefined();
    expect(compoundCheck!.status).toBe('fail');
    expect(compoundCheck!.detail).toMatch(/not closed/i);
  });

  // ==========================================================================
  // Invalid epic ID -> graceful error
  // ==========================================================================

  it('throws a descriptive error for invalid epic ID', async () => {
    // No mock needed — validation rejects before execFileSync is called
    await expect(runVerifyGates('test; rm -rf')).rejects.toThrow(/invalid epic id/i);
  });

  // ==========================================================================
  // No dependencies -> both gates fail
  // ==========================================================================

  it('fails both gates when epic has no dependencies', async () => {
    mockExecFileSync.mockReturnValue(bdShowJson({ deps: [] }));

    const checks = await runVerifyGates('test1');
    expect(checks.every(c => c.status === 'fail')).toBe(true);
  });

  // ==========================================================================
  // Works with any beads prefix
  // ==========================================================================

  it('parses deps with different beads project prefixes', async () => {
    mockExecFileSync.mockReturnValue(JSON.stringify([{
      id: 'my-project-abc1',
      title: 'EPIC: Test epic',
      status: 'open',
      depends_on: [
        { id: 'my-project-r1', title: 'Review: check', status: 'closed' },
        { id: 'my-project-c1', title: 'Compound: capture', status: 'closed' },
      ],
    }]));

    const checks = await runVerifyGates('abc1');
    expect(checks.every(c => c.status === 'pass')).toBe(true);
  });

  describe('phase-state cleanup', () => {
    async function writePhaseState(repoRoot: string, gatesPassed: string[]): Promise<string> {
      const stateDir = join(repoRoot, '.claude');
      const statePath = join(stateDir, '.ca-phase-state.json');
      await mkdir(stateDir, { recursive: true });
      await writeFile(
        statePath,
        JSON.stringify({
          lfg_active: true,
          epic_id: 'learning_agent-5dfm',
          current_phase: 'compound',
          phase_index: 5,
          skills_read: [],
          gates_passed: gatesPassed,
          started_at: new Date().toISOString(),
        }),
        'utf-8'
      );
      return statePath;
    }

    it('deletes phase state when checks pass and final gate is already recorded', async () => {
      const repoRoot = await mkdtemp(join(tmpdir(), 'verify-gates-clean-'));
      try {
        const statePath = await writePhaseState(repoRoot, ['post-plan', 'gate-3', 'gate-4', 'final']);

        mockExecFileSync.mockReturnValue(bdShowJson({
          deps: [
            { closed: true, title: 'Review: check implementation', id: 'r1' },
            { closed: true, title: 'Compound: capture learnings', id: 'c1' },
          ],
        }));

        const checks = await runVerifyGates('test1', { repoRoot });
        expect(checks.every(c => c.status === 'pass')).toBe(true);
        expect(existsSync(statePath)).toBe(false);
      } finally {
        await rm(repoRoot, { recursive: true, force: true });
      }
    });

    it('keeps phase state when checks pass but final gate is not recorded', async () => {
      const repoRoot = await mkdtemp(join(tmpdir(), 'verify-gates-keep-'));
      try {
        const statePath = await writePhaseState(repoRoot, ['post-plan', 'gate-3', 'gate-4']);

        mockExecFileSync.mockReturnValue(bdShowJson({
          deps: [
            { closed: true, title: 'Review: check implementation', id: 'r1' },
            { closed: true, title: 'Compound: capture learnings', id: 'c1' },
          ],
        }));

        const checks = await runVerifyGates('test1', { repoRoot });
        expect(checks.every(c => c.status === 'pass')).toBe(true);
        expect(existsSync(statePath)).toBe(true);
      } finally {
        await rm(repoRoot, { recursive: true, force: true });
      }
    });

    it('keeps phase state when any verify-gates check fails', async () => {
      const repoRoot = await mkdtemp(join(tmpdir(), 'verify-gates-fail-'));
      try {
        const statePath = await writePhaseState(repoRoot, ['post-plan', 'gate-3', 'gate-4', 'final']);

        mockExecFileSync.mockReturnValue(bdShowJson({
          deps: [
            { closed: true, title: 'Review: check implementation', id: 'r1' },
          ],
        }));

        const checks = await runVerifyGates('test1', { repoRoot });
        expect(checks.some(c => c.status === 'fail')).toBe(true);
        expect(existsSync(statePath)).toBe(true);
      } finally {
        await rm(repoRoot, { recursive: true, force: true });
      }
    });
  });
});
