/**
 * Watch command: tail and pretty-print trace JSONL from infinity loop sessions.
 *
 * Provides real-time micro-observability into Claude Code sessions
 * spawned by the infinity loop.
 */

import { existsSync, readdirSync, readlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';

import type { Command } from 'commander';
import chalk from 'chalk';

import { out } from './shared.js';

// ============================================================================
// Types
// ============================================================================

/** Represents a parsed stream-json event from Claude Code */
export interface StreamEvent {
  type: string;
  timestamp?: string;
  content_block?: { type: string; name?: string };
  delta?: { type: string; text?: string };
  message?: { usage?: { input_tokens?: number; output_tokens?: number } };
  result?: string;
  [key: string]: unknown;
}

interface WatchOptions {
  epic?: string;
  follow?: boolean;
}

// ============================================================================
// Event Formatting
// ============================================================================

function formatTime(timestamp?: string): string {
  if (!timestamp) {
    const now = new Date();
    return now.toTimeString().slice(0, 8);
  }
  try {
    return new Date(timestamp).toTimeString().slice(0, 8);
  } catch {
    return new Date().toTimeString().slice(0, 8);
  }
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Format a stream-json event into a human-readable line.
 * Returns null for events that should be skipped (pings, etc).
 */
export function formatStreamEvent(event: StreamEvent): string | null {
  const time = chalk.dim(formatTime(event.timestamp));

  switch (event.type) {
    case 'content_block_start': {
      if (event.content_block?.type === 'tool_use') {
        const name = event.content_block.name ?? 'unknown';
        return `${time} ${chalk.cyan('TOOL')}    ${name}`;
      }
      return null;
    }

    case 'content_block_delta': {
      if (event.delta?.type === 'text_delta') {
        const text = event.delta.text ?? '';
        const truncated = text.length > 60 ? text.slice(0, 57) + '...' : text;
        return `${time} ${chalk.blue('TEXT')}    ${truncated.replace(/\n/g, ' ')}`;
      }
      return null;
    }

    case 'message_start': {
      if (event.message?.usage) {
        const { input_tokens, output_tokens } = event.message.usage;
        const inTok = input_tokens ? formatNumber(input_tokens) : '?';
        const outTok = output_tokens ? formatNumber(output_tokens) : '?';
        return `${time} ${chalk.dim('TOKENS')}  ${inTok} in / ${outTok} out`;
      }
      return null;
    }

    case 'result': {
      const text = typeof event.result === 'string' ? event.result : '';
      if (text.includes('EPIC_COMPLETE') || text.includes('EPIC_FAILED') || text.includes('HUMAN_REQUIRED')) {
        return `${time} ${chalk.yellow.bold('MARKER')}  ${text}`;
      }
      return null;
    }

    default:
      return null;
  }
}

// ============================================================================
// Trace File Discovery
// ============================================================================

/**
 * Find the latest trace JSONL file in the given directory.
 * Checks for .latest symlink first, then falls back to sorting by name.
 */
export function findLatestTraceFile(logDir: string): string | null {
  if (!existsSync(logDir)) return null;

  // Check for .latest symlink
  const latestPath = join(logDir, '.latest');
  if (existsSync(latestPath)) {
    try {
      const target = readlinkSync(latestPath);
      const resolved = resolve(logDir, target);
      if (existsSync(resolved)) return resolved;
    } catch {
      // Not a symlink or broken, fall through
    }
  }

  // Fallback: find most recent trace_*.jsonl
  try {
    const files = readdirSync(logDir)
      .filter(f => f.startsWith('trace_') && f.endsWith('.jsonl'))
      .sort()
      .reverse();
    const first = files[0];
    if (first) return join(logDir, first);
  } catch {
    // Directory read error
  }

  return null;
}

// ============================================================================
// Watch Logic
// ============================================================================

function processLine(line: string): void {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const event = JSON.parse(trimmed) as StreamEvent;
    const formatted = formatStreamEvent(event);
    if (formatted) {
      console.log(formatted);
    }
  } catch {
    // Skip malformed JSON lines
  }
}

async function tailFile(filePath: string, follow: boolean): Promise<void> {
  if (follow) {
    // Use tail -f for live following
    const child = spawn('tail', ['-f', '-n', '+1', filePath], { stdio: ['ignore', 'pipe', 'ignore'] });
    const rl = createInterface({ input: child.stdout });

    rl.on('line', processLine);

    // Clean exit on Ctrl+C
    const cleanup = (): void => {
      child.kill('SIGTERM');
      process.exit(0);
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    return new Promise((resolve) => {
      child.on('close', () => resolve());
    });
  } else {
    // One-shot read
    const stream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = createInterface({ input: stream });

    for await (const line of rl) {
      processLine(line);
    }
  }
}

// ============================================================================
// Command Handler
// ============================================================================

async function handleWatch(cmd: Command, options: WatchOptions): Promise<void> {
  void cmd;

  const logDir = resolve('agent_logs');
  const follow = options.follow !== false; // default: true

  let traceFile: string | null = null;

  if (options.epic) {
    // Find trace file for specific epic
    if (existsSync(logDir)) {
      try {
        const files = readdirSync(logDir)
          .filter(f => f.startsWith(`trace_${options.epic}`) && f.endsWith('.jsonl'))
          .sort()
          .reverse();
        const first = files[0];
        if (first) traceFile = join(logDir, first);
      } catch {
        // Directory read error
      }
    }

    if (!traceFile) {
      out.error(`No trace file found for epic: ${options.epic}`);
      process.exitCode = 1;
      return;
    }
  } else {
    traceFile = findLatestTraceFile(logDir);

    if (!traceFile) {
      out.info('No active trace found. Run `ca loop` to generate a loop script first.');
      process.exitCode = 0;
      return;
    }
  }

  out.info(`Watching: ${traceFile}`);
  await tailFile(traceFile, follow);
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register watch command on the program.
 */
export function registerWatchCommand(program: Command): void {
  program
    .command('watch')
    .description('Tail and pretty-print live trace from infinity loop sessions')
    .option('--epic <id>', 'Watch a specific epic trace')
    .option('--no-follow', 'Print existing trace and exit (no live tail)')
    .action(async function (this: Command, options: WatchOptions) {
      await handleWatch(this, options);
    });
}
