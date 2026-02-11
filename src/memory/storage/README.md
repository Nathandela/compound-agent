# Storage Module

Dual-layer storage: JSONL as source of truth, SQLite as search index.

## Files

- **jsonl.ts** - Append-only JSONL storage for lessons
  - `appendLesson()` - Write lesson to JSONL file
  - `readLessons()` - Read all lessons with last-write-wins deduplication
  - `LESSONS_PATH` - Relative path: `.claude/lessons/index.jsonl`

- **sqlite.ts** - SQLite with FTS5 for keyword search
  - `openDb()` / `closeDb()` - Singleton database management
  - `rebuildIndex()` - Rebuild SQLite from JSONL source
  - `searchKeyword()` - Full-text search using FTS5
  - `DB_PATH` - Relative path: `.claude/.cache/lessons.sqlite`

## Dependencies

- Depends on: `../types.js` for Lesson schema
- Used by: `capture/quality.ts`, `retrieval/session.ts`, `search/vector.ts`

## Architecture Notes

- JSONL is git-tracked, SQLite is in `.gitignore`
- SQLite index is fully rebuildable from JSONL
- Uses WAL mode for concurrent access
