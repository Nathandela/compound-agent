/**
 * Tests for verify-gates command — verify workflow gates before epic closure.
 *
 * Follows TDD: Tests written BEFORE implementation.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock execSync before importing the module under test
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';
import { runVerifyGates, type GateCheck } from './verify-gates.js';

const mockExecSync = vi.mocked(execSync);

// Helper to build bd show output for an epic
function bdShowOutput(opts: {
  epicId?: string;
  title?: string;
  deps?: Array<{ closed: boolean; title: string; id: string }>;
}): string {
  const id = opts.epicId ?? 'test1';
  const title = opts.title ?? 'EPIC: Test epic';
  const marker = '○';
  const lines = [
    `${marker} learning_agent-${id} · ${title}   [P0 · OPEN]`,
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
    mockExecSync.mockReset();
  });

  // ==========================================================================
  // Return type
  // ==========================================================================

  it('returns an array of GateCheck objects', async () => {
    mockExecSync.mockReturnValue(bdShowOutput({
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
    mockExecSync.mockReturnValue(bdShowOutput({
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
    mockExecSync.mockReturnValue(bdShowOutput({
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
    mockExecSync.mockReturnValue(bdShowOutput({
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
    mockExecSync.mockReturnValue(bdShowOutput({
      deps: [
        { closed: true, title: 'Review: check implementation', id: 'r1' },
        { closed: true, title: 'Compound: capture learnings', id: 'c1' },
      ],
    }));

    const checks = await runVerifyGates('test1');
    const reviewCheck = checks.find(c => c.name === 'Review task');
    const compoundCheck = checks.find(c => c.name === 'Compound task');
    expect(reviewCheck!.status).toBe('pass');
    expect(compoundCheck!.status).toBe('pass');
    expect(checks.every(c => c.status === 'pass')).toBe(true);
  });

  // ==========================================================================
  // Open compound task -> FAIL
  // ==========================================================================

  it('fails when compound task exists but is open', async () => {
    mockExecSync.mockReturnValue(bdShowOutput({
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
    mockExecSync.mockImplementation(() => {
      throw new Error('Issue not found: learning_agent-invalid');
    });

    await expect(runVerifyGates('invalid')).rejects.toThrow(/invalid/i);
  });

  // ==========================================================================
  // No DEPENDS ON section at all -> both gates fail
  // ==========================================================================

  it('fails both gates when epic has no DEPENDS ON section', async () => {
    mockExecSync.mockReturnValue(bdShowOutput({ deps: [] }));

    const checks = await runVerifyGates('test1');
    const reviewCheck = checks.find(c => c.name === 'Review task');
    const compoundCheck = checks.find(c => c.name === 'Compound task');
    expect(reviewCheck!.status).toBe('fail');
    expect(compoundCheck!.status).toBe('fail');
  });
});
