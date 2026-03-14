/**
 * Tests for the `ca improve` command (improvement loop script generator).
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { generateImproveScript } from './improve.js';
import { setupCliTestContext } from '../test-utils.js';

describe('generateImproveScript', () => {
  it('generates valid bash with shebang', () => {
    const script = generateImproveScript({ maxIters: 5, timeBudget: 0, model: 'claude-opus-4-6' });
    expect(script).toMatch(/^#!\/usr\/bin\/env bash/);
  });

  it('includes MAX_ITERS from options', () => {
    const script = generateImproveScript({ maxIters: 3, timeBudget: 0, model: 'claude-opus-4-6' });
    expect(script).toContain('MAX_ITERS=3');
  });

  it('includes TIME_BUDGET from options', () => {
    const script = generateImproveScript({ maxIters: 5, timeBudget: 600, model: 'claude-opus-4-6' });
    expect(script).toContain('TIME_BUDGET=600');
  });

  it('includes MODEL from options', () => {
    const script = generateImproveScript({ maxIters: 5, timeBudget: 0, model: 'claude-opus-4-6' });
    expect(script).toContain('MODEL="claude-opus-4-6"');
  });

  it('sets TOPIC_FILTER when topics provided', () => {
    const script = generateImproveScript({
      topics: ['linting', 'tests'],
      maxIters: 5,
      timeBudget: 0,
      model: 'claude-opus-4-6',
    });
    expect(script).toContain('TOPIC_FILTER="linting tests"');
  });

  it('leaves TOPIC_FILTER empty when no topics provided', () => {
    const script = generateImproveScript({ maxIters: 5, timeBudget: 0, model: 'claude-opus-4-6' });
    expect(script).toContain('TOPIC_FILTER=""');
  });

  it('includes IMPROVED marker in prompt', () => {
    const script = generateImproveScript({ maxIters: 5, timeBudget: 0, model: 'claude-opus-4-6' });
    expect(script).toContain('IMPROVED');
  });

  it('includes NO_IMPROVEMENT marker in prompt', () => {
    const script = generateImproveScript({ maxIters: 5, timeBudget: 0, model: 'claude-opus-4-6' });
    expect(script).toContain('NO_IMPROVEMENT');
  });

  it('includes FAILED marker in prompt', () => {
    const script = generateImproveScript({ maxIters: 5, timeBudget: 0, model: 'claude-opus-4-6' });
    expect(script).toContain('FAILED');
  });

  it('includes git tag for rollback', () => {
    const script = generateImproveScript({ maxIters: 5, timeBudget: 0, model: 'claude-opus-4-6' });
    expect(script).toContain('git tag');
  });

  it('includes git reset --hard for revert', () => {
    const script = generateImproveScript({ maxIters: 5, timeBudget: 0, model: 'claude-opus-4-6' });
    expect(script).toContain('git reset --hard');
  });

  it('supports dry run mode', () => {
    const script = generateImproveScript({ maxIters: 5, timeBudget: 0, model: 'claude-opus-4-6' });
    expect(script).toContain('IMPROVE_DRY_RUN');
  });

  it('uses safe expansion for IMPROVE_DRY_RUN', () => {
    const script = generateImproveScript({ maxIters: 5, timeBudget: 0, model: 'claude-opus-4-6' });
    expect(script).toContain('${IMPROVE_DRY_RUN:-}');
  });

  it('passes /bin/bash -n syntax check', () => {
    const script = generateImproveScript({ maxIters: 5, timeBudget: 0, model: 'claude-opus-4-6' });
    const tmpFile = join('/tmp', `improve-syntax-${Date.now()}.sh`);
    writeFileSync(tmpFile, script);
    try {
      execSync(`/bin/bash -n "${tmpFile}"`, { encoding: 'utf-8' });
    } finally {
      try { execSync(`rm -f "${tmpFile}"`); } catch { /* cleanup */ }
    }
  });

  it('includes improvement observability', () => {
    const script = generateImproveScript({ maxIters: 5, timeBudget: 0, model: 'claude-opus-4-6' });
    expect(script).toMatch(/write_improve_status\s*\(\)/);
    expect(script).toMatch(/log_improve_result\s*\(\)/);
  });

  it('includes extract_text function', () => {
    const script = generateImproveScript({ maxIters: 5, timeBudget: 0, model: 'claude-opus-4-6' });
    expect(script).toMatch(/extract_text\s*\(\)/);
  });

  it('includes detect_improve_marker function', () => {
    const script = generateImproveScript({ maxIters: 5, timeBudget: 0, model: 'claude-opus-4-6' });
    expect(script).toMatch(/detect_improve_marker\s*\(\)/);
  });

  it('includes get_topics function', () => {
    const script = generateImproveScript({ maxIters: 5, timeBudget: 0, model: 'claude-opus-4-6' });
    expect(script).toMatch(/get_topics\s*\(\)/);
  });

  // Input validation
  it('rejects NaN maxIters', () => {
    expect(() => generateImproveScript({ maxIters: NaN, timeBudget: 0, model: 'claude-opus-4-6' }))
      .toThrow(/maxIters/i);
  });

  it('rejects negative maxIters', () => {
    expect(() => generateImproveScript({ maxIters: -1, timeBudget: 0, model: 'claude-opus-4-6' }))
      .toThrow(/maxIters/i);
  });

  it('rejects zero maxIters', () => {
    expect(() => generateImproveScript({ maxIters: 0, timeBudget: 0, model: 'claude-opus-4-6' }))
      .toThrow(/maxIters/i);
  });

  it('rejects NaN timeBudget', () => {
    expect(() => generateImproveScript({ maxIters: 5, timeBudget: NaN, model: 'claude-opus-4-6' }))
      .toThrow(/timeBudget/i);
  });

  it('rejects negative timeBudget', () => {
    expect(() => generateImproveScript({ maxIters: 5, timeBudget: -1, model: 'claude-opus-4-6' }))
      .toThrow(/timeBudget/i);
  });

  it('rejects topics with shell metacharacters', () => {
    expect(() => generateImproveScript({
      topics: ['$(rm -rf /)'],
      maxIters: 5,
      timeBudget: 0,
      model: 'claude-opus-4-6',
    })).toThrow(/topic/i);
  });

  it('accepts valid topic names', () => {
    expect(() => generateImproveScript({
      topics: ['linting', 'test-coverage', 'dead_code'],
      maxIters: 5,
      timeBudget: 0,
      model: 'claude-opus-4-6',
    })).not.toThrow();
  });

  it('rejects model with shell metacharacters', () => {
    expect(() => generateImproveScript({
      maxIters: 5,
      timeBudget: 0,
      model: '"; rm -rf /; echo "',
    })).toThrow(/model/i);
  });

  it('accepts valid model names', () => {
    expect(() => generateImproveScript({ maxIters: 5, timeBudget: 0, model: 'claude-opus-4-6' })).not.toThrow();
    expect(() => generateImproveScript({ maxIters: 5, timeBudget: 0, model: 'claude-sonnet-4-6' })).not.toThrow();
    expect(() => generateImproveScript({ maxIters: 5, timeBudget: 0, model: 'org/model:latest' })).not.toThrow();
  });
});

