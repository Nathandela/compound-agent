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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Command } from 'commander';

import {
  cleanPhaseState,
  expectedGateForPhase,
  getPhaseState,
  initPhaseState,
  PHASE_STATE_MAX_AGE_MS,
  recordGatePassed,
  registerPhaseCheckCommand,
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
      expect(state.cookit_active).toBe(true);
      expect(state.epic_id).toBe('learning_agent-5dfm');
      expect(state.current_phase).toBe('spec-dev');
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
      expect(state.current_phase).toBe('spec-dev');
      expect(state.phase_index).toBe(1);
    });
  });

  describe('getPhaseState', () => {
    it('returns state when file exists', () => {
      initPhaseState(repoRoot, 'learning_agent-5dfm');
      const state = getPhaseState(repoRoot);

      expect(state).not.toBeNull();
      expect(state!.cookit_active).toBe(true);
      expect(state!.current_phase).toBe('spec-dev');
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

  describe('getPhaseState TTL', () => {
    it('returns null and deletes state file when state is older than 72 hours', () => {
      initPhaseState(repoRoot, 'test-epic');

      const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
      const old = new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString();
      state.started_at = old;
      writeFileSync(stateFile, JSON.stringify(state), 'utf-8');

      expect(getPhaseState(repoRoot)).toBeNull();
      expect(existsSync(stateFile)).toBe(false);
    });

    it('returns state when within 72 hour window', () => {
      initPhaseState(repoRoot, 'test-epic');

      const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
      const recent = new Date(Date.now() - 71 * 60 * 60 * 1000).toISOString();
      state.started_at = recent;
      writeFileSync(stateFile, JSON.stringify(state), 'utf-8');

      const result = getPhaseState(repoRoot);
      expect(result).not.toBeNull();
      expect(result!.epic_id).toBe('test-epic');
    });

    it('returns freshly initialized state (within TTL)', () => {
      initPhaseState(repoRoot, 'test-epic');
      const result = getPhaseState(repoRoot);
      expect(result).not.toBeNull();
    });

    it('exports PHASE_STATE_MAX_AGE_MS as 72 hours in milliseconds', () => {
      expect(PHASE_STATE_MAX_AGE_MS).toBe(72 * 60 * 60 * 1000);
    });
  });

  describe('updatePhaseState', () => {
    it('merges partial updates into existing state', () => {
      initPhaseState(repoRoot, 'learning_agent-5dfm');
      updatePhaseState(repoRoot, { current_phase: 'work', phase_index: 3 });

      const state = getPhaseState(repoRoot);
      expect(state!.current_phase).toBe('work');
      expect(state!.phase_index).toBe(3);
      expect(state!.cookit_active).toBe(true);
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

describe('registerPhaseCheckCommand respects COMPOUND_AGENT_ROOT', () => {
  let targetDir: string;
  const originalEnv = process.env['COMPOUND_AGENT_ROOT'];

  beforeEach(async () => {
    targetDir = await mkdtemp(join(tmpdir(), 'phase-root-'));
    process.env['COMPOUND_AGENT_ROOT'] = targetDir;
  });

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env['COMPOUND_AGENT_ROOT'];
    } else {
      process.env['COMPOUND_AGENT_ROOT'] = originalEnv;
    }
    await rm(targetDir, { recursive: true, force: true });
  });

  it('writes state file to COMPOUND_AGENT_ROOT, not process.cwd()', async () => {
    const program = new Command();
    program.exitOverride();
    registerPhaseCheckCommand(program);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      await program.parseAsync(['node', 'ca', 'phase-check', 'init', 'test-epic']);
    } finally {
      consoleSpy.mockRestore();
    }

    const stateFile = join(targetDir, '.claude', '.ca-phase-state.json');
    expect(existsSync(stateFile)).toBe(true);

    const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
    expect(state.epic_id).toBe('test-epic');
    expect(state.cookit_active).toBe(true);
  });
});
