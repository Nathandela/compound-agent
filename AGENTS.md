# Agent Instructions

This document provides machine-readable context for AI agents working on this codebase.

For detailed project rules and TDD workflow, see `.claude/CLAUDE.md`.

---

## Project Overview

**Name**: Learning Agent
**Purpose**: Repository-scoped learning system that helps Claude Code avoid repeating mistakes across sessions
**Type**: TypeScript library, deployable as dev dependency
**Package Manager**: pnpm

### What It Does

1. Captures lessons from user corrections, self-corrections, and test failures
2. Stores lessons in JSONL (git-tracked) with SQLite index (cache)
3. Retrieves relevant lessons via local embeddings (nomic-embed-text)
4. Injects lessons at session-start and plan-time

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Types/Schemas | `src/types.ts` | Zod schemas for Lesson, QuickLesson, FullLesson |
| Storage | `src/storage/` | JSONL append-only + SQLite FTS5 index |
| Embeddings | `src/embeddings/` | node-llama-cpp with nomic model |
| Search | `src/search/` | Vector similarity + ranking with boosts |
| Capture | `src/capture/` | Trigger detection + quality filters |
| Retrieval | `src/retrieval/` | Session-start and plan-time retrieval |
| CLI | `src/cli.ts` | Commander.js commands |
| Public API | `src/index.ts` | All exports for library consumers |

### Architecture

```
.claude/                        (per-repository)
  lessons/
    index.jsonl                 <- Source of truth (git-tracked)
    archive/                    <- Compacted old lessons
  .cache/
    lessons.sqlite              <- Rebuildable index (.gitignore)

~/.cache/learning-agent/models/ <- Global embedding model cache
```

---

## Build, Test, Run Commands

```bash
# Install dependencies
pnpm install

# Build TypeScript to dist/
pnpm build

# Run all tests (requires model download first)
pnpm test:all

# Run tests (without embedding tests if model missing)
pnpm test

# Watch mode
pnpm test:watch

# Type checking (lint)
pnpm lint

# Download embedding model (~500MB)
pnpm download-model

# Development build with watch
pnpm dev
```

### CLI Usage

```bash
# After build, run CLI directly
node ./dist/cli.js <command>

# Commands
node ./dist/cli.js download-model   # Download nomic-embed-text model
```

---

## Code Style and Conventions

### TypeScript Configuration

- **Target**: ES2022
- **Module**: ESNext with bundler resolution
- **Strict mode**: Enabled (all strict flags on)
- **Additional checks**: noUnusedLocals, noUnusedParameters, noImplicitReturns, noUncheckedIndexedAccess

### File Organization

- Source files: `src/**/*.ts`
- Test files: `src/**/*.test.ts` (colocated with implementation)
- Public API: Export through `src/index.ts` only
- Internal modules: Do NOT export through index.ts

### Naming Conventions

- **Files**: kebab-case (e.g., `vector.ts`, `quality.ts`)
- **Functions**: camelCase, verb-first (e.g., `appendLesson`, `detectUserCorrection`)
- **Types**: PascalCase (e.g., `Lesson`, `ScoredLesson`)
- **Schemas**: PascalCase with Schema suffix (e.g., `LessonSchema`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `LESSONS_PATH`, `DB_PATH`)

### Documentation

- JSDoc on all public functions
- Type annotations on all public APIs
- No emojis in code or comments

### Module Boundaries

Each module exports through its `index.ts`:
- `src/storage/index.ts` - Storage operations
- `src/embeddings/index.ts` - Embedding operations
- `src/search/index.ts` - Search operations
- `src/capture/index.ts` - Capture operations
- `src/retrieval/index.ts` - Retrieval operations

---

## Security and Data Handling

### Secrets

- DO NOT hardcode API keys, tokens, or credentials
- DO NOT log sensitive data (PII, tokens, passwords)
- DO NOT include secrets in test fixtures

### SQL Injection Prevention

All SQLite queries use parameterized statements:

```typescript
// CORRECT - parameterized
db.prepare('SELECT * FROM lessons WHERE id = ?').get(id);

// WRONG - string interpolation
db.prepare(`SELECT * FROM lessons WHERE id = '${id}'`);
```

