/**
 * Capture command - Capture a lesson from trigger/insight or input file
 */

import type { Command } from 'commander';

import { detectAndPropose, parseInputFile } from '../../capture/index.js';
import type { DetectionResult } from '../../capture/index.js';
import { getRepoRoot } from '../../cli-utils.js';
import { appendLesson } from '../../storage/index.js';
import { generateId } from '../../types.js';
import type { Lesson } from '../../types.js';
import { getGlobalOpts, out } from '../shared.js';

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
  console.log('\nSave this lesson? [y/n]');
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

/**
 * Register the capture command with the program.
 */
export function registerCaptureCommand(program: Command): void {
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
