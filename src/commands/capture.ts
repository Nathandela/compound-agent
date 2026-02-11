/**
 * Capture commands: learn, capture, detect
 *
 * Commands for capturing lessons from various sources.
 */

import type { Command } from 'commander';

import { getRepoRoot } from '../cli-utils.js';
import { detectAndPropose, parseInputFile } from '../memory/capture/index.js';
import type { DetectionResult } from '../memory/capture/index.js';
import { appendLesson } from '../memory/storage/index.js';
import { generateId, SeveritySchema } from '../memory/types.js';
import type { Lesson, Severity } from '../memory/types.js';

import { getGlobalOpts, out } from './shared.js';

// ============================================================================
// Capture Command Helpers
// ============================================================================

/** Options for capture command */
interface CaptureOptions {
  trigger?: string;
  insight?: string;
  input?: string;
  json?: boolean;
  yes?: boolean;
}

/**
 * Create a lesson from explicit trigger and insight.
 */
function createLessonFromFlags(trigger: string, insight: string, confirmed: boolean): Lesson {
  return {
    id: generateId(insight),
    type: 'quick',
    trigger,
    insight,
    tags: [],
    source: 'manual',
    context: { tool: 'capture', intent: 'manual capture' },
    created: new Date().toISOString(),
    confirmed,
    supersedes: [],
    related: [],
  };
}

/**
 * Output lesson in JSON format for capture command.
 */
function outputCaptureJson(lesson: Lesson, saved: boolean): void {
  console.log(JSON.stringify({
    id: lesson.id,
    trigger: lesson.trigger,
    insight: lesson.insight,
    type: lesson.type,
    saved,
  }));
}

/**
 * Output lesson preview in human-readable format.
 */
function outputCapturePreview(lesson: Lesson): void {
  console.log('Lesson captured:');
  console.log(`  ID: ${lesson.id}`);
  console.log(`  Trigger: ${lesson.trigger}`);
  console.log(`  Insight: ${lesson.insight}`);
  console.log(`  Type: ${lesson.type}`);
  console.log(`  Tags: ${lesson.tags.length > 0 ? lesson.tags.join(', ') : '(none)'}`);
  console.log('\nTo save: run with --yes flag, or use memory_capture MCP tool');
}

/**
 * Create lesson from input file detection result.
 */
