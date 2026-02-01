/**
 * Management commands: wrong, validate, compact, stats, rebuild, export, import,
 *                      show, update, delete
 *
 * Commands for managing and maintaining lessons.
 */

import { statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Command } from 'commander';

import { formatBytes, getRepoRoot } from '../cli-utils.js';
import {
  appendLesson,
  compact,
  countTombstones,
  DB_PATH,
  getRetrievalStats,
  LESSONS_PATH,
  needsCompaction,
  readLessons,
  rebuildIndex,
  syncIfNeeded,
  TOMBSTONE_THRESHOLD,
} from '../storage/index.js';
import { LessonSchema, SeveritySchema } from '../types.js';
import type { Lesson, Severity } from '../types.js';

import {
  AGE_FLAG_THRESHOLD_DAYS,
  AVG_DECIMAL_PLACES,
  getLessonAgeDays,
  JSON_INDENT_SPACES,
  LESSON_COUNT_WARNING_THRESHOLD,
  out,
} from './shared.js';

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register management commands on the program.
 */
export function registerManagementCommands(program: Command): void {
  /**
   * Wrong command - Mark a lesson as invalid/wrong.
   *
   * Appends an invalidatedAt timestamp and optional reason to the lesson.
   * Invalidated lessons are excluded from retrieval but remain in storage.
   *
   * @example npx lna wrong L12345678
   * @example npx lna wrong L12345678 --reason "This advice was incorrect"
   */
  program
    .command('wrong <id>')
    .description('Mark a lesson as invalid/wrong')
    .option('-r, --reason <text>', 'Reason for invalidation')
    .action(async function (this: Command, id: string, options: { reason?: string }) {
      const repoRoot = getRepoRoot();

      // Read all lessons
      const { lessons } = await readLessons(repoRoot);

      // Find the lesson
      const lesson = lessons.find((l) => l.id === id);
      if (!lesson) {
        out.error(`Lesson not found: ${id}`);
        process.exit(1);
      }

      // Check if already invalidated
      if (lesson.invalidatedAt) {
        out.warn(`Lesson ${id} is already marked as invalid.`);
        return;
      }

      // Create updated lesson with invalidation
      const updatedLesson: Lesson = {
        ...lesson,
        invalidatedAt: new Date().toISOString(),
        ...(options.reason !== undefined && { invalidationReason: options.reason }),
      };

      // Append the updated lesson (JSONL append-only pattern)
      await appendLesson(repoRoot, updatedLesson);
      out.success(`Lesson ${id} marked as invalid.`);
      if (options.reason) {
        console.log(`  Reason: ${options.reason}`);
      }
    });

  /**
   * Validate command - Remove invalidation from a lesson.
   *
   * Re-enables a previously invalidated lesson for retrieval.
   *
   * @example npx lna validate L12345678
   */
  program
    .command('validate <id>')
    .description('Re-enable a previously invalidated lesson')
    .action(async function (this: Command, id: string) {
      const repoRoot = getRepoRoot();

      // Read all lessons
      const { lessons } = await readLessons(repoRoot);

      // Find the lesson
      const lesson = lessons.find((l) => l.id === id);
      if (!lesson) {
        out.error(`Lesson not found: ${id}`);
        process.exit(1);
      }

      // Check if not invalidated
      if (!lesson.invalidatedAt) {
        out.info(`Lesson ${id} is not invalidated.`);
        return;
      }

      // Create lesson without invalidation fields
      const updatedLesson: Lesson = {
        id: lesson.id,
        type: lesson.type,
        trigger: lesson.trigger,
        insight: lesson.insight,
        tags: lesson.tags,
        source: lesson.source,
        context: lesson.context,
        created: lesson.created,
        confirmed: lesson.confirmed,
        supersedes: lesson.supersedes,
        related: lesson.related,
        // Include optional fields if present (excluding invalidation)
        ...(lesson.evidence !== undefined && { evidence: lesson.evidence }),
        ...(lesson.severity !== undefined && { severity: lesson.severity }),
        ...(lesson.pattern !== undefined && { pattern: lesson.pattern }),
        ...(lesson.deleted !== undefined && { deleted: lesson.deleted }),
        ...(lesson.retrievalCount !== undefined && { retrievalCount: lesson.retrievalCount }),
        ...(lesson.citation !== undefined && { citation: lesson.citation }),
        ...(lesson.compactionLevel !== undefined && { compactionLevel: lesson.compactionLevel }),
        ...(lesson.compactedAt !== undefined && { compactedAt: lesson.compactedAt }),
        ...(lesson.lastRetrieved !== undefined && { lastRetrieved: lesson.lastRetrieved }),
      };

      // Append the updated lesson (JSONL append-only pattern)
      await appendLesson(repoRoot, updatedLesson);
      out.success(`Lesson ${id} re-enabled (validated).`);
    });

  /**
   * Compact command - Archive old lessons and remove tombstones.
   *
   * @example npx lna compact
   * @example npx lna compact --force
   * @example npx lna compact --dry-run
   */
  program
    .command('compact')
    .description('Compact lessons: archive old lessons and remove tombstones')
    .option('-f, --force', 'Run compaction even if below threshold')
    .option('--dry-run', 'Show what would be done without making changes')
    .action(async (options: { force?: boolean; dryRun?: boolean }) => {
      const repoRoot = getRepoRoot();

      const tombstones = await countTombstones(repoRoot);
      const needs = await needsCompaction(repoRoot);

      if (options.dryRun) {
        console.log('Dry run - no changes will be made.\n');
        console.log(`Tombstones found: ${tombstones}`);
        console.log(`Compaction needed: ${needs ? 'yes' : 'no'}`);
        return;
      }

      if (!needs && !options.force) {
        console.log(`Compaction not needed (${tombstones} tombstones, threshold is ${TOMBSTONE_THRESHOLD}).`);
        console.log('Use --force to compact anyway.');
        return;
      }

      console.log('Running compaction...');
      const result = await compact(repoRoot);

      console.log('\nCompaction complete:');
      console.log(`  Archived: ${result.archived} lesson(s)`);
      console.log(`  Tombstones removed: ${result.tombstonesRemoved}`);
      console.log(`  Lessons remaining: ${result.lessonsRemaining}`);

      // Rebuild SQLite index after compaction
      await rebuildIndex(repoRoot);
      console.log('  Index rebuilt.');
    });

  /**
   * Rebuild command - Rebuild SQLite index from JSONL.
   *
   * @example npx lna rebuild
   * @example npx lna rebuild --force
   */
  program
    .command('rebuild')
    .description('Rebuild SQLite index from JSONL')
    .option('-f, --force', 'Force rebuild even if unchanged')
    .action(async (options: { force?: boolean }) => {
      const repoRoot = getRepoRoot();
      if (options.force) {
        console.log('Forcing index rebuild...');
        await rebuildIndex(repoRoot);
        console.log('Index rebuilt.');
      } else {
        const rebuilt = await syncIfNeeded(repoRoot);
        if (rebuilt) {
          console.log('Index rebuilt (JSONL changed).');
        } else {
          console.log('Index is up to date.');
        }
      }
    });

  /**
   * Stats command - Show database health and statistics.
   *
   * @example npx lna stats
   */
  program
    .command('stats')
    .description('Show database health and statistics')
    .action(async () => {
      const repoRoot = getRepoRoot();

      // Sync index to ensure accurate stats
      await syncIfNeeded(repoRoot);

      // Read lessons from JSONL to get accurate counts
      const { lessons } = await readLessons(repoRoot);
      const deletedCount = await countTombstones(repoRoot);
      const totalLessons = lessons.length;

      // Get retrieval stats from SQLite
      const retrievalStats = getRetrievalStats(repoRoot);
      const totalRetrievals = retrievalStats.reduce((sum, s) => sum + s.count, 0);
      const avgRetrievals = totalLessons > 0 ? (totalRetrievals / totalLessons).toFixed(AVG_DECIMAL_PLACES) : '0.0';

      // Get storage sizes
      const jsonlPath = join(repoRoot, LESSONS_PATH);
      const dbPath = join(repoRoot, DB_PATH);

      let dataSize = 0;
      let indexSize = 0;

      try {
        dataSize = statSync(jsonlPath).size;
      } catch {
        // File doesn't exist
      }

      try {
        indexSize = statSync(dbPath).size;
      } catch {
        // File doesn't exist
      }

      const totalSize = dataSize + indexSize;

      // Calculate age distribution
      let recentCount = 0;  // <30 days
      let mediumCount = 0;  // 30-90 days
      let oldCount = 0;     // >90 days
      for (const lesson of lessons) {
        const ageDays = getLessonAgeDays(lesson);
        if (ageDays < 30) {
          recentCount++;
        } else if (ageDays <= AGE_FLAG_THRESHOLD_DAYS) {
          mediumCount++;
        } else {
          oldCount++;
        }
      }

      // Format output
      const deletedInfo = deletedCount > 0 ? ` (${deletedCount} deleted)` : '';
      console.log(`Lessons: ${totalLessons} total${deletedInfo}`);

      // Show warning if lesson count exceeds threshold (context pollution prevention)
      if (totalLessons > LESSON_COUNT_WARNING_THRESHOLD) {
        out.warn(`High lesson count may degrade retrieval quality. Consider running \`lna compact\`.`);
      }

      // Show age distribution if lessons exist
      if (totalLessons > 0) {
        console.log(`Age: ${recentCount} <30d, ${mediumCount} 30-90d, ${oldCount} >90d`);
      }

      console.log(`Retrievals: ${totalRetrievals} total, ${avgRetrievals} avg per lesson`);
      console.log(`Storage: ${formatBytes(totalSize)} (index: ${formatBytes(indexSize)}, data: ${formatBytes(dataSize)})`);
    });

  /**
   * Export command - Export lessons as JSON to stdout.
   *
   * @example npx lna export
   * @example npx lna export --since 2024-01-15
   * @example npx lna export --tags typescript,testing
   */
  program
    .command('export')
    .description('Export lessons as JSON to stdout')
    .option('--since <date>', 'Only include lessons created after this date (ISO8601)')
    .option('--tags <tags>', 'Filter by tags (comma-separated, OR logic)')
    .action(async (options: { since?: string; tags?: string }) => {
      const repoRoot = getRepoRoot();

      const { lessons } = await readLessons(repoRoot);

      let filtered = lessons;

      // Filter by date if --since provided
      if (options.since) {
        const sinceDate = new Date(options.since);
        if (Number.isNaN(sinceDate.getTime())) {
          console.error(`Invalid date format: ${options.since}. Use ISO8601 format (e.g., 2024-01-15).`);
          process.exit(1);
        }
        filtered = filtered.filter((lesson) => new Date(lesson.created) >= sinceDate);
      }

      // Filter by tags if --tags provided (OR logic)
      if (options.tags) {
        const filterTags = options.tags.split(',').map((t) => t.trim());
        filtered = filtered.filter((lesson) => lesson.tags.some((tag) => filterTags.includes(tag)));
      }

      // Output JSON to stdout (portable format for sharing)
      console.log(JSON.stringify(filtered, null, JSON_INDENT_SPACES));
    });

  /**
   * Import command - Import lessons from a JSONL file.
   *
   * @example npx lna import lessons.jsonl
   */
  program
    .command('import <file>')
    .description('Import lessons from a JSONL file')
    .action(async (file: string) => {
      const repoRoot = getRepoRoot();

      // Read input file
      let content: string;
      try {
        content = await readFile(file, 'utf-8');
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          console.error(`Error: File not found: ${file}`);
        } else {
          console.error(`Error reading file: ${(err as Error).message}`);
        }
        process.exit(1);
      }

      // Get existing lesson IDs
      const { lessons: existingLessons } = await readLessons(repoRoot);
      const existingIds = new Set(existingLessons.map((l) => l.id));

      // Parse and validate each line
      const lines = content.split('\n');
      let imported = 0;
      let skipped = 0;
      let invalid = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Parse JSON
        let parsed: unknown;
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          invalid++;
          continue;
        }

        // Validate schema
        const result = LessonSchema.safeParse(parsed);
        if (!result.success) {
          invalid++;
          continue;
        }

        const lesson: Lesson = result.data;

        // Skip if ID already exists
        if (existingIds.has(lesson.id)) {
          skipped++;
          continue;
        }

        // Append lesson
        await appendLesson(repoRoot, lesson);
        existingIds.add(lesson.id);
        imported++;
      }

      // Format summary
      const lessonWord = imported === 1 ? 'lesson' : 'lessons';
      const parts: string[] = [];
      if (skipped > 0) parts.push(`${skipped} skipped`);
      if (invalid > 0) parts.push(`${invalid} invalid`);

      if (parts.length > 0) {
        console.log(`Imported ${imported} ${lessonWord} (${parts.join(', ')})`);
      } else {
        console.log(`Imported ${imported} ${lessonWord}`);
      }
    });

  // ==========================================================================
  // Prime Command (Context Recovery)
  // ==========================================================================

  /**
   * Prime command - Output workflow context for Claude Code.
   *
   * Used after compaction or context loss to remind Claude of the
   * learning-agent workflow, rules, and commands.
   *
   * @example npx lna prime
   */
  program
    .command('prime')
    .description('Output workflow context for Claude Code')
    .action(() => {
      console.log(PRIME_WORKFLOW_CONTEXT);
    });

  // ==========================================================================
  // CRUD Commands: show, update, delete
  // ==========================================================================

  /** JSON indentation for show output */
  const SHOW_JSON_INDENT = 2;

  /**
   * Show command - Display details of a specific lesson.
   *
   * @example npx lna show L12345678
   * @example npx lna show L12345678 --json
   */
  program
    .command('show <id>')
    .description('Show details of a specific lesson')
    .option('--json', 'Output as JSON')
    .action(async (id: string, options: { json?: boolean }) => {
      const repoRoot = getRepoRoot();

      const { lessons } = await readLessons(repoRoot);
      const lesson = lessons.find((l) => l.id === id);

      if (!lesson) {
        // Check if lesson was deleted (tombstone)
        const filePath = join(repoRoot, LESSONS_PATH);
        let wasDeleted = false;
        try {
          const content = await readFile(filePath, 'utf-8');
          const lines = content.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const record = JSON.parse(trimmed) as { id: string; deleted?: boolean };
              if (record.id === id && record.deleted === true) {
                wasDeleted = true;
                break;
              }
            } catch {
              // Skip invalid lines
            }
          }
        } catch {
          // File doesn't exist
        }

        if (options.json) {
          console.log(JSON.stringify({ error: wasDeleted ? `Lesson ${id} not found (deleted)` : `Lesson ${id} not found` }));
        } else {
          out.error(wasDeleted ? `Lesson ${id} not found (deleted)` : `Lesson ${id} not found`);
        }
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(lesson, null, SHOW_JSON_INDENT));
      } else {
        console.log(formatLessonHuman(lesson));
      }
    });

  /**
   * Update command - Update a lesson's mutable fields.
   *
   * @example npx lna update L12345678 --insight "New insight"
   * @example npx lna update L12345678 --severity high --tags "api,auth"
   */
  program
    .command('update <id>')
    .description('Update a lesson')
    .option('--insight <text>', 'Update insight')
    .option('--trigger <text>', 'Update trigger')
    .option('--evidence <text>', 'Update evidence')
    .option('--severity <level>', 'Update severity (low/medium/high)')
    .option('--tags <tags>', 'Update tags (comma-separated)')
    .option('--confirmed <bool>', 'Update confirmed status (true/false)')
    .option('--json', 'Output as JSON')
    .action(async (id: string, options: {
      insight?: string;
      trigger?: string;
      evidence?: string;
      severity?: string;
      tags?: string;
      confirmed?: string;
      json?: boolean;
    }) => {
      const repoRoot = getRepoRoot();

      // Check if any update options provided
      const hasUpdates = options.insight !== undefined
        || options.trigger !== undefined
        || options.evidence !== undefined
        || options.severity !== undefined
        || options.tags !== undefined
        || options.confirmed !== undefined;

      if (!hasUpdates) {
        if (options.json) {
          console.log(JSON.stringify({ error: 'No fields to update (specify at least one: --insight, --tags, --severity, ...)' }));
        } else {
          out.error('No fields to update (specify at least one: --insight, --tags, --severity, ...)');
        }
        process.exit(1);
      }

      // Read current lessons
      const { lessons } = await readLessons(repoRoot);
      const lesson = lessons.find((l) => l.id === id);

      if (!lesson) {
        // Check if deleted
        const filePath = join(repoRoot, LESSONS_PATH);
        let wasDeleted = false;
        try {
          const content = await readFile(filePath, 'utf-8');
          const lines = content.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const record = JSON.parse(trimmed) as { id: string; deleted?: boolean };
              if (record.id === id && record.deleted === true) {
                wasDeleted = true;
                break;
              }
            } catch {
              // Skip invalid lines
            }
          }
        } catch {
          // File doesn't exist
        }

        if (options.json) {
          console.log(JSON.stringify({ error: wasDeleted ? `Lesson ${id} is deleted` : `Lesson ${id} not found` }));
        } else {
          out.error(wasDeleted ? `Lesson ${id} is deleted` : `Lesson ${id} not found`);
        }
        process.exit(1);
      }

      // Validate severity if provided
      if (options.severity !== undefined) {
        const result = SeveritySchema.safeParse(options.severity);
        if (!result.success) {
          if (options.json) {
            console.log(JSON.stringify({ error: `Invalid severity '${options.severity}' (must be: high, medium, low)` }));
          } else {
            out.error(`Invalid severity '${options.severity}' (must be: high, medium, low)`);
          }
          process.exit(1);
        }
      }

      // Build updated lesson
      const updatedLesson: Lesson = {
        ...lesson,
        ...(options.insight !== undefined && { insight: options.insight }),
        ...(options.trigger !== undefined && { trigger: options.trigger }),
        ...(options.evidence !== undefined && { evidence: options.evidence }),
        ...(options.severity !== undefined && { severity: options.severity as Severity }),
        ...(options.tags !== undefined && {
          tags: [...new Set(
            options.tags
              .split(',')
              .map((t) => t.trim())
              .filter((t) => t.length > 0)
          )],
        }),
        ...(options.confirmed !== undefined && { confirmed: options.confirmed === 'true' }),
      };

      // Validate updated lesson against schema
      const validationResult = LessonSchema.safeParse(updatedLesson);
      if (!validationResult.success) {
        if (options.json) {
          console.log(JSON.stringify({ error: `Schema validation failed: ${validationResult.error.message}` }));
        } else {
          out.error(`Schema validation failed: ${validationResult.error.message}`);
        }
        process.exit(1);
      }

      // Append updated lesson (last-write-wins)
      await appendLesson(repoRoot, updatedLesson);
      await syncIfNeeded(repoRoot);

      if (options.json) {
        console.log(JSON.stringify(updatedLesson, null, SHOW_JSON_INDENT));
      } else {
        out.success(`Updated lesson ${id}`);
      }
    });

  /**
   * Delete command - Soft delete lessons by creating tombstone records.
   *
   * Creates a full lesson copy with `deleted: true` added so that
   * readLessons properly excludes the deleted lesson.
   *
   * @example npx lna delete L12345678
   * @example npx lna delete L001 L002 L003
   */
  program
    .command('delete <ids...>')
    .description('Soft delete lessons (creates tombstone)')
    .option('--json', 'Output as JSON')
    .action(async (ids: string[], options: { json?: boolean }) => {
      const repoRoot = getRepoRoot();

      const { lessons } = await readLessons(repoRoot);
      const lessonMap = new Map(lessons.map((l) => [l.id, l]));

      const deleted: string[] = [];
      const warnings: Array<{ id: string; message: string }> = [];

      for (const id of ids) {
        const lesson = lessonMap.get(id);

        if (!lesson) {
          // Check if already deleted or never existed
          const wasDeleted = await wasLessonDeleted(repoRoot, id);
          warnings.push({ id, message: wasDeleted ? 'already deleted' : 'not found' });
          continue;
        }

        // Create tombstone as full lesson copy with deleted: true and deletedAt
        // This ensures it passes schema validation in readLessons
        const tombstone: Lesson & { deleted: true; deletedAt: string } = {
          ...lesson,
          deleted: true,
          deletedAt: new Date().toISOString(),
        };

        // Append tombstone using appendLesson (casts to handle the deleted field)
        await appendLesson(repoRoot, tombstone as unknown as Lesson);

        deleted.push(id);
      }

      // Sync once at end
      if (deleted.length > 0) {
        await syncIfNeeded(repoRoot);
      }

      if (options.json) {
        console.log(JSON.stringify({ deleted, warnings }));
      } else {
        if (deleted.length > 0) {
          out.success(`Deleted ${deleted.length} lesson(s): ${deleted.join(', ')}`);
        }
        for (const warning of warnings) {
          out.warn(`${warning.id}: ${warning.message}`);
        }
        if (deleted.length === 0 && warnings.length > 0) {
          process.exit(1);
        }
      }
    });
}

