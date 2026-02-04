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
// Record types for JSONL storage
LessonSchema        // Unified lesson schema (all fields, optional except core)
TombstoneSchema     // Minimal deletion marker: { id, deleted: true, deletedAt }
LessonRecordSchema  // Union: LessonSchema | TombstoneSchema (for reading JSONL)

// Type guards
isLesson(record)    // Check if record is a lesson (not deleted)
isTombstone(record) // Check if record is a tombstone (deleted)
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
generateId, LessonSchema, TombstoneSchema, LessonRecordSchema
isLesson, isTombstone  // Type guards
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

## Using Learning Agent (Claude Integration)

This section explains HOW and WHEN Claude should interact with the learning-agent system.

### Core Principle

**Quality over quantity.** Most sessions should have NO new lessons. Only capture lessons that are:
- **Novel** - Not already in the lesson database
- **Specific** - Clear, actionable guidance (not "write better code")
- **Actionable** - Concrete behavior to change

---

### 1. Lesson Retrieval Flow

#### Session Start (Automatic)

When a new session begins, load high-severity lessons:

```bash
npx learning-agent load-session --json
```

**What to do with results:**
- Inject high-severity lessons into context
- These are critical lessons that should always be visible
- Format: Short summary in session preamble

**Output example:**
```json
{
  "lessons": [
    {"id": "abc12", "insight": "Use Polars not pandas for files >100MB", "source": "user_correction"}
  ],
  "count": 1
}
```

#### Plan-Time Retrieval (On Plan Creation)

When creating or reviewing a plan, retrieve semantically relevant lessons:

```bash
echo "Add authentication with JWT tokens" | npx learning-agent check-plan --json
# OR
npx learning-agent check-plan --plan "Add authentication with JWT tokens" --json
```

**What to do with results:**
- Display as "Lessons Check" after the plan
- Consider each lesson while implementing
- Lessons are ranked by relevance score

**Output example:**
```json
{
  "lessons": [
    {"id": "xyz34", "insight": "JWT tokens need X-Request-ID header", "relevance": 0.87, "source": "test_failure"}
  ],
  "count": 1
}
```

**Important:** No per-tool retrieval. All context injection happens at plan time only.

---

### 2. Lesson Capture Flow

#### Trigger Detection

Propose a lesson when ANY of these triggers occur:

| Trigger | Signal | Example |
|---------|--------|---------|
| **User Correction** | User says "no", "wrong", "actually..." | "Actually, use v2 of the API" |
| **Self-Correction** | Claude iterates: edit -> fail -> re-edit | Fixed bug after multiple attempts |
| **Test Failure** | Test fails -> fix -> passes | Auth test failed due to missing header |
| **Manual** | User says "remember this" or `/learn` | "Remember: always run lint before commit" |

#### Quality Gate (MANDATORY)

Before proposing ANY lesson, verify ALL THREE criteria:

```
[ ] Is this NOVEL?     - Not already in lessons database
[ ] Is this SPECIFIC?  - Clear, concrete guidance
[ ] Is this ACTIONABLE? - Obvious what to do differently
```

**If ANY check fails → DO NOT propose the lesson.**

#### Confirmation UX

When proposing a lesson, describe what you learned and ask for confirmation:

```
Learned: [insight]. Confirm to save?
```

**Examples:**
```
Learned: Use Polars for files >100MB instead of pandas. Confirm to save?
```

```
Learned: API v2 requires X-Request-ID header. Confirm to save?
```

**Rules:**
- Keep insight concise (one sentence)
- User must explicitly confirm with "yes" or similar
- Silence or other response = do not save
- After confirmation, use `lesson_capture` MCP tool (preferred) or CLI with `--yes`

#### Capture Command

After user confirms, save the lesson:

```bash
npx learning-agent capture \
  --trigger "Used pandas for 500MB file, was too slow" \
  --insight "Use Polars for files >100MB" \
  --yes --json
```

**From input file (auto-detect trigger):**
```bash
npx learning-agent capture --input conversation.json --yes --json
```

---

