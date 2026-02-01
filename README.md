# Learning Agent

A repository-scoped learning system that helps Claude Code avoid repeating mistakes across sessions. Captures lessons from corrections and retrieves them when relevant.

## Overview

Claude Code forgets lessons between sessions. This leads to:
- Repeated mistakes across sessions
- Users re-explaining preferences
- No memory of what worked or failed

Learning Agent solves this by capturing lessons when corrections happen and retrieving relevant ones at session start and plan time.

## Installation

```bash
# Using pnpm (recommended)
pnpm add -D learning-agent

# Using npm
npm install --save-dev learning-agent
```

After installation, download the embedding model (~278MB, one-time):

```bash
npx learning-agent download-model
```

### Requirements

- Node.js >= 20
- ~278MB disk space for embedding model
- ~150MB RAM for embedding operations

## Quick Start

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Download embedding model (first use)
pnpm download-model
```

## Development

### Test Scripts

| Script | Duration | Tests | Use Case |
|--------|----------|-------|----------|
| `pnpm test:fast` | ~6s | 385 | **Rapid feedback during development** |
| `pnpm test` | ~60s | 653 | Full suite before committing |
| `pnpm test:changed` | varies | varies | Only tests affected by recent changes |
| `pnpm test:watch` | - | - | Watch mode for TDD workflow |
| `pnpm test:all` | ~60s | 653 | Full suite with model download |

**Recommended workflow:**
1. Use `pnpm test:fast` while coding for rapid feedback
2. Run `pnpm test` before committing
3. CI runs the full suite

### Why test:fast is fast

The CLI integration tests spawn Node.js processes (~400ms overhead each) and account for 95% of test time. `test:fast` skips these, running only unit tests that verify all business logic.

## Architecture

```
.claude/                        (repository scope)
|-- CLAUDE.md                   <- Always loaded (permanent rules)
|-- lessons/
|   |-- index.jsonl             <- Source of truth (git-tracked)
|   +-- archive/                <- Old lessons (compacted)
+-- .cache/
    +-- lessons.sqlite          <- Rebuildable index (.gitignore)
```

### Data Flow

```
+----------+    +----------+    +----------+    +----------+
| Mistake  |--->| Claude   |--->| Quick    |--->| Stored   |
| happens  |    | notices  |    | confirm  |    | lesson   |
+----------+    +----------+    +----------+    +----------+
                     |              |
                (or user          [y/n]
                 corrects)

+----------+    +----------+    +----------+
|  Next    |<---| Retrieve |<---| Session  |
|  task    |    | relevant |    |  start   |
+----------+    +----------+    +----------+
```

## Features

- **Lesson Capture**: Detects user corrections, self-corrections, and test failure fixes
- **Quality Filter**: Prevents vague or obvious lessons (must be novel, specific, actionable)
- **Vector Search**: Local semantic search using nomic-embed-text-v1.5 via node-llama-cpp
- **Hybrid Storage**: JSONL source of truth (git-tracked) with SQLite FTS5 index (rebuildable)
- **Offline First**: No external API dependencies; works completely offline
- **Retrieval Timing**: High-severity lessons at session start; relevant lessons at plan time

## CLI Usage

```bash
# Capture a lesson manually
pnpm learn "Use Polars for large files, not pandas"

# Capture with citation (file:line provenance)
learning-agent learn "API requires auth header" --citation src/api.ts:42

# Search lessons
learning-agent search "data processing"

# List all lessons
learning-agent list

# List only invalidated lessons
learning-agent list --invalidated

# Mark a lesson as wrong/invalid
learning-agent wrong L12345678 --reason "This advice was incorrect"

# Re-enable an invalidated lesson
learning-agent validate L12345678

# Show database stats (includes age distribution)
learning-agent stats

# Rebuild index from JSONL
learning-agent rebuild

# Compact and archive old lessons
learning-agent compact
```

## Claude Code Integration

### Automatic Setup (Recommended)

```bash
# Install hooks into Claude Code settings (global)
npx learning-agent setup claude

