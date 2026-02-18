/**
 * Unit tests for phase-check state machine logic.
 *
 * TDD GATE: These tests import from a module that does NOT exist yet.
 * They should fail with import errors, not logic errors.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  cleanPhaseState,
  expectedGateForPhase,
  getPhaseState,
  initPhaseState,
  recordGatePassed,
  startPhase,
  updatePhaseState,
} from './phase-check.js';

describe('Phase Check State Machine', () => {
  let repoRoot: string;
  let stateDir: string;
  let stateFile: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'phase-check-'));
    stateDir = join(repoRoot, '.claude');
    stateFile = join(stateDir, '.ca-phase-state.json');
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  describe('initPhaseState', () => {
    it('creates state file with correct initial shape', () => {
      initPhaseState(repoRoot, 'learning_agent-5dfm');

      expect(existsSync(stateFile)).toBe(true);
      const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
      expect(state.lfg_active).toBe(true);
      expect(state.epic_id).toBe('learning_agent-5dfm');
      expect(state.current_phase).toBe('brainstorm');
      expect(state.phase_index).toBe(1);
      expect(state.skills_read).toEqual([]);
      expect(state.gates_passed).toEqual([]);
      expect(state.started_at).toBeDefined();
    });

    it('sets started_at to a valid ISO timestamp', () => {
      initPhaseState(repoRoot, 'learning_agent-5dfm');

      const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
      const parsed = new Date(state.started_at);
      expect(parsed.getTime()).not.toBeNaN();
    });

    it('creates .claude directory if it does not exist', () => {
      expect(existsSync(stateDir)).toBe(false);
      initPhaseState(repoRoot, 'learning_agent-5dfm');
      expect(existsSync(stateDir)).toBe(true);
    });

    it('is idempotent — calling init twice does not error', () => {
      initPhaseState(repoRoot, 'learning_agent-5dfm');
      expect(() => initPhaseState(repoRoot, 'learning_agent-5dfm')).not.toThrow();
    });

    it('overwrites existing state on re-init', () => {
      initPhaseState(repoRoot, 'learning_agent-5dfm');
      updatePhaseState(repoRoot, { current_phase: 'work', phase_index: 3 });
      initPhaseState(repoRoot, 'learning_agent-5dfm');

      const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
      expect(state.current_phase).toBe('brainstorm');
      expect(state.phase_index).toBe(1);
    });
  });

  describe('getPhaseState', () => {
    it('returns state when file exists', () => {
      initPhaseState(repoRoot, 'learning_agent-5dfm');
      const state = getPhaseState(repoRoot);

      expect(state).not.toBeNull();
      expect(state!.lfg_active).toBe(true);
      expect(state!.current_phase).toBe('brainstorm');
      expect(state!.epic_id).toBe('learning_agent-5dfm');
    });

    it('returns null when state file is missing', () => {
      const state = getPhaseState(repoRoot);
      expect(state).toBeNull();
    });

    it('returns null when state file is corrupted JSON', () => {
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(stateFile, '{not valid json!!!', 'utf-8');

      const state = getPhaseState(repoRoot);
      expect(state).toBeNull();
    });

    it('returns null when state file has invalid shape', () => {
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(stateFile, JSON.stringify({ foo: 'bar' }), 'utf-8');

      const state = getPhaseState(repoRoot);
      expect(state).toBeNull();
    });
  });

  describe('updatePhaseState', () => {
    it('merges partial updates into existing state', () => {
      initPhaseState(repoRoot, 'learning_agent-5dfm');
      updatePhaseState(repoRoot, { current_phase: 'work', phase_index: 3 });

      const state = getPhaseState(repoRoot);
      expect(state!.current_phase).toBe('work');
      expect(state!.phase_index).toBe(3);
      expect(state!.lfg_active).toBe(true);
    });

    it('updates skills_read array', () => {
      initPhaseState(repoRoot, 'learning_agent-5dfm');
      updatePhaseState(repoRoot, { skills_read: ['.claude/skills/work/SKILL.md'] });

      const state = getPhaseState(repoRoot);
      expect(state!.skills_read).toEqual(['.claude/skills/work/SKILL.md']);
    });

    it('returns null when no state file exists', () => {
      const result = updatePhaseState(repoRoot, { current_phase: 'work', phase_index: 3 });
      expect(result).toBeNull();
    });
  });

  describe('startPhase', () => {
    it('updates phase and phase_index together', () => {
      initPhaseState(repoRoot, 'learning_agent-5dfm');
      startPhase(repoRoot, 'review');

      const state = getPhaseState(repoRoot);
      expect(state!.current_phase).toBe('review');
      expect(state!.phase_index).toBe(4);
    });

    it('returns null when no state file exists', () => {
      const state = startPhase(repoRoot, 'plan');
      expect(state).toBeNull();
    });
  });

  describe('cleanPhaseState', () => {
    it('deletes the state file', () => {
      initPhaseState(repoRoot, 'learning_agent-5dfm');
      expect(existsSync(stateFile)).toBe(true);

      cleanPhaseState(repoRoot);
      expect(existsSync(stateFile)).toBe(false);
    });

    it('is idempotent — cleaning when already clean does not error', () => {
      expect(() => cleanPhaseState(repoRoot)).not.toThrow();
    });
  });

  describe('recordGatePassed', () => {
    it('appends gate name to gates_passed', () => {
      initPhaseState(repoRoot, 'learning_agent-5dfm');
      recordGatePassed(repoRoot, 'post-plan');

      const state = getPhaseState(repoRoot);
      expect(state!.gates_passed).toContain('post-plan');
    });

    it('does not duplicate gate names', () => {
      initPhaseState(repoRoot, 'learning_agent-5dfm');
      recordGatePassed(repoRoot, 'post-plan');
      recordGatePassed(repoRoot, 'post-plan');

      const state = getPhaseState(repoRoot);
      expect(state!.gates_passed).toEqual(['post-plan']);
    });

    it('returns null when no state file exists', () => {
      const result = recordGatePassed(repoRoot, 'post-plan');
      expect(result).toBeNull();
    });

    it('records final gate and cleans phase state file', () => {
      initPhaseState(repoRoot, 'learning_agent-5dfm');

      const result = recordGatePassed(repoRoot, 'final');

      expect(result).not.toBeNull();
      expect(result!.gates_passed).toContain('final');
      expect(existsSync(stateFile)).toBe(false);
      expect(getPhaseState(repoRoot)).toBeNull();
    });
  });

  describe('expectedGateForPhase', () => {
    it('returns expected gate names for gated phases', () => {
      expect(expectedGateForPhase(2)).toBe('post-plan');
      expect(expectedGateForPhase(3)).toBe('gate-3');
      expect(expectedGateForPhase(4)).toBe('gate-4');
      expect(expectedGateForPhase(5)).toBe('final');
    });

    it('returns null for non-gated phases', () => {
      expect(expectedGateForPhase(1)).toBeNull();
      expect(expectedGateForPhase(99)).toBeNull();
    });
  });
});
