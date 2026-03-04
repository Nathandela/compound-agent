/**
 * CLI integration tests for the phase-check command.
 *
 * TDD GATE: Tests the CLI interface that does NOT exist yet.
 * Should fail with missing command errors.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cleanupCliTestDir, runCli, setupCliTestDir } from '../test-utils.js';

describe('phase-check CLI', { tags: ['hooks', 'integration'] }, () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupCliTestDir();
  });

  afterEach(async () => {
    await cleanupCliTestDir(tempDir);
  });

  describe('init subcommand', () => {
    it('creates state file and exits 0', () => {
      const { combined } = runCli('phase-check init learning_agent-5dfm', tempDir);
      expect(combined).not.toMatch(/error/i);

      const stateFile = join(tempDir, '.claude', '.ca-phase-state.json');
      expect(existsSync(stateFile)).toBe(true);
    });

    it('outputs confirmation message', () => {
      const { combined } = runCli('phase-check init learning_agent-5dfm', tempDir);
      expect(combined.toLowerCase()).toMatch(/init|started|active/i);
    });
  });

  describe('status subcommand', () => {
    it('outputs current state as JSON when state exists', () => {
      runCli('phase-check init learning_agent-5dfm', tempDir);
      const { stdout } = runCli('phase-check status --json', tempDir);

      const state = JSON.parse(stdout);
      expect(state.lfg_active).toBe(true);
      expect(state.epic_id).toBe('learning_agent-5dfm');
      expect(state.current_phase).toBe('spec-dev');
    });

    it('outputs lfg_active false when no state file exists', () => {
      const { stdout } = runCli('phase-check status --json', tempDir);

      const state = JSON.parse(stdout);
      expect(state.lfg_active).toBe(false);
    });

    it('outputs human-readable status by default', () => {
      runCli('phase-check init learning_agent-5dfm', tempDir);
      const { combined } = runCli('phase-check status', tempDir);
      expect(combined).toContain('Active LFG Session');
      expect(combined).toContain('learning_agent-5dfm');
    });
  });

  describe('clean subcommand', () => {
    it('removes state file', () => {
      runCli('phase-check init learning_agent-5dfm', tempDir);
      const stateFile = join(tempDir, '.claude', '.ca-phase-state.json');
      expect(existsSync(stateFile)).toBe(true);

      runCli('phase-check clean', tempDir);
      expect(existsSync(stateFile)).toBe(false);
    });

    it('exits 0 when no state file exists', () => {
      const { combined } = runCli('phase-check clean', tempDir);
      expect(combined).not.toMatch(/error/i);
    });

    it('phase-clean alias removes state file', () => {
      runCli('phase-check init learning_agent-5dfm', tempDir);
      const stateFile = join(tempDir, '.claude', '.ca-phase-state.json');
      expect(existsSync(stateFile)).toBe(true);

      runCli('phase-clean', tempDir);
      expect(existsSync(stateFile)).toBe(false);
    });
  });

  describe('gate subcommand', () => {
    it('records gate passed', () => {
      runCli('phase-check init learning_agent-5dfm', tempDir);
      runCli('phase-check gate post-plan', tempDir);

      const { stdout } = runCli('phase-check status --json', tempDir);
      const state = JSON.parse(stdout);
      expect(state.gates_passed).toContain('post-plan');
    });

    it('cleans state when final gate is recorded', () => {
      runCli('phase-check init learning_agent-5dfm', tempDir);

      const { combined } = runCli('phase-check gate final', tempDir);
      expect(combined).toContain('Phase state cleaned');

      const stateFile = join(tempDir, '.claude', '.ca-phase-state.json');
      expect(existsSync(stateFile)).toBe(false);
    });
  });

  describe('start subcommand', () => {
    it('updates phase and phase index', () => {
      runCli('phase-check init learning_agent-5dfm', tempDir);
      runCli('phase-check start review', tempDir);

      const { stdout } = runCli('phase-check status --json', tempDir);
      const state = JSON.parse(stdout);
      expect(state.current_phase).toBe('review');
      expect(state.phase_index).toBe(4);
    });
  });

  describe('--dry-run flag', () => {
    it('logs what it would do without creating file', () => {
      const { combined } = runCli('phase-check --dry-run init learning_agent-5dfm', tempDir);
      expect(combined.toLowerCase()).toMatch(/dry.run|would/i);

      const stateFile = join(tempDir, '.claude', '.ca-phase-state.json');
      expect(existsSync(stateFile)).toBe(false);
    });
  });

  describe('error handling', () => {
    it('shows error for invalid subcommand', () => {
      const { combined } = runCli('phase-check invalid-cmd', tempDir);
      expect(combined.toLowerCase()).toMatch(/unknown|invalid|error/i);
    });

    it('shows error for invalid phase', () => {
      runCli('phase-check init learning_agent-5dfm', tempDir);
      const { combined } = runCli('phase-check start invalid-phase', tempDir);
      expect(combined.toLowerCase()).toMatch(/invalid phase|valid phases|error/);
    });

    it('shows error for invalid gate', () => {
      runCli('phase-check init learning_agent-5dfm', tempDir);
      const { combined } = runCli('phase-check gate bad-gate', tempDir);
      expect(combined.toLowerCase()).toMatch(/invalid gate|valid gates|error/);
    });
  });
});
