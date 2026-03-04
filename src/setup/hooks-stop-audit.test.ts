/**
 * Unit tests for Stop hook phase audit handler.
 *
 * TDD GATE: Imports from a module that does NOT exist yet.
 * Tests should fail with import errors, not logic errors.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { processStopAudit } from './hooks-stop-audit.js';

describe('Stop Audit Hook', () => {
  let repoRoot: string;
  let stateDir: string;
  let stateFile: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'stop-audit-'));
    stateDir = join(repoRoot, '.claude');
    stateFile = join(stateDir, '.ca-phase-state.json');
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  function writeState(state: Record<string, unknown>): void {
    const base = {
      lfg_active: true,
      epic_id: 'learning_agent-5dfm',
      current_phase: 'work',
      phase_index: 3,
      skills_read: [],
      gates_passed: [],
      started_at: new Date().toISOString(),
    };
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(stateFile, JSON.stringify({ ...base, ...state }), 'utf-8');
  }

  // ---- Safety invariants (required in every hook test file) ----

  describe('safety invariants', () => {
    it('returns {} when no state file exists', () => {
      const result = processStopAudit(repoRoot);
      expect(result).toEqual({});
    });

    it('returns {} when state file is corrupted', () => {
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(stateFile, '<<<not json>>>', 'utf-8');

      const result = processStopAudit(repoRoot);
      expect(result).toEqual({});
    });

    it('returns {} when lfg_active is false', () => {
      writeState({
        lfg_active: false,
        current_phase: 'work',
        skills_read: [],
        gates_passed: [],
        started_at: new Date().toISOString(),
      });

      const result = processStopAudit(repoRoot);
      expect(result).toEqual({});
    });

    it('never throws — returns {} on any error', () => {
      // Use a path that cannot exist to test error handling
      // (empty string resolves to cwd which may have valid state)
      const bogusRoot = '/tmp/.ca-nonexistent-' + Date.now();
      expect(() => processStopAudit(bogusRoot)).not.toThrow();
      const result = processStopAudit(bogusRoot);
      expect(result).toEqual({});
    });
  });

  // ---- Behavior tests ----

  describe('when stop_hook_active is true but no phase state exists', () => {
    it('returns {}', () => {
      writeState({});

      const result = processStopAudit(repoRoot, true);
      expect(result).toEqual({});
    });
  });

  describe('when gate is verified for current phase', () => {
    it('returns {} (allows stop)', () => {
      writeState({
        gates_passed: ['gate-3'],
      });

      const result = processStopAudit(repoRoot);
      expect(result).toEqual({});
    });
  });

  describe('when gate is NOT verified and completing', () => {
    it('returns continue:false with stopReason', () => {
      writeState({
        current_phase: 'review',
        phase_index: 4,
        skills_read: ['.claude/skills/compound/compound/SKILL.md'],
        gates_passed: [],
      });

      const result = processStopAudit(repoRoot);
      expect(result.continue).toBe(false);
      expect(result.stopReason).toBeDefined();
      expect(result.stopReason).toMatch(/PHASE GATE/i);
      expect(result.stopReason).toMatch(/gate-4/);
    });
  });

  describe('mid-phase (not transitioning)', () => {
    it('returns {} when no stop_hook_active flag', () => {
      writeState({
        current_phase: 'spec-dev',
        phase_index: 1,
      });

      const result = processStopAudit(repoRoot);
      expect(result).toEqual({});
    });

    it('returns {} when gated phase has no transition evidence yet', () => {
      writeState({
        current_phase: 'plan',
        phase_index: 2,
        skills_read: ['.claude/skills/compound/plan/SKILL.md'],
        gates_passed: [],
      });

      const result = processStopAudit(repoRoot);
      expect(result).toEqual({});
    });
  });
});
