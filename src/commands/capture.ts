/**
 * Capture commands: learn, capture, detect
 *
 * Commands for capturing lessons from various sources.
 */

import type { Command } from 'commander';

import { getRepoRoot } from '../cli-utils.js';
import { detectAndPropose, parseInputFile } from '../memory/capture/index.js';
import type { DetectionResult } from '../memory/capture/index.js';
import { appendLesson, appendMemoryItem, generateId, MemoryItemTypeSchema, SeveritySchema } from '../memory/index.js';
import type { Lesson, MemoryItem, MemoryItemType, Severity } from '../memory/index.js';

import { formatError } from '../cli-error-format.js';

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

/** Options for learn command */
interface LearnOptions {
  trigger?: string;
  tags: string;
  severity?: string;
  yes?: boolean;
  citation?: string;
  citationCommit?: string;
  type: string;
  patternBad?: string;
  patternGood?: string;
}

/**
 * Create a lesson from explicit trigger and insight.
 */
function createLessonFromFlags(trigger: string, insight: string, confirmed: boolean): Lesson {
  return {
    id: generateId(insight),
    type: 'lesson',
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
  console.log('\nTo save: run with --yes flag');
}

/**
 * Create lesson from input file detection result.
 */
function createLessonFromInputFile(result: DetectionResult, confirmed: boolean): Lesson {
  return {
    id: generateId(result.proposedInsight),
    type: 'lesson',
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
// Command Action Handlers
// ============================================================================

/**
 * Handle the learn command action.
 */
async function handleLearn(cmd: Command, insight: string, options: LearnOptions): Promise<void> {
  const repoRoot = getRepoRoot();
  const { quiet } = getGlobalOpts(cmd);

  // Validate --type
  const typeResult = MemoryItemTypeSchema.safeParse(options.type);
  if (!typeResult.success) {
    console.error(formatError('learn', 'INVALID_TYPE', `Invalid type: "${options.type}"`, 'Use --type lesson|solution|pattern|preference'));
    process.exitCode = 1;
    return;
  }
  const itemType: MemoryItemType = typeResult.data;

  // Validate pattern flags when type=pattern
  if (itemType === 'pattern' && (!options.patternBad || !options.patternGood)) {
    console.error(formatError('learn', 'MISSING_PATTERN', 'type=pattern requires --pattern-bad and --pattern-good', 'Use: learn "insight" --type pattern --pattern-bad "old" --pattern-good "new"'));
    process.exitCode = 1;
    return;
  }

  // Validate severity if provided
  let severity: Severity | undefined;
  if (options.severity !== undefined) {
    const result = SeveritySchema.safeParse(options.severity);
    if (!result.success) {
      console.error(formatError('learn', 'INVALID_SEVERITY', `Invalid severity: "${options.severity}"`, 'Use --severity high|medium|low'));
      process.exitCode = 1;
      return;
    }
    severity = result.data;
  }

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

  // Build pattern if provided
  const pattern = options.patternBad && options.patternGood
    ? { bad: options.patternBad, good: options.patternGood }
    : undefined;

  const item: MemoryItem = {
    id: generateId(insight, itemType),
    type: itemType,
    trigger: options.trigger ?? 'Manual capture',
    insight,
    tags: options.tags ? options.tags.split(',').map((t) => t.trim()) : [],
    source: 'manual',
    context: { tool: 'cli', intent: 'manual learning' },
    created: new Date().toISOString(),
    confirmed: true,
    supersedes: [],
    related: [],
    ...(severity !== undefined && { severity }),
    ...(citation && { citation }),
    ...(pattern && { pattern }),
  } as MemoryItem;

  await appendMemoryItem(repoRoot, item);

  const verb = itemType === 'lesson' ? 'Learned' : 'Captured';
  const chalk = await import('chalk');
  out.success(`${verb}: ${insight}`);
  if (!quiet) {
    console.log(`ID: ${chalk.default.dim(item.id)}`);
    if (itemType !== 'lesson') {
      console.log(`Type: ${chalk.default.dim(itemType)}`);
    }
    if (citation) {
      console.log(`Citation: ${chalk.default.dim(citation.file)}${citation.line ? `:${citation.line}` : ''}`);
    }
  }

  await checkSimilarityPostCapture(repoRoot, item);
}

/**
 * Best-effort post-capture similarity check.
 * Warns if semantically similar lessons exist. Never blocks capture.
 */
async function checkSimilarityPostCapture(repoRoot: string, item: MemoryItem): Promise<void> {
  try {
    const { isModelAvailable } = await import('../memory/embeddings/model.js');
    if (!isModelAvailable()) return;

    const { syncIfNeeded } = await import('../memory/storage/sqlite/sync.js');
    const { findSimilarLessons } = await import('../memory/search/vector.js');
    const { unloadEmbedding } = await import('../memory/embeddings/nomic.js');
    const chalk = await import('chalk');
    try {
      await syncIfNeeded(repoRoot);
      const similar = await findSimilarLessons(repoRoot, item.insight, { excludeId: item.id });
      if (similar.length > 0) {
        console.log('');
        out.warn('Similar lessons found:');
        for (const s of similar.slice(0, 3)) {
          console.log(`  ${chalk.default.dim(s.item.id)} (${(s.score * 100).toFixed(0)}%) ${s.item.insight.slice(0, 60)}...`);
        }
        console.log('');
        console.log(`Run ${chalk.default.bold("'npx ca clean-lessons'")} to review and resolve.`);
      }
    } finally {
      unloadEmbedding();
    }
  } catch {
    // Similarity check is best-effort
  }
}

/**
 * Handle the detect command action.
 */
async function handleDetect(options: { input: string; save?: boolean; yes?: boolean; json?: boolean }): Promise<void> {
  const repoRoot = getRepoRoot();

  if (options.save && !options.yes) {
    if (options.json) {
      console.log(JSON.stringify({ error: '--save requires --yes flag for confirmation' }));
    } else {
      console.error(formatError('detect', 'MISSING_FLAG', '--save requires --yes', 'Use: detect --input <file> --save --yes'));
    }
    process.exitCode = 1;
    return;
  }

  let input;
  try {
    input = await parseInputFile(options.input);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to parse input file';
    if (options.json) {
      console.log(JSON.stringify({ error: message, detected: false }));
    } else {
      console.error(formatError('detect', 'INVALID_INPUT', message, 'Check the file is valid JSON matching the expected schema'));
    }
    process.exitCode = 1;
    return;
  }
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
      type: 'lesson',
      trigger: result.trigger,
      insight: result.proposedInsight,
      tags: [],
      source: result.source,
      context: { tool: 'detect', intent: 'auto-capture' },
      created: new Date().toISOString(),
      confirmed: true,
      supersedes: [],
      related: [],
    };

    await appendLesson(repoRoot, lesson);
    console.log(`\nSaved as lesson: ${lesson.id}`);
  }
}

/**
 * Handle the capture command action.
 */
async function handleCapture(cmd: Command, options: CaptureOptions): Promise<void> {
  const repoRoot = getRepoRoot();
  const { verbose } = getGlobalOpts(cmd);
  let lesson: Lesson | undefined;

  if (options.input) {
    let input;
    try {
      input = await parseInputFile(options.input);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse input file';
      if (options.json) {
        console.log(JSON.stringify({ error: message, saved: false }));
      } else {
        console.error(formatError('capture', 'INVALID_INPUT', message, 'Check the file is valid JSON matching the expected schema'));
      }
      process.exitCode = 1;
      return;
    }
    const result = await detectAndPropose(repoRoot, input);
    if (!result) {
      if (options.json) {
        console.log(JSON.stringify({ detected: false, saved: false }));
      } else {
        console.log('No learning trigger detected.');
      }
      return;
    }
    lesson = createLessonFromInputFile(result, options.yes ?? false);
  } else if (options.trigger && options.insight) {
    lesson = createLessonFromFlags(options.trigger, options.insight, options.yes ?? false);
  } else {
    const msg = 'Provide either --trigger and --insight, or --input file.';
    if (options.json) {
      console.log(JSON.stringify({ error: msg, saved: false }));
    } else {
      console.error(formatError('capture', 'MISSING_OPTIONS', msg, 'Provide --trigger and --insight, or --input'));
    }
    process.exitCode = 1;
    return;
  }

  if (!options.yes && !process.stdin.isTTY) {
    if (options.json) {
      console.log(JSON.stringify({ error: '--yes required in non-interactive mode', saved: false }));
    } else {
      console.error(formatError('capture', 'NON_INTERACTIVE', '--yes required in non-interactive mode', 'Use: capture --trigger "..." --insight "..." --yes'));
    }
    process.exitCode = 1;
    return;
  }

  if (options.json) {
    if (options.yes) await appendLesson(repoRoot, lesson);
    outputCaptureJson(lesson, options.yes ?? false);
  } else if (options.yes) {
    await appendLesson(repoRoot, lesson);
    out.success(`Lesson saved: ${lesson.id}`);
    if (verbose) console.log(`  Type: ${lesson.type} | Trigger: ${lesson.trigger}`);
  } else {
    outputCapturePreview(lesson);
  }
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register capture commands (learn, capture, detect) on the program.
 */
export function registerCaptureCommands(program: Command): void {
  program
    .command('learn <insight>')
    .description('Capture a new memory item (lesson, solution, pattern, or preference)')
    .option('-t, --trigger <text>', 'What triggered this lesson')
    .option('--tags <tags>', 'Comma-separated tags', '')
    .option('-s, --severity <level>', 'Lesson severity: high, medium, low')
    .option('-y, --yes', 'Skip confirmation')
    .option('--citation <file:line>', 'Source file (optionally with :line number)')
    .option('--citation-commit <hash>', 'Git commit hash for citation')
    .option('--type <type>', 'Memory item type: lesson, solution, pattern, preference', 'lesson')
    .option('--pattern-bad <code>', 'Bad pattern example (required when --type pattern)')
    .option('--pattern-good <code>', 'Good pattern example (required when --type pattern)')
    .action(async function (this: Command, insight: string, options: LearnOptions) {
      await handleLearn(this, insight, options);
    });

  program
    .command('detect')
    .description('Detect learning triggers from input')
    .requiredOption('--input <file>', 'Path to JSON input file')
    .option('--save', 'Save proposed lesson (requires --yes)')
    .option('-y, --yes', 'Confirm save (required with --save)')
    .option('--json', 'Output result as JSON')
    .action(async (options: { input: string; save?: boolean; yes?: boolean; json?: boolean }) => {
      await handleDetect(options);
    });

  program
    .command('capture')
    .description('Capture a lesson from trigger/insight or input file')
    .option('-t, --trigger <text>', 'What triggered this lesson')
    .option('-i, --insight <text>', 'The insight or lesson learned')
    .option('--input <file>', 'Path to JSON input file (alternative to trigger/insight)')
    .option('--json', 'Output result as JSON')
    .option('-y, --yes', 'Skip confirmation and save immediately')
    .action(async function (this: Command, options: CaptureOptions) {
      await handleCapture(this, options);
    });
}
