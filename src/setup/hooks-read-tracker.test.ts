/**
 * Unit tests for PostToolUse Read tracker hook.
 *
 * TDD GATE: Imports from a module that does NOT exist yet.
 * Tests should fail with import errors, not logic errors.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { processReadTracker } from './hooks-read-tracker.js';

describe('Read Tracker Hook (PostToolUse)', () => {
  let repoRoot: string;
  let stateDir: string;
  let stateFile: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'read-tracker-'));
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

  function readState(): Record<string, unknown> {
    return JSON.parse(readFileSync(stateFile, 'utf-8'));
  }

  // ---- Safety invariants (required in every hook test file) ----

  describe('safety invariants', () => {
    it('returns {} when no state file exists', () => {
      const result = processReadTracker(repoRoot, 'Read', { file_path: '/some/file.ts' });
      expect(result).toEqual({});
    });

    it('returns {} when state file is corrupted', () => {
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(stateFile, '<<<not json>>>', 'utf-8');

      const result = processReadTracker(repoRoot, 'Read', { file_path: '/some/file.ts' });
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

      const result = processReadTracker(repoRoot, 'Read', {
        file_path: '.claude/skills/compound/work/SKILL.md',
      });
      expect(result).toEqual({});
    });

    it('never throws — returns {} on any error', () => {
      expect(() => processReadTracker('', '', {})).not.toThrow();
      const result = processReadTracker('', '', {});
      expect(result).toEqual({});
    });
  });

  // ---- Behavior tests ----

  describe('non-Read tools', () => {
    it('returns {} for Edit tool', () => {
      writeState({
        lfg_active: true,
        current_phase: 'work',
        skills_read: [],
        gates_passed: [],
        started_at: new Date().toISOString(),
      });

      const result = processReadTracker(repoRoot, 'Edit', { file_path: '/src/file.ts' });
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

      const result = processReadTracker(repoRoot, 'Bash', { command: 'ls' });
      expect(result).toEqual({});
    });
  });

  describe('Read of non-skill file', () => {
    it('does not modify skills_read', () => {
      writeState({
        lfg_active: true,
        current_phase: 'work',
        skills_read: [],
        gates_passed: [],
        started_at: new Date().toISOString(),
      });

      processReadTracker(repoRoot, 'Read', { file_path: '/src/feature.ts' });

      const state = readState();
      expect(state.skills_read).toEqual([]);
    });
  });

  describe('Read of skill file', () => {
    it('appends skill file path to skills_read', () => {
      writeState({
        lfg_active: true,
        current_phase: 'work',
        skills_read: [],
        gates_passed: [],
        started_at: new Date().toISOString(),
      });

      processReadTracker(repoRoot, 'Read', {
        file_path: '.claude/skills/compound/work/SKILL.md',
      });

      const state = readState();
      expect(state.skills_read).toContain('.claude/skills/compound/work/SKILL.md');
    });

    it('does not add duplicates on repeated reads', () => {
      writeState({
        lfg_active: true,
        current_phase: 'work',
        skills_read: [],
        gates_passed: [],
        started_at: new Date().toISOString(),
      });

      const skillPath = '.claude/skills/compound/work/SKILL.md';
      processReadTracker(repoRoot, 'Read', { file_path: skillPath });
      processReadTracker(repoRoot, 'Read', { file_path: skillPath });

      const state = readState();
      const occurrences = (state.skills_read as string[]).filter((s) => s === skillPath);
      expect(occurrences).toHaveLength(1);
    });

    it('tracks multiple different skill files', () => {
      writeState({
        lfg_active: true,
        current_phase: 'work',
        skills_read: [],
        gates_passed: [],
        started_at: new Date().toISOString(),
      });

      processReadTracker(repoRoot, 'Read', {
        file_path: '.claude/skills/compound/work/SKILL.md',
      });
      processReadTracker(repoRoot, 'Read', {
        file_path: '.claude/skills/compound/review/SKILL.md',
      });

      const state = readState();
      expect(state.skills_read).toContain('.claude/skills/compound/work/SKILL.md');
      expect(state.skills_read).toContain('.claude/skills/compound/review/SKILL.md');
    });
  });
});