### 3. Session-End Protocol (Compound Check)

At the end of a task, run a parallel reflection to propose lessons while context is fresh.

#### When to Run

**Preconditions (ALL must be true):**
- Problem was solved
- Solution verified (user confirmed OR tests pass)
- Non-trivial work was done

#### Reflection Process

Run these checks in parallel:

1. **Context Analysis**: Summarize plan + tool calls + git diff + test output
2. **Mistake/Lesson Extraction**: Identify missteps, corrections, and fixes
3. **Related/Contradiction Check**: Link related lessons, mark supersedes
4. **Prevention Strategy**: Turn lessons into actionable guidance
5. **Classification**: Quick vs Full lesson, severity level
6. **Proposal**: Propose lessons that pass quality gate

#### Output

Only propose lessons that pass the quality filter. Use the standard confirmation UX:

```
Session complete. Reflecting on lessons learned...

Learned: Always verify API version before integration. Confirm to save?
```

---

### 4. CLI Quick Reference

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `load-session` | Load high-severity lessons | Session start |
| `check-plan --plan "..."` | Retrieve lessons for plan | Plan creation |
| `capture --trigger "..." --insight "..."` | Save confirmed lesson | After user confirms |
| `search <query>` | Search lessons by keyword | Manual lookup |
| `list` | List all lessons | Debug/review |
| `stats` | Show database health | Diagnostics |

**Common flags:**
- `--json` - Machine-readable output (use in hooks)
- `--quiet` - Suppress non-essential output
- `-n, --limit <N>` - Limit results

---

### 5. Integration Points

#### Claude Code Hooks

Learning-agent integrates via Claude Code hooks:

```yaml
# .claude/hooks.yml (example)
hooks:
  session_start:
    - command: "npx learning-agent load-session --json"
      inject: context

  plan_created:
    - command: "npx learning-agent check-plan --json"
      inject: after_plan
```

#### CLAUDE.md Integration

Reference learning-agent in project CLAUDE.md:

```markdown
## Learning Agent

This project uses learning-agent for session memory.
- Lessons loaded at session start (high-severity)
- Lessons checked at plan time (semantic search)
- Compound check at task end

See `.claude/lessons/` for lesson history.
```

---

### 6. Anti-Patterns (DO NOT)

| Pattern | Why It's Wrong |
|---------|----------------|
| Propose vague lessons | "Write better code" is not actionable |
| Auto-save without confirmation | User must explicitly confirm |
| Retrieve per-tool | Too noisy, plan-time only |
| Ignore quality gate | Leads to lesson database bloat |
| Propose every correction | Most corrections don't need lessons |
| Skip compound check | Misses valuable end-of-task insights |

---

### 7. Example Session Flow

```
SESSION START
├─ load-session --json
│   └─ [2 high-severity lessons injected]
│
├─ User: "Add JWT authentication"
│
PLAN CREATED
├─ check-plan --plan "Add JWT authentication" --json
│   └─ [1 relevant lesson: "JWT needs X-Request-ID header"]
│
├─ Display: "## Lessons Check
│            1. JWT needs X-Request-ID header (relevance: 0.87)"
│
IMPLEMENTATION
├─ [Claude implements with lesson in mind]
├─ User: "Actually, use RS256 not HS256"
│
TRIGGER DETECTED (user correction)
├─ Quality check: Novel? Yes. Specific? Yes. Actionable? Yes.
├─ Display: "Learned: Use RS256 algorithm for JWT signing. Confirm to save?"
├─ User: "yes"
├─ [Claude calls lesson_capture MCP tool or capture --yes]
│
TASK COMPLETE
├─ Compound check (parallel reflection)
├─ No additional lessons pass quality gate
│
SESSION END
└─ [No pending lessons]
```

---

## References

| Document | Purpose |
|----------|---------|
| `.claude/CLAUDE.md` | Detailed project rules and TDD workflow |
| `doc/SPEC.md` | Complete specification |
| `doc/CONTEXT.md` | Research and design decisions |
| `doc/PLAN.md` | Implementation plan |
