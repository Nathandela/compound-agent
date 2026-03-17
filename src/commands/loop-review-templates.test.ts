/**
 * Tests for loop-review-templates.ts (review phase bash templates).
 *
 * Each build*() function must produce valid bash that passes `bash -n`.
 */

import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  buildReviewConfig,
  buildReviewerDetection,
  buildSessionIdManagement,
  buildReviewPrompt,
  buildSpawnReviewers,
  buildImplementerPhase,
  buildReviewLoop,
} from './loop-review-templates.js';

/** Wrap a bash fragment in a minimal script for syntax checking. */
function wrapForSyntaxCheck(fragment: string): string {
  return `#!/usr/bin/env bash\nset -euo pipefail\n${fragment}\n`;
}

/** Assert a bash fragment passes /bin/bash -n syntax check. */
function assertBashSyntax(fragment: string, label: string): void {
  const script = wrapForSyntaxCheck(fragment);
  const tmpFile = join('/tmp', `review-syntax-${label}-${Date.now()}.sh`);
  writeFileSync(tmpFile, script);
  try {
    execSync(`/bin/bash -n "${tmpFile}"`, { encoding: 'utf-8' });
  } finally {
    try { execSync(`rm -f "${tmpFile}"`); } catch { /* cleanup */ }
  }
}

// ========================================================================
// buildReviewConfig
// ========================================================================

describe('buildReviewConfig', () => {
  it('passes bash -n syntax check', () => {
    const output = buildReviewConfig({
      reviewers: ['claude-sonnet', 'gemini'],
      maxReviewCycles: 3,
      reviewBlocking: false,
      reviewModel: 'claude-opus-4-6',
      reviewEvery: 2,
    });
    assertBashSyntax(output, 'review-config');
  });

  it('sets REVIEW_EVERY variable', () => {
    const output = buildReviewConfig({
      reviewers: ['claude-sonnet'],
      maxReviewCycles: 3,
      reviewBlocking: false,
      reviewModel: 'claude-opus-4-6',
      reviewEvery: 2,
    });
    expect(output).toContain('REVIEW_EVERY=2');
  });

  it('sets MAX_REVIEW_CYCLES variable', () => {
    const output = buildReviewConfig({
      reviewers: ['claude-sonnet'],
      maxReviewCycles: 5,
      reviewBlocking: false,
      reviewModel: 'claude-opus-4-6',
      reviewEvery: 0,
    });
    expect(output).toContain('MAX_REVIEW_CYCLES=5');
  });

  it('sets REVIEW_BLOCKING variable', () => {
    const output = buildReviewConfig({
      reviewers: ['claude-sonnet'],
      maxReviewCycles: 3,
      reviewBlocking: true,
      reviewModel: 'claude-opus-4-6',
      reviewEvery: 0,
    });
    expect(output).toContain('REVIEW_BLOCKING=true');
  });

  it('sets REVIEW_MODEL variable', () => {
    const output = buildReviewConfig({
      reviewers: ['claude-sonnet'],
      maxReviewCycles: 3,
      reviewBlocking: false,
      reviewModel: 'claude-sonnet-4-6',
      reviewEvery: 0,
    });
    expect(output).toContain('REVIEW_MODEL="claude-sonnet-4-6"');
  });

  it('sets REVIEW_REVIEWERS with space-separated names', () => {
    const output = buildReviewConfig({
      reviewers: ['claude-sonnet', 'gemini', 'codex'],
      maxReviewCycles: 3,
      reviewBlocking: false,
      reviewModel: 'claude-opus-4-6',
      reviewEvery: 0,
    });
    expect(output).toContain('REVIEW_REVIEWERS="claude-sonnet gemini codex"');
  });
});

// ========================================================================
// buildReviewerDetection
// ========================================================================

