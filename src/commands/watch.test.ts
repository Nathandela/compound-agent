/**
 * Tests for the `ca watch` command (live trace pretty-printer).
 */

import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  formatStreamEvent,
  findLatestTraceFile,
  type StreamEvent,
} from './watch.js';
import { setupCliTestContext } from '../test-utils.js';

// ============================================================================
// Unit tests: event formatting
// ============================================================================

describe('formatStreamEvent', () => {
  it('formats tool_use events with tool name', () => {
    const event: StreamEvent = {
      type: 'content_block_start',
      content_block: { type: 'tool_use', name: 'Bash' },
      timestamp: '2026-03-02T14:30:48Z',
    };
    const output = formatStreamEvent(event);
    expect(output).toContain('TOOL');
    expect(output).toContain('Bash');
  });

  it('formats text_delta events with truncated text', () => {
    const event: StreamEvent = {
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'Loading context for the epic implementation workflow...' },
      timestamp: '2026-03-02T14:30:46Z',
    };
    const output = formatStreamEvent(event);
    expect(output).toContain('TEXT');
  });

  it('formats message_start events with token usage', () => {
    const event: StreamEvent = {
      type: 'message_start',
      message: {
        usage: { input_tokens: 12340, output_tokens: 3210 },
      },
      timestamp: '2026-03-02T14:31:20Z',
    };
    const output = formatStreamEvent(event);
    expect(output).toContain('TOKENS');
    expect(output).toMatch(/12,?340/);
  });

  it('formats result events containing EPIC_COMPLETE as marker', () => {
    const event: StreamEvent = {
      type: 'result',
      result: 'EPIC_COMPLETE',
      timestamp: '2026-03-02T14:45:02Z',
    };
    const output = formatStreamEvent(event);
    expect(output).toContain('MARKER');
    expect(output).toContain('EPIC_COMPLETE');
  });

  it('formats result events containing EPIC_FAILED as marker', () => {
    const event: StreamEvent = {
      type: 'result',
      result: 'EPIC_FAILED',
      timestamp: '2026-03-02T14:45:02Z',
    };
    const output = formatStreamEvent(event);
    expect(output).toContain('MARKER');
    expect(output).toContain('EPIC_FAILED');
  });

  it('returns null for unrecognized event types', () => {
    const event: StreamEvent = {
      type: 'ping',
      timestamp: '2026-03-02T14:30:45Z',
    };
    const output = formatStreamEvent(event);
    expect(output).toBeNull();
  });

  it('includes timestamp in formatted output', () => {
    const event: StreamEvent = {
      type: 'content_block_start',
      content_block: { type: 'tool_use', name: 'Read' },
      timestamp: '2026-03-02T14:30:50Z',
    };
    const output = formatStreamEvent(event);
    expect(output).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('formats HUMAN_REQUIRED result events as marker', () => {
    const event: StreamEvent = {
      type: 'result',
      result: 'HUMAN_REQUIRED: Need AWS credentials',
      timestamp: '2026-03-02T14:45:02Z',
    };
    const output = formatStreamEvent(event);
    expect(output).toContain('MARKER');
    expect(output).toContain('HUMAN_REQUIRED');
  });

  it('truncates long result text to 120 chars', () => {
    const longResult = 'Some prefix text\nEPIC_COMPLETE\n' + 'x'.repeat(200);
    const event: StreamEvent = {
      type: 'result',
      result: longResult,
      timestamp: '2026-03-02T14:45:02Z',
    };
    const output = formatStreamEvent(event);
    expect(output).toContain('MARKER');
    expect(output).toContain('EPIC_COMPLETE');
    // Should not contain the full 200 x's
    expect(output!.length).toBeLessThan(200);
  });

  it('formats thinking block as THINK indicator', () => {
    const event: StreamEvent = {
      type: 'content_block_start',
      content_block: { type: 'thinking' },
      timestamp: '2026-03-02T14:30:48Z',
    };
    const output = formatStreamEvent(event);
    expect(output).toContain('THINK');
  });

  it('formats message_delta with output tokens', () => {
    const event: StreamEvent = {
      type: 'message_delta',
      usage: { output_tokens: 5678 },
      timestamp: '2026-03-02T14:31:25Z',
    } as StreamEvent;
    const output = formatStreamEvent(event);
    expect(output).toContain('TOKENS');
    expect(output).toMatch(/5,?678/);
    expect(output).toContain('final');
  });

  // Improvement loop markers
  it('detects IMPROVED marker in result events', () => {
    const event: StreamEvent = {
      type: 'result',
      result: 'Some output\nIMPROVED\nDone',
    };
    const output = formatStreamEvent(event);
    expect(output).toContain('MARKER');
    expect(output).toContain('IMPROVED');
  });

  it('detects NO_IMPROVEMENT marker in result events', () => {
    const event: StreamEvent = {
      type: 'result',
      result: 'NO_IMPROVEMENT',
    };
    const output = formatStreamEvent(event);
    expect(output).toContain('MARKER');
    expect(output).toContain('NO_IMPROVEMENT');
  });

  it('detects FAILED marker in result events', () => {
    const event: StreamEvent = {
      type: 'result',
      result: 'FAILED',
    };
    const output = formatStreamEvent(event);
    expect(output).toContain('MARKER');
    expect(output).toContain('FAILED');
  });

  it('detects NO_IMPROVEMENT before IMPROVED (substring safety)', () => {
    const event: StreamEvent = {
      type: 'result',
      result: 'NO_IMPROVEMENT',
    };
    const output = formatStreamEvent(event);
    expect(output).toContain('NO_IMPROVEMENT');
    // Must NOT match just "IMPROVED" for a NO_IMPROVEMENT result
    // The marker line itself should say NO_IMPROVEMENT, not IMPROVED
    const markerContent = output!.split('MARKER')[1];
    expect(markerContent).toContain('NO_IMPROVEMENT');
  });
});

// ============================================================================
// Unit tests: trace file discovery
// ============================================================================

describe('findLatestTraceFile', () => {
  it('returns null when agent_logs directory does not exist', () => {
    const result = findLatestTraceFile('/nonexistent/path');
    expect(result).toBeNull();
  });

  it('returns null when no trace files exist in directory', () => {
    // Use a temp directory that exists but has no trace files
    const result = findLatestTraceFile('/tmp');
    expect(result).toBeNull();
  });

  it('returns file pointed to by .latest symlink', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watch-test-'));
    try {
      writeFileSync(join(dir, 'trace_epic-2026-03-02.jsonl'), '{}');
      symlinkSync('trace_epic-2026-03-02.jsonl', join(dir, '.latest'));
      const result = findLatestTraceFile(dir);
      expect(result).toContain('trace_epic-2026-03-02.jsonl');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to filename sort when .latest is broken symlink', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watch-test-'));
    try {
      writeFileSync(join(dir, 'trace_a-2026-03-01.jsonl'), '{}');
      writeFileSync(join(dir, 'trace_b-2026-03-02.jsonl'), '{}');
      symlinkSync('trace_nonexistent.jsonl', join(dir, '.latest'));
      const result = findLatestTraceFile(dir);
      expect(result).toContain('trace_b-2026-03-02.jsonl');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns latest trace file by filename sort', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watch-test-'));
    try {
      writeFileSync(join(dir, 'trace_x-2026-03-01_10-00-00.jsonl'), '{}');
      writeFileSync(join(dir, 'trace_x-2026-03-02_10-00-00.jsonl'), '{}');
      const result = findLatestTraceFile(dir);
      expect(result).toContain('trace_x-2026-03-02_10-00-00.jsonl');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// CLI integration tests
// ============================================================================

describe('ca watch CLI', { tags: ['integration'] }, () => {
  const { runCli } = setupCliTestContext();

  it('command is registered with help text', () => {
    const { combined } = runCli('watch --help');
    expect(combined).toMatch(/watch/i);
    expect(combined).toMatch(/trace|tail|live/i);
  });

  it('accepts --epic flag', () => {
    const { combined } = runCli('watch --help');
    expect(combined).toMatch(/--epic/);
  });

  it('exits gracefully when no trace file exists', () => {
    // Running watch in a directory without trace files should not crash
    const { combined } = runCli('watch --no-follow');
    expect(combined).toMatch(/no trace|not found|no active/i);
  });

  it('rejects invalid epic ID with shell metacharacters', () => {
    const { combined } = runCli('watch --epic "$(bad)" --no-follow');
    expect(combined).toMatch(/invalid|epic/i);
  });

  it('accepts --improve flag', () => {
    const { combined } = runCli('watch --help');
    expect(combined).toMatch(/--improve/);
  });

  it('exits gracefully when no improvement trace exists', () => {
    const { combined } = runCli('watch --improve --no-follow');
    expect(combined).toMatch(/no improvement trace|no active|not found/i);
  });
});