### File Paths

- Use `path.join()` for constructing file paths
- Always resolve to absolute paths before file operations
- Validate that paths are within expected directories

### Error Handling

- Embedding failures: Hard fail (no silent fallback)
- File read errors: Throw with descriptive message
- Invalid lesson data: Validate with Zod, reject malformed

---

## API Contracts

### Zod Schemas (src/types.ts)

```typescript
// All lesson types validated at runtime
LessonSchema        // Discriminated union of Quick|Full
QuickLessonSchema   // Minimal structure for fast capture
FullLessonSchema    // Complete structure with evidence, severity, pattern
TombstoneSchema     // Delete marker for append-only storage
```

### Public Exports (src/index.ts)

All public API is exported from `src/index.ts`:

```typescript
// Storage
appendLesson, readLessons, LESSONS_PATH
rebuildIndex, searchKeyword, closeDb, DB_PATH

// Embeddings
embedText, embedTexts, getEmbedding, unloadEmbedding
ensureModel, getModelPath

// Search
searchVector, cosineSimilarity, rankLessons, calculateScore

// Capture
shouldPropose, isNovel, isSpecific, isActionable
detectUserCorrection, detectSelfCorrection, detectTestFailure

// Retrieval
loadSessionLessons, retrieveForPlan, formatLessonsCheck

// Types
generateId, LessonSchema, QuickLessonSchema, FullLessonSchema
```

### Function Signatures

Key functions follow consistent patterns:

```typescript
// Storage: (repoRoot, data) -> Promise<void>
appendLesson(repoRoot: string, lesson: Lesson): Promise<void>

// Search: (repoRoot, query, options) -> Promise<Result[]>
searchVector(repoRoot: string, query: string, options?: SearchOptions): Promise<ScoredLesson[]>

// Detection: (input) -> DetectedResult | null
detectUserCorrection(message: string): DetectedCorrection | null
```

---

## Common Pitfalls

### DO NOT

1. **DO NOT mock business logic in tests**
   - Mock only external dependencies (file system, network)
   - Test real functions with real data

2. **DO NOT write tests after implementation**
   - Follow TDD: write tests FIRST, then implement
   - Use verification subagents (see `.claude/CLAUDE.md`)

3. **DO NOT skip embedding model download**
   - Run `pnpm download-model` before running full test suite
   - Tests that need embeddings will fail without the model

4. **DO NOT modify tests to make them pass**
   - If tests seem wrong, discuss with user first
   - Tests define expected behavior

5. **DO NOT use string interpolation in SQL**
   - Always use parameterized queries
   - SQLite injection is a real risk

6. **DO NOT export internal modules through index.ts**
   - Only export the public API surface
   - Internal utilities stay internal

7. **DO NOT use global mutable state**
   - Pass dependencies explicitly
   - Use function parameters, not globals

8. **DO NOT commit without running tests**
   - `pnpm test` must pass before commit
   - `pnpm lint` must pass before commit

9. **DO NOT use pandas (or equivalent heavy libraries)**
   - This is a lightweight library
   - Keep dependencies minimal

10. **DO NOT log sensitive lesson content in production**
    - Lessons may contain code patterns
    - Debug logging only in development

### Testing Requirements

- Tests colocated with source files (`*.test.ts`)
- Use Vitest for all tests
- Property-based tests with fast-check where appropriate
- 100% pass rate required, no skipped tests

### Embedding Tests

Embedding tests require the model to be downloaded:

```bash
# Download model first
pnpm download-model

# Then run tests
pnpm test:all
```

Tests check `SKIP_EMBEDDING_TESTS` environment variable:
- Set `SKIP_EMBEDDING_TESTS=1` to skip embedding tests
- CI should run `pnpm test:all` for full coverage

---

## References

| Document | Purpose |
|----------|---------|
| `.claude/CLAUDE.md` | Detailed project rules and TDD workflow |
| `doc/SPEC.md` | Complete specification |
| `doc/CONTEXT.md` | Research and design decisions |
| `doc/PLAN.md` | Implementation plan |
