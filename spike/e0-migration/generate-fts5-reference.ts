/**
 * Generate FTS5 reference query results from the current better-sqlite3 implementation.
 * These will be compared against go-sqlite3 output to validate A1.
 *
 * Output: fts5-reference.json — array of {query, results} pairs
 */

import Database from 'better-sqlite3';
import { writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Test queries covering different FTS5 features
const FTS5_QUERIES = [
  // Simple term
  'embedding',
  'sqlite',
  'search',
  'hook',

  // Multi-term (implicit AND)
  'embedding search',
  'process zombie',
  'test failure',

  // Phrase
  '"zombie process"',
  '"search ranking"',

  // OR
  'embedding OR vector',
  'hook OR daemon',

  // NOT
  'search NOT vector',

  // Prefix
  'embed*',
  'test*',
  'proc*',

  // Column filter
  'insight: embedding',
  'tags: performance',
  'trigger: test',

  // BM25 ranking
  'embedding model performance',
  'sqlite fts5 search',

  // Edge cases
  'nonexistentterm12345',
  '*',
];

async function main() {
  // Copy the current lessons.sqlite to spike dir for testing
  const srcDb = join(process.cwd(), '.claude', '.cache', 'lessons.sqlite');
  const destDb = join(__dirname, 'reference-lessons.sqlite');

  if (!existsSync(srcDb)) {
    console.error(`Source DB not found: ${srcDb}`);
    process.exit(1);
  }

  copyFileSync(srcDb, destDb);
  console.log(`Copied ${srcDb} to ${destDb}`);

  const db = new Database(destDb, { readonly: true });

  // Get table info for context
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'lessons_fts'").get() as { sql: string } | undefined;
  console.log(`FTS5 table: ${tableInfo?.sql}`);

  const rowCount = db.prepare('SELECT COUNT(*) as cnt FROM lessons WHERE deleted = 0').get() as { cnt: number };
  console.log(`Lesson count: ${rowCount.cnt}`);

  const results: Array<{ query: string; results: Array<{ id: string; rank: number }>; error?: string }> = [];

  for (const query of FTS5_QUERIES) {
    try {
      const rows = db.prepare(`
        SELECT lessons.id, rank
        FROM lessons_fts
        JOIN lessons ON lessons.rowid = lessons_fts.rowid
        WHERE lessons_fts MATCH ?
        AND lessons.deleted = 0
        ORDER BY rank
        LIMIT 20
      `).all(query) as Array<{ id: string; rank: number }>;

      results.push({ query, results: rows });
      console.log(`  "${query}" => ${rows.length} results`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ query, results: [], error: msg });
      console.log(`  "${query}" => ERROR: ${msg}`);
    }
  }

  const outPath = join(__dirname, 'fts5-reference.json');
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nWrote ${results.length} query results to ${outPath}`);

  // Also export the schema SQL for Go to recreate
  const schemaSql = db.prepare("SELECT sql FROM sqlite_master WHERE type IN ('table', 'trigger') ORDER BY name").all() as Array<{ sql: string }>;
  const schemaPath = join(__dirname, 'fts5-schema.json');
  writeFileSync(schemaPath, JSON.stringify(schemaSql.map(r => r.sql).filter(Boolean), null, 2));
  console.log(`Wrote schema to ${schemaPath}`);

  // Export lesson data for Go to import
  const lessons = db.prepare('SELECT * FROM lessons WHERE deleted = 0').all();
  const dataPath = join(__dirname, 'fts5-test-data.json');
  writeFileSync(dataPath, JSON.stringify(lessons, null, 2));
  console.log(`Wrote ${lessons.length} lessons to ${dataPath}`);

  db.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
