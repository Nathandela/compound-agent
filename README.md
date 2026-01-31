# Learning Agent

A repository-scoped learning system that helps Claude Code avoid repeating mistakes across sessions. Captures lessons from corrections and retrieves them when relevant.

## Overview

Claude Code forgets lessons between sessions. This leads to:
- Repeated mistakes across sessions
- Users re-explaining preferences
- No memory of what worked or failed

Learning Agent solves this by capturing lessons when corrections happen and retrieving relevant ones at session start and plan time.

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

Version 0.1.0 - Core infrastructure implemented. See [doc/SPEC.md](doc/SPEC.md) for the full specification and [doc/PLAN.md](doc/PLAN.md) for the implementation roadmap.

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
