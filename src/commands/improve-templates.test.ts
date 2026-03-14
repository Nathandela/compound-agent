/**
 * Tests for improve-templates.ts (improvement loop bash templates).
 *
 * Each build*() function must produce valid bash that passes `bash -n`.
 */

import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  buildTopicDiscovery,
  buildImprovePrompt,
  buildImproveSessionRunner,
  buildImproveMarkerDetection,
  buildImproveObservability,
  buildImproveMainLoop,
} from './improve-templates.js';

/** Wrap a bash fragment in a minimal script for syntax checking. */
function wrapForSyntaxCheck(fragment: string): string {
  return `#!/usr/bin/env bash\nset -euo pipefail\n${fragment}\n`;
}

/** Assert a bash fragment passes /bin/bash -n syntax check. */
function assertBashSyntax(fragment: string, label: string): void {
  const script = wrapForSyntaxCheck(fragment);
  const tmpFile = join('/tmp', `improve-syntax-${label}-${Date.now()}.sh`);
  writeFileSync(tmpFile, script);
  try {
    execSync(`/bin/bash -n "${tmpFile}"`, { encoding: 'utf-8' });
  } finally {
    try { execSync(`rm -f "${tmpFile}"`); } catch { /* cleanup */ }
  }
}

// ========================================================================
// buildTopicDiscovery
// ========================================================================

describe('buildTopicDiscovery', () => {
  it('passes bash -n syntax check', () => {
    assertBashSyntax(buildTopicDiscovery(), 'topic-discovery');
  });

  it('contains improve/*.md glob pattern', () => {
    expect(buildTopicDiscovery()).toContain('*.md');
  });

  it('defines get_topics function', () => {
    expect(buildTopicDiscovery()).toMatch(/get_topics\s*\(\)/);
  });

  it('filters to .md files only', () => {
    const output = buildTopicDiscovery();
    expect(output).toContain('-f');
  });

  it('extracts topic name from filename (basename without .md)', () => {
    const output = buildTopicDiscovery();
    expect(output).toContain('basename');
    expect(output).toContain('.md');
  });

  it('uses TOPIC_FILTER when set to select specific topics', () => {
    const output = buildTopicDiscovery();
    expect(output).toContain('TOPIC_FILTER');
  });

  it('warns when a filtered topic file is missing', () => {
    const output = buildTopicDiscovery();
    expect(output).toContain('WARN');
    expect(output).toContain('not found');
  });
});

// ========================================================================
// buildImprovePrompt
// ========================================================================

describe('buildImprovePrompt', () => {
  it('passes bash -n syntax check', () => {
    assertBashSyntax(buildImprovePrompt(), 'improve-prompt');
  });

  it('defines build_improve_prompt function', () => {
    expect(buildImprovePrompt()).toMatch(/build_improve_prompt\s*\(\)/);
  });

  it('reads the .md file content via cat (streamed, not interpolated in heredoc)', () => {
    const output = buildImprovePrompt();
    expect(output).toContain('cat "$program_file"');
  });

  it('includes IMPROVED marker instruction', () => {
    expect(buildImprovePrompt()).toContain('IMPROVED');
  });

  it('includes NO_IMPROVEMENT marker instruction', () => {
    expect(buildImprovePrompt()).toContain('NO_IMPROVEMENT');
  });

  it('includes FAILED marker instruction', () => {
    expect(buildImprovePrompt()).toContain('FAILED');
  });

  it('includes git diff instruction for the agent', () => {
    expect(buildImprovePrompt()).toContain('git diff');
  });
});

// ========================================================================
// buildImproveSessionRunner
// ========================================================================

describe('buildImproveSessionRunner', () => {
  it('passes bash -n syntax check', () => {
    assertBashSyntax(buildImproveSessionRunner(), 'improve-session-runner');
  });

  it('uses --dangerously-skip-permissions', () => {
    expect(buildImproveSessionRunner()).toContain('--dangerously-skip-permissions');
  });

  it('uses --output-format stream-json', () => {
    expect(buildImproveSessionRunner()).toContain('--output-format stream-json');
  });

  it('uses --verbose', () => {
    expect(buildImproveSessionRunner()).toContain('--verbose');
  });

  it('writes to $TRACEFILE for trace logging', () => {
    expect(buildImproveSessionRunner()).toContain('$TRACEFILE');
  });

  it('calls build_improve_prompt', () => {
    expect(buildImproveSessionRunner()).toContain('build_improve_prompt');
  });

  it('calls detect_improve_marker', () => {
    expect(buildImproveSessionRunner()).toContain('detect_improve_marker');
  });
});

// ========================================================================
// buildImproveMarkerDetection
// ========================================================================

