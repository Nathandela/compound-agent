/**
 * E2E lifecycle test for phase enforcement hooks.
 *
 * TDD GATE: Imports from modules that do NOT exist yet.
 * Tests should fail with import errors, not logic errors.
 *
 * Simulates a full LFG loop:
 *   init -> read skills -> phase transitions -> gate checks -> cleanup
 */

import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  cleanPhaseState,
  getPhaseState,
  initPhaseState,
  recordGatePassed,
  startPhase,
  updatePhaseState,
} from '../commands/phase-check.js';
import { processPhaseGuard } from './hooks-phase-guard.js';
import { processReadTracker } from './hooks-read-tracker.js';
import { processStopAudit } from './hooks-stop-audit.js';

describe('Phase Enforcement Lifecycle (E2E)', { tags: ['hooks'] }, () => {
  let repoRoot: string;
  let stateDir: string;
  let stateFile: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'lifecycle-'));
    stateDir = join(repoRoot, '.claude');
    stateFile = join(stateDir, '.ca-phase-state.json');
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it('full LFG cycle: init -> skills -> transitions -> gates -> cleanup', () => {
    // Step 1: Initialize phase state
    initPhaseState(repoRoot, 'learning_agent-5dfm');
    const initial = getPhaseState(repoRoot);
    expect(initial).not.toBeNull();
    expect(initial!.lfg_active).toBe(true);
    expect(initial!.current_phase).toBe('brainstorm');

    // Step 2: Edit blocked before reading skill
    const guardResult1 = processPhaseGuard(repoRoot, 'Edit', { file_path: '/src/app.ts' });
    expect(guardResult1.hookSpecificOutput).toBeDefined();
    expect(guardResult1.hookSpecificOutput?.additionalContext).toMatch(/WARNING/i);

    // Step 3: Read brainstorm skill
    processReadTracker(repoRoot, 'Read', {
      file_path: '.claude/skills/compound/brainstorm/SKILL.md',
    });
    const afterRead = getPhaseState(repoRoot);
    expect(afterRead!.skills_read).toContain('.claude/skills/compound/brainstorm/SKILL.md');

    // Step 4: Transition to plan phase
    startPhase(repoRoot, 'plan');
    recordGatePassed(repoRoot, 'post-plan');

    const planState = getPhaseState(repoRoot);
    expect(planState!.current_phase).toBe('plan');
    expect(planState!.gates_passed).toContain('post-plan');

    // Step 5: Transition to work phase
    processReadTracker(repoRoot, 'Read', {
      file_path: '.claude/skills/compound/plan/SKILL.md',
    });
    startPhase(repoRoot, 'work');
    recordGatePassed(repoRoot, 'gate-3');

    // Step 6: Read work skill, then Edit is allowed
    processReadTracker(repoRoot, 'Read', {
      file_path: '.claude/skills/compound/work/SKILL.md',
    });
    const guardResult2 = processPhaseGuard(repoRoot, 'Edit', { file_path: '/src/app.ts' });
    expect(guardResult2).toEqual({});

    // Step 7: Cleanup
    cleanPhaseState(repoRoot);
    expect(existsSync(stateFile)).toBe(false);
  });

  it('all hooks return {} after cleanup (no state = no enforcement)', () => {
    initPhaseState(repoRoot, 'learning_agent-5dfm');
    cleanPhaseState(repoRoot);

    expect(processPhaseGuard(repoRoot, 'Edit', { file_path: '/src/x.ts' })).toEqual({});
    expect(processReadTracker(repoRoot, 'Read', { file_path: '.claude/skills/x.md' })).toEqual({});
    expect(processStopAudit(repoRoot)).toEqual({});
  });

  it('hooks are inert when lfg_active is false', () => {
    initPhaseState(repoRoot, 'learning_agent-5dfm');
    updatePhaseState(repoRoot, { lfg_active: false });

    expect(processPhaseGuard(repoRoot, 'Edit', { file_path: '/src/x.ts' })).toEqual({});
    expect(processReadTracker(repoRoot, 'Read', {
      file_path: '.claude/skills/compound/work/SKILL.md',
    })).toEqual({});
    expect(processStopAudit(repoRoot)).toEqual({});
  });

  it('state file is clean after full cycle', () => {
    initPhaseState(repoRoot, 'learning_agent-5dfm');
    updatePhaseState(repoRoot, { current_phase: 'compound', phase_index: 5 });
    recordGatePassed(repoRoot, 'final');
    cleanPhaseState(repoRoot);

    expect(existsSync(stateFile)).toBe(false);
    expect(getPhaseState(repoRoot)).toBeNull();
  });
});
