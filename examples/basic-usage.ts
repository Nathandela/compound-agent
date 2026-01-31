/**
 * Basic usage example for learning-agent
 *
 * Demonstrates:
 * - Importing from the library
 * - Appending a lesson
 * - Reading lessons
 * - Searching lessons (keyword and vector)
 *
 * When installed as dependency, use:
 *   import { ... } from 'learning-agent';
 */

import {
  appendLesson,
  readLessons,
  searchKeyword,
  searchVector,
  rebuildIndex,
  generateId,
  closeDb,
  type QuickLesson,
  type FullLesson,
} from '../dist/index.js';

// Repository root - where .claude/lessons/ will be created
const repoRoot = process.cwd();

async function main() {
  // 1. Append a quick lesson
  const quickLesson: QuickLesson = {
    id: generateId('Use Polars instead of pandas for large datasets'),
    type: 'quick',
    trigger: 'Tried pandas on a 500MB CSV file, it was slow',
    insight: 'Use Polars instead of pandas for large datasets - 10x faster',
    tags: ['performance', 'python', 'data'],
    source: 'user_correction',
    context: {
      tool: 'edit',
      intent: 'Optimizing data processing script',
    },
    created: new Date().toISOString(),
    confirmed: true,
    supersedes: [],
    related: [],
  };

  await appendLesson(repoRoot, quickLesson);
  console.log('Appended quick lesson:', quickLesson.id);

  // 2. Append a full lesson (with evidence and severity)
  const fullLesson: FullLesson = {
    id: generateId('API requires X-Request-ID header for all requests'),
    type: 'full',
    trigger: 'Auth API returned 401 despite valid token',
    insight: 'API requires X-Request-ID header for all requests',
    evidence: 'Traced in network tab - header was missing from request',
    tags: ['api', 'auth', 'debugging'],
    severity: 'high',
    source: 'test_failure',
    context: {
      tool: 'bash',
      intent: 'Running auth integration tests',
    },
    created: new Date().toISOString(),
    confirmed: true,
    supersedes: [],
    related: [],
    pattern: {
      bad: "fetch(url, { headers: { 'Authorization': token } })",
      good: "fetch(url, { headers: { 'Authorization': token, 'X-Request-ID': crypto.randomUUID() } })",
    },
  };

  await appendLesson(repoRoot, fullLesson);
  console.log('Appended full lesson:', fullLesson.id);

  // 3. Read all lessons
  const { lessons, skippedCount } = await readLessons(repoRoot);
  console.log(`\nRead ${lessons.length} lessons (${skippedCount} skipped)`);
  for (const lesson of lessons) {
    console.log(`  [${lesson.id}] ${lesson.insight}`);
  }

  // 4. Keyword search (uses SQLite FTS5)
  // Rebuild index first to ensure it's up to date
  await rebuildIndex(repoRoot);

  const keywordResults = await searchKeyword(repoRoot, 'pandas polars', 5);
  console.log(`\nKeyword search for "pandas polars": ${keywordResults.length} results`);
  for (const lesson of keywordResults) {
    console.log(`  [${lesson.id}] ${lesson.insight}`);
  }

  // 5. Vector search (uses embeddings for semantic similarity)
  // Note: Requires model to be downloaded first (run `pnpm download-model`)
  try {
    const vectorResults = await searchVector(repoRoot, 'data processing performance', {
      limit: 5,
    });
    console.log(`\nVector search for "data processing performance": ${vectorResults.length} results`);
    for (const { lesson, score } of vectorResults) {
      console.log(`  [${lesson.id}] (score: ${score.toFixed(3)}) ${lesson.insight}`);
    }
  } catch (error) {
    console.log('\nVector search skipped - model not downloaded');
    console.log('Run: pnpm download-model');
  }

  // Clean up database connection
  closeDb();
}

main().catch(console.error);
