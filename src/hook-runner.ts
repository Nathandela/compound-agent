#!/usr/bin/env node
/**
 * Minimal hook runner -- lightweight alternative to the full CLI.
 *
 * Handles `hooks run <hook>` without loading Commander.js, SQLite,
 * or embedding modules. Used by Claude Code/Gemini hooks for
 * dramatically lower memory footprint and faster startup.
 *
 * Interface: hook name from argv[2], stdin JSON in, stdout JSON out, exit 0/1.
 */

import { join } from 'node:path';

import { readStdin } from './read-stdin.js';
import { getRepoRoot } from './cli-utils.js';
import { processUserPrompt } from './setup/hooks-user-prompt.js';
import { processToolFailure, processToolSuccess } from './setup/hooks-failure-tracker.js';
import { processPhaseGuard } from './setup/hooks-phase-guard.js';
import { processReadTracker } from './setup/hooks-read-tracker.js';
import { processStopAudit } from './setup/hooks-stop-audit.js';

// Pre-commit message duplicated here to avoid importing templates.ts
// (which imports VERSION which may pull in more deps).
const PRE_COMMIT_MESSAGE = `
\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
\u2551                    LESSON CAPTURE CHECKPOINT                 \u2551
\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563
\u2551 STOP. Before this commit, take a moment to reflect:          \u2551
\u2551                                                              \u2551
\u2551 [ ] Did I learn something relevant during this session?      \u2551
\u2551 [ ] Is there anything worth remembering for next time?       \u2551
\u2551                                                              \u2551
\u2551 If so, consider capturing a lesson:                          \u2551
\u2551   npx ca learn "<insight>" --trigger "<what happened>"       \u2551
\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d`;

/**
 * Run a single hook by name.
 * Exported for testability; main() calls this with process.argv[2].
 */
export async function runHook(hook: string | undefined): Promise<void> {
  if (!hook) {
    console.error('Usage: hook-runner <hook>');
    process.exitCode = 1;
    return;
  }

  try {
    switch (hook) {
      case 'pre-commit':
        console.log(JSON.stringify({ hook: 'pre-commit', message: PRE_COMMIT_MESSAGE }));
        break;

      case 'user-prompt': {
        const input = await readStdin();
        const data = JSON.parse(input) as { prompt?: string };
        if (!data.prompt) {
          console.log(JSON.stringify({}));
          break;
        }
        console.log(JSON.stringify(processUserPrompt(data.prompt)));
        break;
      }

      case 'post-tool-failure': {
        const input = await readStdin();
        const data = JSON.parse(input) as { tool_name?: string; tool_input?: Record<string, unknown> };
        if (!data.tool_name) {
          console.log(JSON.stringify({}));
          break;
        }
        const stateDir = join(getRepoRoot(), '.claude');
        console.log(JSON.stringify(processToolFailure(data.tool_name, data.tool_input ?? {}, stateDir)));
        break;
      }

      case 'post-tool-success': {
        await readStdin();
        const stateDir = join(getRepoRoot(), '.claude');
        processToolSuccess(stateDir);
        console.log(JSON.stringify({}));
        break;
      }

      case 'phase-guard':
      case 'post-read':
      case 'read-tracker': {
        const input = await readStdin();
        const data = JSON.parse(input) as { tool_name?: string; tool_input?: Record<string, unknown> };
        if (!data.tool_name) {
          console.log(JSON.stringify({}));
          break;
        }
        const processor = hook === 'phase-guard' ? processPhaseGuard : processReadTracker;
        console.log(JSON.stringify(processor(getRepoRoot(), data.tool_name, data.tool_input ?? {})));
        break;
      }

      case 'phase-audit':
      case 'stop-audit': {
        const input = await readStdin();
        const data = JSON.parse(input) as { stop_hook_active?: boolean };
        console.log(JSON.stringify(processStopAudit(getRepoRoot(), data.stop_hook_active ?? false)));
        break;
      }

      default:
        console.log(JSON.stringify({ error: `Unknown hook: ${hook}. Valid hooks: pre-commit, user-prompt, post-tool-failure, post-tool-success, post-read (or read-tracker), phase-guard, phase-audit (or stop-audit)` }));
        process.exitCode = 1;
    }
  } catch (err) {
    if (process.env['CA_DEBUG']) {
      console.error(`[CA_DEBUG] Hook ${hook} error: ${err instanceof Error ? err.message : String(err)}`);
    }
    console.log(JSON.stringify({}));
  }
}

// Entry point: invoke with argv[2] as hook name
runHook(process.argv[2]);
