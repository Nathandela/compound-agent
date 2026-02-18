/**
 * Unit tests for PreToolUse Edit/Write phase guard hook.
 *
 * TDD GATE: Imports from a module that does NOT exist yet.
 * Tests should fail with import errors, not logic errors.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { processPhaseGuard } from './hooks-phase-guard.js';

describe('Phase Guard Hook (PreToolUse)', () => {
  let repoRoot: string;
  let stateDir: string;
  let stateFile: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'phase-guard-'));
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
      const result = processPhaseGuard(repoRoot, 'Edit', { file_path: '/some/file.ts' });
      expect(result).toEqual({});
    });

    it('returns {} when state file is corrupted', () => {
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(stateFile, '<<<not json>>>', 'utf-8');

      const result = processPhaseGuard(repoRoot, 'Edit', { file_path: '/some/file.ts' });
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

      const result = processPhaseGuard(repoRoot, 'Edit', { file_path: '/some/file.ts' });
      expect(result).toEqual({});
    });

    it('never throws — returns {} on any error', () => {
      // Pass invalid arguments to trigger potential errors
      expect(() => processPhaseGuard('', '', {})).not.toThrow();
      const result = processPhaseGuard('', '', {});
      expect(result).toEqual({});
    });
  });

  // ---- Behavior tests ----

  describe('when phase skill was read', () => {
    it('returns {} (allows Edit)', () => {
      writeState({
        lfg_active: true,
        current_phase: 'work',
        skills_read: ['.claude/skills/compound/work/SKILL.md'],
        gates_passed: [],
        started_at: new Date().toISOString(),
      });

      const result = processPhaseGuard(repoRoot, 'Edit', { file_path: '/src/feature.ts' });
      expect(result).toEqual({});
    });

    it('returns {} (allows Write)', () => {
      writeState({
        lfg_active: true,
        current_phase: 'work',
        skills_read: ['.claude/skills/compound/work/SKILL.md'],
        gates_passed: [],
        started_at: new Date().toISOString(),
      });

      const result = processPhaseGuard(repoRoot, 'Write', { file_path: '/src/new-file.ts' });
      expect(result).toEqual({});
    });
  });

  describe('when phase skill was NOT read', () => {
    it('returns warning context for Edit', () => {
      writeState({
        lfg_active: true,
        current_phase: 'work',
        skills_read: [],
        gates_passed: [],
        started_at: new Date().toISOString(),
      });

      const result = processPhaseGuard(repoRoot, 'Edit', { file_path: '/src/feature.ts' });
      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput?.additionalContext).toMatch(/WARNING/i);
    });

    it('returns warning context for Write', () => {
      writeState({
        lfg_active: true,
        current_phase: 'plan',
        skills_read: [],
        gates_passed: [],
        started_at: new Date().toISOString(),
      });

      const result = processPhaseGuard(repoRoot, 'Write', { file_path: '/src/new.ts' });
      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput?.additionalContext).toMatch(/WARNING/i);
    });
  });

  describe('non-Edit/Write tools', () => {
    it('returns {} for Read tool', () => {
      writeState({
        lfg_active: true,
        current_phase: 'work',
        skills_read: [],
        gates_passed: [],
        started_at: new Date().toISOString(),
      });

      const result = processPhaseGuard(repoRoot, 'Read', { file_path: '/src/feature.ts' });
      expect(result).toEqual({});
    });

    it('returns {} for Bash tool', () => {
      writeState({
        lfg_active: true,
        current_phase: 'work',
        skills_read: [],
        gates_passed: [],
        started_at: new Date().toISOString(),
      });

      const result = processPhaseGuard(repoRoot, 'Bash', { command: 'ls' });
      expect(result).toEqual({});
    });
  });
});