describe('buildReviewerDetection', () => {
  it('passes bash -n syntax check', () => {
    assertBashSyntax(buildReviewerDetection(), 'reviewer-detection');
  });

  it('defines detect_reviewers function', () => {
    expect(buildReviewerDetection()).toMatch(/detect_reviewers\s*\(\)/);
  });

  it('checks for claude command', () => {
    expect(buildReviewerDetection()).toContain('command -v claude');
  });

  it('checks for gemini command', () => {
    expect(buildReviewerDetection()).toContain('command -v gemini');
  });

  it('checks for codex command', () => {
    expect(buildReviewerDetection()).toContain('command -v codex');
  });

  it('populates AVAILABLE_REVIEWERS variable', () => {
    expect(buildReviewerDetection()).toContain('AVAILABLE_REVIEWERS');
  });
});

// ========================================================================
// buildSessionIdManagement
// ========================================================================

describe('buildSessionIdManagement', () => {
  it('passes bash -n syntax check', () => {
    assertBashSyntax(buildSessionIdManagement(), 'session-id');
  });

  it('defines init_review_sessions function', () => {
    expect(buildSessionIdManagement()).toMatch(/init_review_sessions\s*\(\)/);
  });

  it('uses uuidgen for session IDs', () => {
    expect(buildSessionIdManagement()).toContain('uuidgen');
  });

  it('writes sessions.json', () => {
    expect(buildSessionIdManagement()).toContain('sessions.json');
  });
});

// ========================================================================
// buildReviewPrompt
// ========================================================================

describe('buildReviewPrompt', () => {
  it('passes bash -n syntax check', () => {
    assertBashSyntax(buildReviewPrompt(), 'review-prompt');
  });

  it('defines build_review_prompt function', () => {
    expect(buildReviewPrompt()).toMatch(/build_review_prompt\s*\(\)/);
  });

  it('includes REVIEW_APPROVED marker', () => {
    expect(buildReviewPrompt()).toContain('REVIEW_APPROVED');
  });

  it('includes REVIEW_CHANGES_REQUESTED marker', () => {
    expect(buildReviewPrompt()).toContain('REVIEW_CHANGES_REQUESTED');
  });

  it('includes git diff in prompt', () => {
    expect(buildReviewPrompt()).toContain('git diff');
  });
});

// ========================================================================
// buildSpawnReviewers
// ========================================================================

describe('buildSpawnReviewers', () => {
  it('passes bash -n syntax check', () => {
    assertBashSyntax(buildSpawnReviewers(), 'spawn-reviewers');
  });

  it('defines spawn_reviewers function', () => {
    expect(buildSpawnReviewers()).toMatch(/spawn_reviewers\s*\(\)/);
  });

  it('uses --session-id on cycle 1 for claude reviewers', () => {
    expect(buildSpawnReviewers()).toContain('--session-id');
  });

  it('uses --resume on cycle 2+ for claude reviewers', () => {
    expect(buildSpawnReviewers()).toContain('--resume');
  });

  it('uses --resume latest for gemini on cycle 2+', () => {
    expect(buildSpawnReviewers()).toContain('--resume latest');
  });

  it('launches reviewers as background processes', () => {
    // Background processes use & and wait
    expect(buildSpawnReviewers()).toContain('&');
    expect(buildSpawnReviewers()).toContain('wait');
  });

  it('saves output to per-reviewer report files', () => {
    expect(buildSpawnReviewers()).toMatch(/claude-sonnet\.md|reviewer.*\.md/);
  });
});

// ========================================================================
// buildImplementerPhase
// ========================================================================

describe('buildImplementerPhase', () => {
  it('passes bash -n syntax check', () => {
    assertBashSyntax(buildImplementerPhase(), 'implementer');
  });

  it('defines feed_implementer function', () => {
    expect(buildImplementerPhase()).toMatch(/feed_implementer\s*\(\)/);
  });

  it('includes FIXES_APPLIED marker', () => {
    expect(buildImplementerPhase()).toContain('FIXES_APPLIED');
  });

  it('loads project context via ca load-session', () => {
    expect(buildImplementerPhase()).toContain('ca load-session');
  });

  it('references reviewer reports in prompt', () => {
    expect(buildImplementerPhase()).toContain('review');
  });
});