describe('buildImproveMarkerDetection', () => {
  it('passes bash -n syntax check', () => {
    assertBashSyntax(buildImproveMarkerDetection(), 'improve-marker-detection');
  });

  it('defines detect_improve_marker function', () => {
    expect(buildImproveMarkerDetection()).toMatch(/detect_improve_marker\s*\(\)/);
  });

  it('checks for anchored ^IMPROVED$ in logfile', () => {
    expect(buildImproveMarkerDetection()).toMatch(/grep.*\^IMPROVED\$/);
  });

  it('checks for anchored ^NO_IMPROVEMENT$ in logfile', () => {
    expect(buildImproveMarkerDetection()).toMatch(/grep.*\^NO_IMPROVEMENT\$/);
  });

  it('checks for anchored ^FAILED$ in logfile', () => {
    expect(buildImproveMarkerDetection()).toMatch(/grep.*\^FAILED\$/);
  });

  it('falls back to unanchored trace check', () => {
    const output = buildImproveMarkerDetection();
    // Should have a tracefile section with unanchored grep
    expect(output).toContain('tracefile');
    // Unanchored checks (no ^ or $) for fallback
    expect(output).toMatch(/grep.*"IMPROVED"/);
  });

  it('returns improved, no_improvement, failed, or none', () => {
    const output = buildImproveMarkerDetection();
    expect(output).toContain('"improved"');
    expect(output).toContain('"no_improvement"');
    expect(output).toContain('"failed"');
    expect(output).toContain('"none"');
  });
});

// ========================================================================
// buildImproveObservability
// ========================================================================

describe('buildImproveObservability', () => {
  it('passes bash -n syntax check', () => {
    assertBashSyntax(buildImproveObservability(), 'improve-observability');
  });

  it('defines write_improve_status function', () => {
    expect(buildImproveObservability()).toMatch(/write_improve_status\s*\(\)/);
  });

  it('defines log_improve_result function', () => {
    expect(buildImproveObservability()).toMatch(/log_improve_result\s*\(\)/);
  });

  it('writes to .improve-status.json', () => {
    expect(buildImproveObservability()).toContain('.improve-status.json');
  });

  it('writes to improvement-log.jsonl', () => {
    expect(buildImproveObservability()).toContain('improvement-log.jsonl');
  });

  it('includes topic name in status', () => {
    expect(buildImproveObservability()).toContain('topic');
  });
});

// ========================================================================
// buildImproveMainLoop
// ========================================================================

