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

# Search lessons
learning-agent search "data processing"

# Rebuild index from JSONL
learning-agent rebuild

# List all lessons
learning-agent list

# Show database stats
learning-agent stats

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

## Lesson Schema

Lessons are stored in JSONL format with Zod validation. Understanding the schema is critical for correct usage.

### Required Fields

Every lesson **must** have these fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (e.g., "L1a2b3c4d") |
| `type` | "quick" \| "full" | Lesson quality tier (see below) |
| `trigger` | string | What caused this lesson to be learned |
| `insight` | string | The actual lesson content |
| `tags` | string[] | Categorization tags (can be empty) |
| `source` | enum | How it was captured: "user_correction", "self_correction", "test_failure", "manual" |
| `context` | object | `{ tool: string, intent: string }` - what was happening |
| `created` | string | ISO8601 timestamp |
| `confirmed` | boolean | Whether user confirmed this lesson |
| `supersedes` | string[] | IDs of lessons this replaces (can be empty) |
| `related` | string[] | IDs of related lessons (can be empty) |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `evidence` | string | Supporting evidence (typically for "full" type) |
| `severity` | "high" \| "medium" \| "low" | Importance level |
| `pattern` | object | `{ bad: string, good: string }` - code pattern |
| `deleted` | boolean | Tombstone marker for deletions |
| `retrievalCount` | number | Times this lesson was retrieved |

### Type vs Severity (Important!)

**`type`** and **`severity`** are **separate** fields:

- **`type`**: Quality tier of the lesson
  - `"quick"` - Minimal capture, fast to create
  - `"full"` - Detailed lesson with evidence/patterns

- **`severity`**: Importance level (optional field)
  - `"high"` - Critical, loaded at every session start
  - `"medium"` - Important, retrieved when relevant
  - `"low"` - Minor, lower retrieval priority

**Common mistake**: Using `type: "high"` instead of `type: "full"` with `severity: "high"`.

### Session-Start Loading

High-severity lessons are automatically loaded at session start. For a lesson to load:

1. `type` must be `"full"`
2. `severity` must be `"high"`
3. `confirmed` must be `true`

### Complete Examples

#### Quick Lesson (minimal)

```json
{
  "id": "L1a2b3c4d",
  "type": "quick",
  "trigger": "Used pandas for 500MB file",
  "insight": "Polars is 10x faster for large files",
  "tags": ["performance", "polars"],
  "source": "user_correction",
  "context": { "tool": "edit", "intent": "optimize CSV processing" },
  "created": "2025-01-30T14:00:00Z",
  "confirmed": true,
  "supersedes": [],
  "related": []
}
```

#### Full Lesson with High Severity (loads at session start)

```json
{
  "id": "L5e6f7g8h",
  "type": "full",
  "trigger": "Auth API returned 401 despite valid token",
  "insight": "API requires X-Request-ID header",
  "evidence": "Traced in network tab, header was missing",
  "tags": ["api", "auth"],
  "severity": "high",
  "source": "test_failure",
  "context": { "tool": "bash", "intent": "run auth integration tests" },
  "created": "2025-01-30T15:30:00Z",
  "confirmed": true,
  "supersedes": [],
  "related": ["L1a2b3c4d"],
  "pattern": {
    "bad": "requests.get(url, headers={'Authorization': token})",
    "good": "requests.get(url, headers={'Authorization': token, 'X-Request-ID': uuid4()})"
  }
}
```

### Creating Lessons via CLI

Always use the CLI to create lessons (never edit JSONL directly):

```bash
# Quick lesson
npx lna learn "Use Polars for large files"

# Full lesson with high severity (loads at session start)
npx lna learn "API requires X-Request-ID header" --severity high

# With trigger context
npx lna learn "Use uv not pip" --trigger "pip was slow" --severity medium
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

Version 0.2.1 - Bug fixes and documentation improvements. See [doc/SPEC.md](doc/SPEC.md) for the full specification and [CHANGELOG.md](CHANGELOG.md) for recent changes.

## Documentation

| Document | Purpose |
|----------|---------|
| [doc/SPEC.md](doc/SPEC.md) | Complete specification |
| [doc/CONTEXT.md](doc/CONTEXT.md) | Research and design decisions |
| [doc/PLAN.md](doc/PLAN.md) | Implementation plan |
| [AGENTS.md](AGENTS.md) | Agent instructions overview |
| [.claude/CLAUDE.md](.claude/CLAUDE.md) | Claude Code project instructions |

## License

MIT