# Install to project only
npx learning-agent setup claude --project

# Preview what would change
npx learning-agent setup claude --dry-run

# Remove hooks
npx learning-agent setup claude --uninstall
```

This installs a SessionStart hook that automatically loads lessons when Claude starts, resumes, or compacts context.

### Manual Setup

Add to your `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|compact",
        "hooks": [
          {
            "type": "command",
            "command": "npx learning-agent load-session 2>/dev/null || true"
          }
        ]
      }
    ]
  }
}
```

### Hook Commands

| Command | Purpose |
|---------|---------|
| `load-session` | Load high-severity lessons at session start |
| `check-plan --plan "..."` | Retrieve relevant lessons when planning |

## API Reference

```typescript
import {
  // Storage
  appendLesson, readLessons, searchKeyword, rebuildIndex, closeDb,

  // Search
  searchVector, cosineSimilarity, rankLessons,

  // Capture
  shouldPropose, isNovel, isSpecific, isActionable,
  detectUserCorrection, detectSelfCorrection, detectTestFailure,

  // Retrieval
  loadSessionLessons, retrieveForPlan, formatLessonsCheck,

  // Types
  type Lesson, LessonSchema, generateId,
} from 'learning-agent';
```

See [examples/](examples/) for usage examples.

## Lesson Types

### Quick Lesson (fast capture)
```json
{
  "id": "L001",
  "type": "quick",
  "trigger": "Used pandas for 500MB file",
  "insight": "Polars 10x faster",
  "tags": ["performance", "polars"],
  "source": "user_correction"
}
```

### Full Lesson (detailed, high-severity)
```json
{
  "id": "L002",
  "type": "full",
  "trigger": "Auth API returned 401 despite valid token",
  "insight": "API requires X-Request-ID header",
  "evidence": "Traced in network tab, header missing",
  "severity": "high",
  "source": "test_failure"
}
```

## Technology Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript (ESM) |
| Package Manager | pnpm |
| Build | tsup |
| Testing | Vitest |
| Storage | better-sqlite3 + FTS5 |
| Embeddings | node-llama-cpp + nomic-embed-text-v1.5 |
| CLI | Commander.js |
| Schema | Zod |

## Development

```bash
# Watch mode (rebuild on changes)
pnpm dev

# Run tests in watch mode
pnpm test:watch

# Type checking
pnpm lint
```

## Project Status

Version 0.2.2 - Hardening release with quality gates based on [LANDSCAPE.md](doc/LANDSCAPE.md) reviewer feedback. Adds age-based validity warnings, manual invalidation commands, optional citation tracking, and context pollution warnings. See [CHANGELOG.md](CHANGELOG.md) for details.

## Documentation

| Document | Purpose |
|----------|---------|
| [doc/SPEC.md](doc/SPEC.md) | Complete specification |
| [doc/CONTEXT.md](doc/CONTEXT.md) | Research and design decisions |
| [doc/PLAN.md](doc/PLAN.md) | Implementation plan |
| [AGENTS.md](AGENTS.md) | Agent instructions overview |
| [.claude/CLAUDE.md](.claude/CLAUDE.md) | Claude Code project instructions |
| [doc/test-optimization-baseline.md](doc/test-optimization-baseline.md) | Test performance metrics |

## Testing

### Test Organization

Tests are organized for parallelization:

```
src/
├── *.test.ts           # Unit tests (fast)
├── cli/                # CLI integration tests (split by command)
│   ├── cli-test-utils.ts    # Shared utilities
│   ├── learn.test.ts
│   ├── search.test.ts
│   └── ...
├── storage/            # Storage layer tests
├── embeddings/         # Embedding model tests (skipped if model unavailable)
└── ...
```

### Known Limitations

**Embedding concurrency**: The `node-llama-cpp` native addon may crash under heavy parallel load. This is a known limitation of the underlying C++ library. Tests pass reliably under normal conditions.

**Timing-based tests**: Some tests verify performance thresholds. These use generous limits (5000ms) to avoid flakiness on slow CI machines.

## License

MIT