describe('ca improve CLI', { tags: ['integration'] }, () => {
  const { getTempDir, runCli } = setupCliTestContext();

  it('writes script to default output path', () => {
    runCli('improve');
    const outputPath = join(getTempDir(), 'improvement-loop.sh');
    expect(existsSync(outputPath)).toBe(true);
  });

  it('writes script to custom output path', () => {
    runCli('improve -o custom.sh');
    const outputPath = join(getTempDir(), 'custom.sh');
    expect(existsSync(outputPath)).toBe(true);
  });

  it('generated script is executable', () => {
    runCli('improve');
    const outputPath = join(getTempDir(), 'improvement-loop.sh');
    const stats = statSync(outputPath);
    expect(stats.mode & 0o100).toBeTruthy();
  });

  it('refuses overwrite without --force', () => {
    const outputPath = join(getTempDir(), 'improvement-loop.sh');
    writeFileSync(outputPath, 'existing content');

    const { combined } = runCli('improve');
    expect(combined).toMatch(/exist|overwrite|force/i);
  });

  it('overwrites with --force', () => {
    const outputPath = join(getTempDir(), 'improvement-loop.sh');
    writeFileSync(outputPath, 'existing content');

    runCli('improve --force');
    const content = readFileSync(outputPath, 'utf-8');
    expect(content).not.toBe('existing content');
    expect(content).toMatch(/^#!\/usr\/bin\/env bash/);
  });

  it('passes topic names to generated script', () => {
    runCli('improve --topics linting tests');
    const outputPath = join(getTempDir(), 'improvement-loop.sh');
    const content = readFileSync(outputPath, 'utf-8');
    expect(content).toContain('linting');
    expect(content).toContain('tests');
  });

  it('rejects invalid max-iters', () => {
    const { combined } = runCli('improve --max-iters abc');
    expect(combined).toMatch(/invalid|iters|integer/i);
  });

  it('dry-run mode validates and prints plan without generating script', () => {
    const { combined } = runCli('improve --dry-run');
    expect(combined).toMatch(/plan|dry|improve/i);
    const outputPath = join(getTempDir(), 'improvement-loop.sh');
    expect(existsSync(outputPath)).toBe(false);
  });
});