describe('buildImproveMainLoop', () => {
  const defaultOpts = { maxIters: 3, timeBudget: 0 };

  it('passes bash -n syntax check', () => {
    assertBashSyntax(buildImproveMainLoop(defaultOpts), 'improve-main-loop');
  });

  it('accepts maxIters parameter', () => {
    const output = buildImproveMainLoop({ maxIters: 5, timeBudget: 0 });
    expect(output).toContain('MAX_ITERS=5');
  });

  it('accepts timeBudget parameter (seconds, 0 = unlimited)', () => {
    const output = buildImproveMainLoop({ maxIters: 3, timeBudget: 3600 });
    expect(output).toContain('TIME_BUDGET=3600');
  });

  it('iterates over topics from get_topics', () => {
    const output = buildImproveMainLoop(defaultOpts);
    expect(output).toContain('get_topics');
  });

  it('runs up to maxIters iterations for each topic', () => {
    const output = buildImproveMainLoop(defaultOpts);
    expect(output).toContain('MAX_ITERS');
  });

  it('git tags improve/<topic>/iter-<i>/pre before each iteration', () => {
    const output = buildImproveMainLoop(defaultOpts);
    expect(output).toMatch(/improve\/.*iter/);
  });

  it('on IMPROVED: keeps commit and continues', () => {
    const output = buildImproveMainLoop(defaultOpts);
    expect(output).toContain('improved)');
  });

  it('on NO_IMPROVEMENT: git reset --hard to tag', () => {
    const output = buildImproveMainLoop(defaultOpts);
    expect(output).toContain('git reset --hard');
    expect(output).toContain('no_improvement)');
  });

  it('on FAILED: git reset --hard to tag and stops topic', () => {
    const output = buildImproveMainLoop(defaultOpts);
    expect(output).toContain('failed)');
  });

  it('tracks consecutive no-improvement for diminishing returns', () => {
    const output = buildImproveMainLoop(defaultOpts);
    expect(output).toContain('CONSECUTIVE_NO_IMPROVE');
  });

  it('checks time budget', () => {
    const output = buildImproveMainLoop({ maxIters: 3, timeBudget: 1800 });
    expect(output).toContain('TIME_BUDGET');
    expect(output).toContain('ELAPSED');
  });

  it('supports IMPROVE_DRY_RUN env var with safe expansion', () => {
    const output = buildImproveMainLoop(defaultOpts);
    expect(output).toContain('${IMPROVE_DRY_RUN:-}');
  });

  it('logs summary at end', () => {
    const output = buildImproveMainLoop(defaultOpts);
    expect(output).toContain('IMPROVED_COUNT');
    expect(output).toContain('FAILED_TOPICS');
  });

  it('standalone mode exits 0 on success, 1 on any failure', () => {
    const output = buildImproveMainLoop(defaultOpts);
    expect(output).toContain('exit 0');
    expect(output).toContain('exit 1');
  });

  // --- C2: embedded mode (for ca loop --improve) ---
  it('embedded mode does not call exit', () => {
    const output = buildImproveMainLoop({ ...defaultOpts, embedded: true });
    expect(output).not.toContain('exit 0');
    expect(output).not.toContain('exit 1');
  });

  it('embedded mode sets IMPROVE_RESULT variable instead of exit', () => {
    const output = buildImproveMainLoop({ ...defaultOpts, embedded: true });
    expect(output).toContain('IMPROVE_RESULT=');
  });

  it('embedded mode passes bash -n syntax check', () => {
    assertBashSyntax(buildImproveMainLoop({ ...defaultOpts, embedded: true }), 'improve-main-loop-embedded');
  });

  // --- C3: dry-run must not create git tags ---
  it('dry-run check occurs before git tag creation', () => {
    const output = buildImproveMainLoop(defaultOpts);
    const dryRunPos = output.indexOf('IMPROVE_DRY_RUN');
    const gitTagPos = output.indexOf('git tag');
    expect(dryRunPos).toBeGreaterThan(-1);
    expect(gitTagPos).toBeGreaterThan(-1);
    expect(dryRunPos).toBeLessThan(gitTagPos);
  });

  // --- H1: tag lifecycle ---
  it('uses git tag -f to avoid collision on re-run', () => {
    const output = buildImproveMainLoop(defaultOpts);
    expect(output).toContain('git tag -f');
  });

  it('deletes tag on successful improvement (no tag pollution)', () => {
    const output = buildImproveMainLoop(defaultOpts);
    // The improved case should also delete the tag
    const improvedCase = output.slice(output.indexOf('(improved)'));
    const nextCase = improvedCase.indexOf('(no_improvement)');
    const improvedBlock = improvedCase.slice(0, nextCase);
    expect(improvedBlock).toContain('git tag -d');
  });

  // --- H2: git clean on rollback ---
  it('runs git clean -fd after git reset --hard on rollback', () => {
    const output = buildImproveMainLoop(defaultOpts);
    // Every git reset --hard should be followed by git clean -fd
    const resetPositions = [...output.matchAll(/git reset --hard/g)].map(m => m.index);
    const cleanPositions = [...output.matchAll(/git clean -fd/g)].map(m => m.index);
    expect(cleanPositions.length).toBeGreaterThanOrEqual(resetPositions.length);
  });

  // --- H3: worktree-clean preflight ---
  it('checks for clean worktree before starting improve loop', () => {
    const output = buildImproveMainLoop(defaultOpts);
    expect(output).toContain('git diff --quiet');
  });

  // --- H5: NO_IMPROVEMENT is not counted as failure ---
  it('distinguishes NO_IMPROVEMENT from FAILED in topic result', () => {
    const output = buildImproveMainLoop(defaultOpts);
    // Topics with only NO_IMPROVEMENT should not increment FAILED_TOPICS
    expect(output).toContain('SKIPPED_TOPICS');
  });

  // --- M1: commit verification on IMPROVED ---
  it('warns if uncommitted changes detected after IMPROVED marker', () => {
    const output = buildImproveMainLoop(defaultOpts);
    const improvedCase = output.slice(output.indexOf('(improved)'));
    const nextCase = improvedCase.indexOf('(no_improvement)');
    const improvedBlock = improvedCase.slice(0, nextCase);
    expect(improvedBlock).toContain('git diff --quiet');
  });
});

// ========================================================================
// Full composition
// ========================================================================

describe('full improve script composition', () => {
  it('all fragments compose into valid bash', () => {
    const full = [
      buildTopicDiscovery(),
      buildImprovePrompt(),
      buildImproveMarkerDetection(),
      buildImproveObservability(),
      buildImproveSessionRunner(),
      buildImproveMainLoop({ maxIters: 5, timeBudget: 3600 }),
    ].join('\n');
    assertBashSyntax(full, 'full-improve-composition');
  });
});