// ============================================================================
// Prime Command (Context Recovery)
// ============================================================================

/** Workflow context output for Claude Code after compaction/context loss */
const PRIME_WORKFLOW_CONTEXT = `# Learning Agent Workflow

## Core Rules
- **NEVER** edit .claude/lessons/index.jsonl directly
- Use CLI commands: \`lna learn\`, \`lna list\`, \`lna show\`
- Lessons load automatically at session start

## When to Capture Lessons
- User corrects you ("no", "wrong", "actually...")
- You self-correct after multiple attempts
- Test fails then you fix it

## Commands
- \`lna learn "insight"\` - Capture a lesson
- \`lna list\` - Show all lessons
- \`lna check-plan --plan "..."\` - Get relevant lessons for plan
- \`lna stats\` - Show database health

## Quality Gate (ALL must pass before proposing)
- Novel (not already stored)
- Specific (clear guidance)
- Actionable (obvious what to do)
`;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format lesson for human-readable display.
 */
function formatLessonHuman(lesson: Lesson): string {
  const lines: string[] = [];

  lines.push(`ID: ${lesson.id}`);
  lines.push(`Type: ${lesson.type}`);
  lines.push(`Trigger: ${lesson.trigger}`);
  lines.push(`Insight: ${lesson.insight}`);

  if (lesson.evidence) {
    lines.push(`Evidence: ${lesson.evidence}`);
  }

  if (lesson.severity) {
    lines.push(`Severity: ${lesson.severity}`);
  }

  lines.push(`Tags: ${lesson.tags.length > 0 ? lesson.tags.join(', ') : '(none)'}`);
  lines.push(`Source: ${lesson.source}`);

  if (lesson.context) {
    lines.push(`Context: ${lesson.context.tool} - ${lesson.context.intent}`);
  }

  lines.push(`Created: ${lesson.created}`);
  lines.push(`Confirmed: ${lesson.confirmed ? 'yes' : 'no'}`);

  if (lesson.supersedes && lesson.supersedes.length > 0) {
    lines.push(`Supersedes: ${lesson.supersedes.join(', ')}`);
  }

  if (lesson.related && lesson.related.length > 0) {
    lines.push(`Related: ${lesson.related.join(', ')}`);
  }

  if (lesson.pattern) {
    lines.push('Pattern:');
    lines.push(`  Bad:  ${lesson.pattern.bad}`);
    lines.push(`  Good: ${lesson.pattern.good}`);
  }

  return lines.join('\n');
}

/**
 * Check if a lesson ID has been deleted (has a tombstone).
 */
async function wasLessonDeleted(repoRoot: string, id: string): Promise<boolean> {
  const filePath = join(repoRoot, LESSONS_PATH);
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const record = JSON.parse(trimmed) as { id: string; deleted?: boolean };
        if (record.id === id && record.deleted === true) {
          return true;
        }
      } catch {
        // Skip invalid lines
      }
    }
  } catch {
    // File doesn't exist
  }
  return false;
}