// ========================================================================
// buildReviewLoop
// ========================================================================

describe('buildReviewLoop', () => {
  it('passes bash -n syntax check', () => {
    assertBashSyntax(buildReviewLoop(), 'review-loop');
  });

  it('defines run_review_phase function', () => {
    expect(buildReviewLoop()).toMatch(/run_review_phase\s*\(\)/);
  });

  it('respects MAX_REVIEW_CYCLES variable', () => {
    expect(buildReviewLoop()).toContain('MAX_REVIEW_CYCLES');
  });

  it('calls detect_reviewers', () => {
    expect(buildReviewLoop()).toContain('detect_reviewers');
  });

  it('calls spawn_reviewers', () => {
    expect(buildReviewLoop()).toContain('spawn_reviewers');
  });

  it('calls feed_implementer', () => {
    expect(buildReviewLoop()).toContain('feed_implementer');
  });

  it('checks for REVIEW_APPROVED in reports', () => {
    expect(buildReviewLoop()).toContain('REVIEW_APPROVED');
  });

  it('handles empty diff by skipping review', () => {
    expect(buildReviewLoop()).toContain('git diff');
  });

  it('respects REVIEW_BLOCKING for exit behavior', () => {
    expect(buildReviewLoop()).toContain('REVIEW_BLOCKING');
  });

  it('creates review directory structure', () => {
    expect(buildReviewLoop()).toMatch(/agent_logs\/reviews|REVIEW_DIR/);
  });
});

// ========================================================================
// P1: Session ID python3 fallback
// ========================================================================

describe('session ID python3 fallback', () => {
  it('buildSessionIdManagement includes python3 fallback for reading sessions', () => {
    const output = buildSessionIdManagement();
    expect(output).toContain('python3');
  });

  it('buildSpawnReviewers includes python3 fallback for reading session IDs', () => {
    const output = buildSpawnReviewers();
    expect(output).toContain('python3');
  });

  it('session write works without jq via python3 fallback', () => {
    const output = buildSessionIdManagement();
    // When HAS_JQ=false, should still write session IDs
    expect(output).toMatch(/HAS_JQ.*false|else/s);
  });
});

// ========================================================================
// P2: Reviewer process timeout (portable)
// ========================================================================

describe('reviewer process timeout', () => {
  it('wraps reviewer commands with portable_timeout', () => {
    const output = buildSpawnReviewers();
    expect(output).toContain('portable_timeout');
  });

  it('uses REVIEW_TIMEOUT variable', () => {
    const output = buildSpawnReviewers();
    expect(output).toContain('REVIEW_TIMEOUT');
  });
});

// ========================================================================
// P1: Portable timeout wrapper (macOS compat)
// ========================================================================

describe('portable timeout wrapper', () => {
  it('buildReviewConfig defines portable_timeout function', () => {
    const output = buildReviewConfig({
      reviewers: ['claude-sonnet'],
      maxReviewCycles: 3,
      reviewBlocking: false,
      reviewModel: 'claude-opus-4-6',
      reviewEvery: 0,
    });
    expect(output).toMatch(/portable_timeout\s*\(\)/);
  });

  it('falls back to gtimeout on macOS', () => {
    const output = buildReviewConfig({
      reviewers: ['claude-sonnet'],
      maxReviewCycles: 3,
      reviewBlocking: false,
      reviewModel: 'claude-opus-4-6',
      reviewEvery: 0,
    });
    expect(output).toContain('gtimeout');
  });

  it('falls back to shell-based timeout when neither available', () => {
    const output = buildReviewConfig({
      reviewers: ['claude-sonnet'],
      maxReviewCycles: 3,
      reviewBlocking: false,
      reviewModel: 'claude-opus-4-6',
      reviewEvery: 0,
    });
    // Should have a kill-based fallback
    expect(output).toContain('kill');
  });
});

