# Agent Instructions

This document provides machine-readable context for AI agents working on this codebase.

For detailed project rules and TDD workflow, see `.claude/CLAUDE.md`.

---

## Project Overview

**Name**: Compound Agent
**Purpose**: Semantically-intelligent workflow plugin that helps Claude Code avoid repeating mistakes across sessions
**Type**: TypeScript library, deployable as dev dependency
**Package Manager**: pnpm

### What It Does

1. Captures lessons from user corrections, self-corrections, and test failures
2. Stores lessons in JSONL (git-tracked) with SQLite index (cache)
3. Retrieves relevant lessons via local embeddings (EmbeddingGemma-300M)
4. Injects lessons at session-start and plan-time

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Types/Schemas | `src/memory/types.ts` | Zod schemas for Lesson and LessonRecord |
| Storage | `src/memory/storage/` | JSONL append-only + SQLite FTS5 index |
| Embeddings | `src/memory/embeddings/` | node-llama-cpp with EmbeddingGemma-300M |
| Search | `src/memory/search/` | Vector similarity + ranking with boosts |
| Capture | `src/memory/capture/` | Trigger detection + quality filters |
| Retrieval | `src/memory/retrieval/` | Session-start and plan-time retrieval |
| Setup | `src/setup/` | Init, hooks, templates, Claude integration |
| Commands | `src/commands/` | CLI command registrations |
| CLI | `src/cli.ts` | Commander.js entry point |
| Public API | `src/index.ts` | All exports for library consumers |

### Architecture

```
.claude/                        (per-repository)
  lessons/
    index.jsonl                 <- Source of truth (git-tracked)
    archive/                    <- Compacted old lessons
  .cache/
    lessons.sqlite              <- Rebuildable index (.gitignore)

~/.node-llama-cpp/models/       <- Global embedding model cache
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

# Download embedding model (~278MB)
pnpm download-model

# Development build with watch
pnpm dev
```

### CLI Usage

```bash
# After build, run CLI directly
node ./dist/cli.js <command>

# Commands
node ./dist/cli.js download-model   # Download EmbeddingGemma-300M model
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
- `src/memory/storage/index.ts` - Storage operations
- `src/memory/embeddings/index.ts` - Embedding operations
- `src/memory/search/index.ts` - Search operations
- `src/memory/capture/index.ts` - Capture operations
- `src/memory/retrieval/index.ts` - Retrieval operations
- `src/setup/index.ts` - Setup command registrations

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

### Zod Schemas (src/memory/types.ts)

```typescript
// Memory item schemas (current format)
MemoryItemSchema        // Base memory item (all fields, optional except core)
MemoryItemRecordSchema  // Union: MemoryItemSchema | legacy formats (for reading JSONL)
MemoryItemTypeSchema    // "lesson" | "solution" | "pattern" | "preference"

// Specialized item schemas
LessonItemSchema        // type: "lesson" - mistakes and corrections
SolutionItemSchema      // type: "solution" - working approaches
PatternItemSchema       // type: "pattern" - recurring code patterns
PreferenceItemSchema    // type: "preference" - user preferences

// Legacy schemas (backward compatibility)
LessonSchema            // Original lesson format
LessonRecordSchema      // Union: LessonSchema | LegacyTombstoneSchema
LessonTypeSchema        // "mistake" | "preference" | "procedure"
LegacyLessonSchema      // Pre-v1 lesson format
LegacyTombstoneSchema   // Minimal tombstone record for deletions
```

### Public Exports (src/index.ts)

All public API is exported from `src/index.ts`:

```typescript
// Storage
appendLesson, appendMemoryItem, readLessons, readMemoryItems
rebuildIndex, searchKeyword, closeDb, DB_PATH, LESSONS_PATH

// Embeddings
embedText, embedTexts, getEmbedding, unloadEmbedding
isModelAvailable, isModelUsable, resolveModel
MODEL_FILENAME, MODEL_URI

// Search
searchVector, cosineSimilarity, calculateScore
rankLessons, rankMemoryItems
severityBoost, recencyBoost, confirmationBoost

// Capture
shouldPropose, isNovel, isSpecific, isActionable
detectUserCorrection, detectSelfCorrection, detectTestFailure

// Retrieval
loadSessionLessons, loadSessionMemory
retrieveForPlan, formatLessonsCheck, formatMemoryCheck

// Context Recovery
getPrimeContext

// Types & Schemas
generateId
LessonSchema, LessonRecordSchema, LessonTypeSchema
MemoryItemSchema, MemoryItemRecordSchema, MemoryItemTypeSchema
LessonItemSchema, SolutionItemSchema, PatternItemSchema, PreferenceItemSchema
LegacyLessonSchema, LegacyTombstoneSchema

// Constants
VERSION

// Audit API
runAudit, AuditFindingSchema, AuditReportSchema
type AuditFinding, AuditReport, AuditOptions

// Compound API (clustering, synthesis, pattern I/O)
buildSimilarityMatrix, CCT_PATTERNS_PATH, CctPatternSchema
clusterBySimilarity, readCctPatterns, synthesizePattern, writeCctPatterns
type CctPattern, ClusterResult
```

### Function Signatures

Key functions follow consistent patterns:

```typescript
// Storage: (repoRoot, data) -> Promise<void>
appendLesson(repoRoot: string, lesson: Lesson): Promise<void>
appendMemoryItem(repoRoot: string, item: MemoryItem): Promise<void>

