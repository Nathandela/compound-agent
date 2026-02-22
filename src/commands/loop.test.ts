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

  // JSON-first bd parsing: jq as primary, python3 as fallback
  it('uses jq as primary JSON parser', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('jq');
  });

  it('defines a parse_json helper function', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toMatch(/parse_json\s*\(\)/);
  });

  it('falls back to python3 when jq is unavailable', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    // Should still contain python3 as fallback path
    expect(script).toContain('python3');
  });

  it('does not require python3 as a hard dependency', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    // Should NOT die solely because python3 is missing -- jq is primary
    // The die message should mention jq as an alternative (i.e., "jq or python3")
    expect(script).not.toMatch(/die "python3 required/);
    expect(script).toMatch(/jq or python3/);
  });

  it('uses bd show --json for epic status check', () => {
    const script = generateLoopScript({
      epics: ['epic-1'],
      maxRetries: 1,
      model: 'claude-opus-4-6',
    });
    expect(script).toContain('bd show "$epic_id" --json');
  });

  it('uses bd list --json for dynamic epic selection', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    expect(script).toContain('bd list --type=epic --ready --json');
  });

  it('parses epic status from JSON via parse_json in explicit mode', () => {
    const script = generateLoopScript({
      epics: ['epic-1'],
      maxRetries: 1,
      model: 'claude-opus-4-6',
    });
    // parse_json should extract .status from bd show --json output
    expect(script).toMatch(/parse_json\s+['"]\.status['"]/);
  });

  it('parses epic id from JSON array using jq in dynamic mode', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    // jq path should extract .id from bd list --json array items
    expect(script).toMatch(/jq\s.*\.id/);
  });

  it('detects json parser availability at script startup', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    // Should set a variable indicating which parser to use
    expect(script).toMatch(/JSON_PARSER|HAS_JQ/);
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

  // P0: LOOP_DRY_RUN safe expansion under set -u
  it('uses safe expansion for LOOP_DRY_RUN', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    // Must use ${VAR:-} syntax, not bare $VAR, for set -u compatibility
    expect(script).toContain('${LOOP_DRY_RUN:-}');
    // Should NOT have bare $LOOP_DRY_RUN in conditionals
    expect(script).not.toMatch(/\[ -n "\$LOOP_DRY_RUN" \]/);
  });

  // P0: Prevent reprocessing same epic forever
  it('tracks processed epics to prevent reprocessing', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    expect(script).toContain('PROCESSED');
  });

  it('skips processed epics in explicit mode', () => {
    const script = generateLoopScript({
      epics: ['epic-1'],
      maxRetries: 1,
      model: 'claude-opus-4-6',
    });
    // get_next_epic should check PROCESSED before returning epic
    expect(script).toMatch(/PROCESSED.*epic_id|epic_id.*PROCESSED/s);
  });

  it('appends epic to PROCESSED after processing', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    expect(script).toMatch(/PROCESSED=.*EPIC_ID/);
  });

  // P1: Input validation
  it('rejects NaN maxRetries', () => {
    expect(() => generateLoopScript({ maxRetries: NaN, model: 'claude-opus-4-6' }))
      .toThrow(/maxRetries/i);
  });

  it('rejects negative maxRetries', () => {
    expect(() => generateLoopScript({ maxRetries: -1, model: 'claude-opus-4-6' }))
      .toThrow(/maxRetries/i);
  });

  it('rejects epic IDs with shell metacharacters', () => {
    expect(() => generateLoopScript({
      epics: ['$(rm -rf /)'],
      maxRetries: 1,
      model: 'claude-opus-4-6',
    })).toThrow(/epic.*id/i);
  });

  it('accepts valid epic IDs with alphanumeric, hyphens, underscores', () => {
    expect(() => generateLoopScript({
      epics: ['learning_agent-jlrh', 'beads-123', 'my.epic'],
      maxRetries: 1,
      model: 'claude-opus-4-6',
    })).not.toThrow();
  });
});

describe('ca loop CLI', { tags: ['integration'] }, () => {
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

  // P2: Overwrite refusal should not silently succeed
  it('does not overwrite file on refusal', () => {
    const outputPath = join(getTempDir(), 'infinity-loop.sh');
    writeFileSync(outputPath, 'existing content');

    runCli('loop');
    const content = readFileSync(outputPath, 'utf-8');
    expect(content).toBe('existing content');
  });

  // P1: Invalid max-retries rejected at CLI level
  it('rejects invalid max-retries', () => {
    const { combined } = runCli('loop --max-retries abc');
    expect(combined).toMatch(/invalid|retries|integer/i);
  });

  // P1: Invalid epic IDs rejected at CLI level
  it('rejects invalid epic IDs', () => {
    const { combined } = runCli('loop --epics "$(bad)"');
    expect(combined).toMatch(/invalid|epic.*id/i);
  });
});
