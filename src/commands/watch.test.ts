/**
 * Tests for the `ca watch` command (live trace pretty-printer).
 */

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
});