// Search: (repoRoot, query, options) -> Promise<Result[]>
searchVector(repoRoot: string, query: string, options?: SearchVectorOptions): Promise<ScoredMemoryItem[]>

// Ranking: (items) -> RankedResult[]
rankMemoryItems(items: ScoredMemoryItem[]): RankedMemoryItem[]

// Detection: (input) -> DetectedResult | null
detectUserCorrection(message: string): DetectedCorrection | null

// Retrieval: (repoRoot, ...) -> Promise<string>
loadSessionMemory(repoRoot: string): Promise<string>
retrieveForPlan(repoRoot: string, planText: string): Promise<PlanRetrievalResult>
getPrimeContext(repoRoot: string): Promise<string>

// Audit: (repoRoot, options?) -> Promise<AuditReport>
runAudit(repoRoot: string, options?: AuditOptions): Promise<AuditReport>

// Compound: clustering and synthesis
buildSimilarityMatrix(embeddings: number[][]): number[][]
clusterBySimilarity(items: MemoryItem[], embeddings: number[][], threshold?: number): ClusterResult
synthesizePattern(cluster: MemoryItem[], clusterId: string): CctPattern

// Compound I/O: (repoRoot) -> Promise<CctPattern[]>
readCctPatterns(repoRoot: string): Promise<CctPattern[]>
writeCctPatterns(repoRoot: string, patterns: CctPattern[]): Promise<void>
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
- 100% pass rate required
- Unconditional test skips not allowed for business logic
- Conditional skips (`skipIf`) allowed for environment-native tests (embeddings)

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

## Compound Agent Integration

This section explains HOW and WHEN Claude should interact with the compound-agent memory system.

### Workflow Commands

| Command | Phase | Description |
|---------|-------|-------------|
| `/compound:spec-dev` | Spec Dev | Develop precise specifications through Socratic dialogue, EARS notation, and Mermaid diagrams |
| `/compound:plan` | Plan | Create structured plan enriched by semantic memory |
| `/compound:work` | Work | Execute plan with agent teams and TDD |
| `/compound:review` | Review | Multi-agent review with inter-communication |
| `/compound:compound` | Compound | Capture knowledge, feed back into memory |
| `/compound:cook-it` | All | Chain all 5 phases sequentially |

### CLI

| Command | Purpose |
|---------|---------|
| `npx ca prime` | Load session context (high-severity lessons) |
| `npx ca search <query>` | Search lessons |
| `npx ca learn --trigger "..." --insight "..."` | Capture a lesson |
| `npx ca list` | List all lessons |
| `npx ca stats` | Database health |
| `npx ca verify-gates <epic-id>` | Verify review + compound tasks exist and are closed |
| `npx ca phase-check` | Manage cook-it phase state (init/status/clean/gate) |

### Core Principle

**Quality over quantity.** Most sessions should have NO new lessons. Only capture lessons that are:
- **Novel** - Not already in the lesson database
- **Specific** - Clear, actionable guidance (not "write better code")
- **Actionable** - Concrete behavior to change

---

### Mandatory Recall

#### Session Start (Automatic via hooks)

`npx ca prime` runs automatically via `.claude/settings.json` hooks at SessionStart and PreCompact.

#### Before Architectural Decisions

Before making architectural decisions or choosing between approaches, run `npx ca search <query>` to check for relevant past lessons.

---

### Lesson Capture Flow

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

**If ANY check fails -> DO NOT propose the lesson.**

#### Confirmation UX

```
Learned: [insight]. Confirm to save?
```

**Rules:**
- Keep insight concise (one sentence)
- User must explicitly confirm with "yes" or similar
- Silence or other response = do not save
- After confirmation, use `npx ca learn --yes`

---

### Never Edit JSONL Directly

**WARNING: NEVER directly edit `.claude/lessons/index.jsonl`.**

Direct edits bypass schema validation, embedding sync, and SQLite index updates. Always use:
1. `npx ca learn` CLI

---

### Anti-Patterns (DO NOT)

| Pattern | Why It's Wrong |
|---------|----------------|
| Propose vague lessons | "Write better code" is not actionable |
| Auto-save without confirmation | User must explicitly confirm |
| Ignore quality gate | Leads to lesson database bloat |
| Propose every correction | Most corrections don't need lessons |
| Edit index.jsonl directly | Breaks schema/validation/sync |

---

### Setup

Run `npx ca init` in a project root to configure:
- `.claude/settings.json` - Hooks (SessionStart, PreCompact, UserPromptSubmit, PostToolUseFailure, PostToolUse)
- `AGENTS.md` - Agent instructions
- `.claude/CLAUDE.md` - Project reference
- `.claude/commands/` - Slash commands (/learn, /show, /wrong, /stats)
- Pre-commit hook - Capture reminder

---

## References

| Document | Purpose |
|----------|---------|
| `.claude/CLAUDE.md` | Detailed project rules and TDD workflow |
| `docs/ARCHITECTURE-V2.md` | Architecture vision and workflow design |
| `docs/INDEX.md` | Full documentation map |
| `CHANGELOG.md` | Version history and release notes |

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