function createLessonFromInputFile(result: DetectionResult, confirmed: boolean): Lesson {
  return {
    id: generateId(result.proposedInsight),
    type: 'quick',
    trigger: result.trigger,
    insight: result.proposedInsight,
    tags: [],
    source: result.source,
    context: { tool: 'capture', intent: 'auto-capture' },
    created: new Date().toISOString(),
    confirmed,
    supersedes: [],
    related: [],
  };
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register capture commands (learn, capture, detect) on the program.
 */
export function registerCaptureCommands(program: Command): void {
  /**
   * Learn command - Quick lesson capture.
   *
   * @example npx ca learn "Use Polars for large files"
   * @example npx ca learn "Use Polars" --severity high --trigger "pandas was slow"
   */
  program
    .command('learn <insight>')
    .description('Capture a new lesson')
    .option('-t, --trigger <text>', 'What triggered this lesson')
    .option('--tags <tags>', 'Comma-separated tags', '')
    .option('-s, --severity <level>', 'Lesson severity: high, medium, low')
    .option('-y, --yes', 'Skip confirmation')
    .option('--citation <file:line>', 'Source file (optionally with :line number)')
    .option('--citation-commit <hash>', 'Git commit hash for citation')
    .action(async function (this: Command, insight: string, options: { trigger?: string; tags: string; severity?: string; yes?: boolean; citation?: string; citationCommit?: string }) {
      const repoRoot = getRepoRoot();
      const { quiet } = getGlobalOpts(this);

      // Validate severity if provided
      let severity: Severity | undefined;
      if (options.severity !== undefined) {
        const result = SeveritySchema.safeParse(options.severity);
        if (!result.success) {
          out.error(`Invalid severity value: "${options.severity}". Valid values are: high, medium, low`);
          process.exit(1);
        }
        severity = result.data;
      }

      // Data coupling invariant: severity !== undefined => type === 'full'
      const lessonType = severity !== undefined ? 'full' : 'quick';

      // Parse citation if provided
      let citation: { file: string; line?: number; commit?: string } | undefined;
      if (options.citation) {
        const parts = options.citation.split(':');
        const file = parts[0] ?? '';
        const lineStr = parts[1];
        const line = lineStr ? parseInt(lineStr, 10) : undefined;
        citation = {
          file,
          ...(line && !isNaN(line) && { line }),
          ...(options.citationCommit && { commit: options.citationCommit }),
        };
      }

      const lesson: Lesson = {
        id: generateId(insight),
        type: lessonType,
        trigger: options.trigger ?? 'Manual capture',
        insight,
        tags: options.tags ? options.tags.split(',').map((t) => t.trim()) : [],
        source: 'manual',
        context: {
          tool: 'cli',
          intent: 'manual learning',
        },
        created: new Date().toISOString(),
        confirmed: true,  // learn command is explicit confirmation
        supersedes: [],
        related: [],
        ...(severity !== undefined && { severity }),
        ...(citation && { citation }),
      };

      await appendLesson(repoRoot, lesson);

      const chalk = await import('chalk');
      out.success(`Learned: ${insight}`);
      if (!quiet) {
        console.log(`ID: ${chalk.default.dim(lesson.id)}`);
        if (citation) {
          console.log(`Citation: ${chalk.default.dim(citation.file)}${citation.line ? `:${citation.line}` : ''}`);
        }
      }
    });

  /**
   * Detect command - Detect learning triggers from input.
   *
   * @example npx ca detect --input conversation.json
   * @example npx ca detect --input session.json --save --yes
   */
  program
    .command('detect')
    .description('Detect learning triggers from input')
    .requiredOption('--input <file>', 'Path to JSON input file')
    .option('--save', 'Save proposed lesson (requires --yes)')
    .option('-y, --yes', 'Confirm save (required with --save)')
    .option('--json', 'Output result as JSON')
    .action(
      async (options: { input: string; save?: boolean; yes?: boolean; json?: boolean }) => {
        const repoRoot = getRepoRoot();

        // --save requires --yes
        if (options.save && !options.yes) {
          if (options.json) {
            console.log(JSON.stringify({ error: '--save requires --yes flag for confirmation' }));
          } else {
            out.error('--save requires --yes flag for confirmation');
            console.log('Use: detect --input <file> --save --yes');
          }
          process.exit(1);
        }

        const input = await parseInputFile(options.input);
        const result = await detectAndPropose(repoRoot, input);

        if (!result) {
          if (options.json) {
            console.log(JSON.stringify({ detected: false }));
          } else {
            console.log('No learning trigger detected.');
          }
          return;
        }

        if (options.json) {
          console.log(JSON.stringify({ detected: true, ...result }));
          return;
        }

        console.log('Learning trigger detected!');
        console.log(`  Trigger: ${result.trigger}`);
        console.log(`  Source: ${result.source}`);
        console.log(`  Proposed: ${result.proposedInsight}`);

        if (options.save && options.yes) {
          const lesson: Lesson = {
            id: generateId(result.proposedInsight),
            type: 'quick',
            trigger: result.trigger,
            insight: result.proposedInsight,
            tags: [],
            source: result.source,
            context: { tool: 'detect', intent: 'auto-capture' },
            created: new Date().toISOString(),
            confirmed: true,  // --yes confirms the lesson
            supersedes: [],
            related: [],
          };

          await appendLesson(repoRoot, lesson);
          console.log(`\nSaved as lesson: ${lesson.id}`);
        }
      }
    );

  /**
   * Capture command - Capture a lesson from trigger/insight or input file.
   *
   * Modes:
   * - Explicit: --trigger "what happened" --insight "what to do"
   * - From file: --input conversation.json (auto-detect trigger)
   *
   * @example npx ca capture --trigger "Wrong API" --insight "Use v2" --yes
   * @example npx ca capture --input session.json --json
   */
  program
    .command('capture')
    .description('Capture a lesson from trigger/insight or input file')
    .option('-t, --trigger <text>', 'What triggered this lesson')
    .option('-i, --insight <text>', 'The insight or lesson learned')
    .option('--input <file>', 'Path to JSON input file (alternative to trigger/insight)')
    .option('--json', 'Output result as JSON')
    .option('-y, --yes', 'Skip confirmation and save immediately')
    .action(async function (this: Command, options: CaptureOptions) {
      const repoRoot = getRepoRoot();
      const { verbose } = getGlobalOpts(this);
      let lesson: Lesson | undefined;

      // Mode 1: From --input file
      if (options.input) {
        const input = await parseInputFile(options.input);
        const result = await detectAndPropose(repoRoot, input);
        if (!result) {
          options.json
            ? console.log(JSON.stringify({ detected: false, saved: false }))
            : console.log('No learning trigger detected.');
          return;
        }
        lesson = createLessonFromInputFile(result, options.yes ?? false);
      } else if (options.trigger && options.insight) {
        // Mode 2: From explicit flags
        lesson = createLessonFromFlags(options.trigger, options.insight, options.yes ?? false);
      } else {
        // Missing required options
        const msg = 'Provide either --trigger and --insight, or --input file.';
        options.json ? console.log(JSON.stringify({ error: msg, saved: false })) : out.error(msg);
        process.exit(1);
      }

      // In non-interactive mode, --yes is required
      if (!options.yes && !process.stdin.isTTY) {
        if (options.json) {
          console.log(JSON.stringify({ error: '--yes required in non-interactive mode', saved: false }));
        } else {
          out.error('--yes required in non-interactive mode');
          console.log('Use: capture --trigger "..." --insight "..." --yes');
        }
        process.exit(1);
      }

      // Output and optionally save
      if (options.json) {
        if (options.yes) await appendLesson(repoRoot, lesson);
        outputCaptureJson(lesson, options.yes ?? false);
      } else if (options.yes) {
        await appendLesson(repoRoot, lesson);
        out.success(`Lesson saved: ${lesson.id}`);
        if (verbose) console.log(`  Type: ${lesson.type} | Trigger: ${lesson.trigger}`);
      } else {
        // Interactive mode - show preview (TTY only)
        outputCapturePreview(lesson);
      }
    });

}