// ========================================================================
// P2: Anchored approval detection
// ========================================================================

describe('anchored approval detection', () => {
  it('uses anchored grep for REVIEW_APPROVED in review loop', () => {
    const output = buildReviewLoop();
    expect(output).toMatch(/grep.*\^REVIEW_APPROVED/);
  });
});

// ========================================================================
// P2: FIXES_APPLIED check
// ========================================================================

describe('FIXES_APPLIED verification', () => {
  it('review loop checks for FIXES_APPLIED after implementer', () => {
    const output = buildReviewLoop();
    expect(output).toContain('FIXES_APPLIED');
  });
});

// ========================================================================
// Full composition
// ========================================================================

describe('full review script composition', () => {
  it('all fragments compose into valid bash', () => {
    const config = buildReviewConfig({
      reviewers: ['claude-sonnet', 'claude-opus', 'gemini', 'codex'],
      maxReviewCycles: 3,
      reviewBlocking: false,
      reviewModel: 'claude-opus-4-6',
      reviewEvery: 2,
    });
    const full = [
      config,
      buildReviewerDetection(),
      buildSessionIdManagement(),
      buildReviewPrompt(),
      buildSpawnReviewers(),
      buildImplementerPhase(),
      buildReviewLoop(),
    ].join('\n');
    assertBashSyntax(full, 'full-composition');
  });
});

// ========================================================================
// R1: jq calls use stdin piping, not file arguments
// ========================================================================

describe('jq stdin piping (R1)', () => {
  it('buildSessionIdManagement uses cat pipe for jq reads', () => {
    const output = buildSessionIdManagement();
    // No single line should have jq with "$sessions_file" as a file arg
    // [^|\n]* prevents cross-line matching
    expect(output).not.toMatch(/jq\s+[^|\n]*"\$sessions_file"/);
    expect(output).toMatch(/cat\s+"\$sessions_file"\s*\|\s*jq/);
  });

  it('buildSessionIdManagement uses cat pipe for jq writes', () => {
    const output = buildSessionIdManagement();
    // The write path should also pipe via cat
    expect(output).toMatch(/cat\s+"\$sessions_file"\s*\|\s*jq\s+--arg/);
  });

  it('buildSpawnReviewers read_session_id uses cat pipe for jq', () => {
    const output = buildSpawnReviewers();
    expect(output).not.toMatch(/jq\s+[^|\n]*"\$sessions_file"/);
    expect(output).toMatch(/cat\s+"\$sessions_file"\s*\|\s*jq/);
  });
});

// ========================================================================
// R2/R3: detect_reviewers auth health checks
// ========================================================================

describe('detect_reviewers auth health checks (R2/R3)', () => {
  it('probes claude CLI beyond command -v', () => {
    const output = buildReviewerDetection();
    // After finding the binary, should run a health check command
    expect(output).toContain('command -v claude');
    // Should have a probe/health check after binary check
    expect(output).toMatch(/claude\s+.*--version|claude\s+.*--help|claude\s+-p/);
  });

  it('probes gemini CLI beyond command -v', () => {
    const output = buildReviewerDetection();
    expect(output).toContain('command -v gemini');
    expect(output).toMatch(/gemini\s+.*--version|gemini\s+.*--help|gemini\s+-p/);
  });

  it('probes codex CLI beyond command -v', () => {
    const output = buildReviewerDetection();
    expect(output).toContain('command -v codex');
    expect(output).toMatch(/codex\s+.*--version|codex\s+.*--help|codex\s+exec/);
  });

  it('logs warning with reason when health check fails', () => {
    const output = buildReviewerDetection();
    // Should mention auth/config failure in warning
    expect(output).toMatch(/WARN:.*not (authenticated|responding|healthy|ready)|WARN:.*health check failed/i);
  });
});
