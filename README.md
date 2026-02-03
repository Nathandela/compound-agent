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

> **Warning**: Do NOT install from GitHub URL (e.g., `pnpm add github:user/learning-agent`).
> GitHub installs don't include the compiled `dist/` folder, which will cause all CLI
> commands and hooks to fail. Always install from npm registry as shown above.

### One-Shot Setup (Recommended)

After installation, run the setup command to configure everything:

```bash
npx lna setup
```

This single command:
- Creates `.claude/lessons/` directory
- Adds AGENTS.md with workflow instructions
- Installs Claude Code hooks (SessionStart, PreCompact, PreCommit)
- Registers the MCP server for `lesson_search` and `lesson_capture` tools
- Downloads the embedding model (~278MB)

To skip the model download (if you'll do it later):

```bash
npx lna setup --skip-model
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

- **MCP Integration**: Native Claude tools (`lesson_search`, `lesson_capture`) via MCP server
- **Lesson Capture**: Capture lessons after user corrections, self-corrections, or discoveries
- **Quality Filter**: Prevents vague or obvious lessons (must be novel, specific, actionable)
- **Vector Search**: Local semantic search using nomic-embed-text-v1.5 via node-llama-cpp
- **Hybrid Storage**: JSONL source of truth (git-tracked) with SQLite FTS5 index (rebuildable)
- **Offline First**: No external API dependencies; works completely offline
- **Hook System**: SessionStart/PreCompact load context, git pre-commit reminds to capture

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

The `lna setup` command configures everything automatically:

```bash
npx lna setup
```

This installs:
- **MCP Server**: Exposes `lesson_search` and `lesson_capture` as native Claude tools
- **SessionStart hook**: Loads workflow context when Claude starts
- **PreCompact hook**: Reloads context before compaction
- **Git pre-commit hook**: Reminds to capture lessons before commits

### Manual Hook Configuration

If you prefer to configure hooks manually, add to `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "npx lna prime 2>/dev/null || true" }
        ]
      }
    ],
    "PreCompact": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "npx lna prime 2>/dev/null || true" }
        ]
      }
    ]
  },
  "mcpServers": {
    "learning-agent": {
      "command": "npx",
      "args": ["learning-agent-mcp"]
    }
  }
}
```

The git pre-commit hook is installed separately via `npx lna init` and runs `lna remind-capture` before commits.
```

### MCP Tools

| Tool | Purpose |
|------|---------|
| `lesson_search` | Search lessons before architectural decisions |
| `lesson_capture` | Capture lessons after corrections or discoveries |

### Hook Commands

| Command | Purpose |
|---------|---------|
| `prime` | Load workflow context and high-severity lessons |
| `remind-capture` | Prompt to capture lessons before commit |

### Managing Hooks

```bash
# Check integration status
npx lna setup claude --status

# Remove hooks
npx lna setup claude --uninstall

# Preview changes
npx lna setup claude --dry-run
```

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

Lessons are stored as JSONL records with the following schema:

### Required Fields

All lessons must have these fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (e.g., "L12345678") |
| `type` | "quick" \| "full" | Lesson complexity level |
| `trigger` | string | What caused the lesson (context/situation) |
| `insight` | string | What was learned (the takeaway) |
| `tags` | string[] | Categorization tags |
| `source` | string | How it was captured (user_correction, self_correction, test_failure, manual) |
| `context` | object | Tool/intent context |
| `created` | ISO string | Creation timestamp |
| `confirmed` | boolean | Whether user confirmed the lesson |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `evidence` | string | Supporting evidence (full lessons only) |
| `severity` | "high" \| "medium" \| "low" | Importance level (separate from type) |
| `citation` | object | File/line reference (file, line, commit) |

**Note**: The `severity` field is separate from `type`. A quick lesson can have high severity, and a full lesson can have low severity.

### Session-Start Loading

At session start, lessons are loaded based on:
- **High severity** lessons are always loaded
- **Confirmed** lessons are prioritized
- Only non-invalidated lessons are included

### Complete JSON Example

```json
{
  "id": "L12345678",
  "type": "full",
  "trigger": "API returned 401 despite valid JWT token",
  "insight": "Auth API requires X-Request-ID header in all requests",
  "evidence": "Traced in network tab, discovered missing header requirement",
  "severity": "high",
  "tags": ["api", "auth", "headers"],
  "source": "test_failure",
  "context": { "tool": "fetch", "intent": "API authentication" },
  "created": "2024-01-15T10:30:00.000Z",
  "confirmed": true,
  "citation": { "file": "src/api/client.ts", "line": 42 }
}
```

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

Version 0.2.4 - Hybrid Memory System release. Combines Beads-style trusted hook injection with MCP tools for native Claude integration. Key features:
- **MCP Server**: `lesson_search` and `lesson_capture` as native Claude tools
- **One-shot setup**: `lna setup` configures hooks, MCP, and downloads model
- **Trust language**: Updated AGENTS.md with mandatory recall patterns
- **Hook system**: SessionStart + PreCompact (Claude Code) + git pre-commit

See [CHANGELOG.md](CHANGELOG.md) for details.

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
