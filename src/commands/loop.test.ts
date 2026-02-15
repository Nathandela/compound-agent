/**
 * Tests for the `ca loop` command (infinity loop script generator).
 */

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { generateLoopScript } from './loop.js';
import { setupCliTestContext } from '../test-utils.js';

describe('generateLoopScript', () => {
  it('generates valid bash with shebang', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toMatch(/^#!\/usr\/bin\/env bash/);
  });

  it('includes MAX_RETRIES from options', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('MAX_RETRIES=3');
  });

  it('includes MODEL from options', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('MODEL="claude-opus-4-6"');
  });

  it('sets EPIC_IDS when epics provided', () => {
    const script = generateLoopScript({
      epics: ['id-abc', 'id-def'],
      maxRetries: 3,
      model: 'claude-opus-4-6',
    });
    expect(script).toContain('EPIC_IDS="id-abc id-def"');
  });

  it('leaves EPIC_IDS empty when no epics', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('EPIC_IDS=""');
  });

  it('prompt includes ca load-session', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('ca load-session');
  });

  it('prompt includes bd show', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('bd show');
  });

  it('prompt includes compound:lfg', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('compound:lfg');
  });

  it('includes EPIC_COMPLETE marker', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('EPIC_COMPLETE');
  });

  it('includes EPIC_FAILED marker', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('EPIC_FAILED');
  });

  it('uses bd list for dynamic epic selection', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('bd list --type=epic --ready');
  });

  it('checks for python3 availability', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('python3');
  });

  it('supports dry run mode', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('LOOP_DRY_RUN');
  });

  it('default max retries is reflected', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    expect(script).toContain('MAX_RETRIES=1');
  });

  it('includes HUMAN_REQUIRED marker in prompt', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('HUMAN_REQUIRED');
  });

  it('prompt instructs to log reason with HUMAN_REQUIRED', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('HUMAN_REQUIRED:');
  });

  it('main loop detects HUMAN_REQUIRED and skips epic', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    // Should grep for HUMAN_REQUIRED in log and not retry
    expect(script).toMatch(/grep.*HUMAN_REQUIRED/);
  });

  it('main loop logs human-required reason to beads', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('bd update');
    expect(script).toMatch(/HUMAN_REQUIRED.*bd update|bd update.*HUMAN_REQUIRED/s);
  });

  it('tracks SKIPPED count in summary', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('SKIPPED');
  });
});

describe('ca loop CLI', () => {
  const { getTempDir, runCli } = setupCliTestContext();

  it('writes script to default output path', () => {
    runCli('loop');
    const outputPath = join(getTempDir(), 'infinity-loop.sh');
    expect(existsSync(outputPath)).toBe(true);
  });

  it('writes script to custom output path', () => {
    runCli('loop -o custom.sh');
    const outputPath = join(getTempDir(), 'custom.sh');
    expect(existsSync(outputPath)).toBe(true);
  });

  it('generated script is executable', () => {
    runCli('loop');
    const outputPath = join(getTempDir(), 'infinity-loop.sh');
    const stats = statSync(outputPath);
    // Check owner execute bit (0o100)
    expect(stats.mode & 0o100).toBeTruthy();
  });

  it('refuses overwrite without --force', () => {
    const outputPath = join(getTempDir(), 'infinity-loop.sh');
    writeFileSync(outputPath, 'existing content');

    const { combined } = runCli('loop');
    expect(combined).toMatch(/exist|overwrite|force/i);
  });

  it('overwrites with --force', () => {
    const outputPath = join(getTempDir(), 'infinity-loop.sh');
    writeFileSync(outputPath, 'existing content');

    const { combined } = runCli('loop --force');
    const content = readFileSync(outputPath, 'utf-8');
    expect(content).not.toBe('existing content');
    expect(content).toMatch(/^#!\/usr\/bin\/env bash/);
  });

  it('passes epic IDs to generated script', () => {
    runCli('loop --epics abc def');
    const outputPath = join(getTempDir(), 'infinity-loop.sh');
    const content = readFileSync(outputPath, 'utf-8');
    expect(content).toContain('abc');
    expect(content).toContain('def');
  });
});
