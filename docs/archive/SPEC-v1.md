# Compound Agent for Claude Code

## Project Overview

A learning system that helps Claude Code avoid repeating mistakes across sessions. Captures lessons from corrections and retrieves them when relevant.

**Location**: `<project-root>/`
**Timeline**: 2.5-3 weeks
**Status**: Spec finalized, ready to implement
**Stack**: TypeScript + pnpm (deployable as dev dependency to any repo)

---

## Problem Statement

Claude Code forgets lessons between sessions:
- Makes the same mistakes repeatedly
- User has to re-explain preferences
- No memory of what worked/failed in past sessions

**Goal**: Efficient, precise learning loop that doesn't explode context.

---

## Key Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Scope** | Repository-level only | Simpler. Share lessons between repos via copy on demand |
| **Storage** | JSONL source + SQLite index | Git-readable diffs + fast search |
| **Search** | Vector (local nomic model) | Semantic similarity is core value |
| **Trigger** | User correction + self-correction + test-failure fix | Capture real corrections with confirmation |
| **Quality** | Tiered (quick vs full) | Balance capture speed vs rigor |
| **Retrieval timing** | Session-start (high severity) + plan-time only | Avoid noisy per-tool retrieval |
| **Compound check** | End-of-implementation parallel reflection | Capture lessons while context is fresh |
| **CLAUDE.md relation** | Separate systems | Rules = permanent, Lessons = contextual WHY |
| **Embeddings** | Local (nomic-embed-text via llama.cpp) | Offline capable, no API deps |
| **Embedding failure** | Hard fail | Prevent silent misses |

---

## Architecture

```
.claude/                        (repository scope)
├── CLAUDE.md                   <- Always loaded (permanent rules)
├── lessons/
│   ├── index.jsonl             <- Source of truth (git-tracked)
│   └── archive/                <- Old lessons (compacted)
└── .cache/
    └── lessons.sqlite          <- Rebuildable index (.gitignore)

FLOW:
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ Mistake │───>│ Claude  │───>│ Quick   │───>│ Stored  │
│ happens │    │ notices │    │ confirm │    │ lesson  │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
                    │              │
               (or user        (MCP or
                corrects)      --yes)

┌─────────┐    ┌─────────┐    ┌─────────┐
│  Next   │<───│ Retrieve│<───│ Session │
│  task   │    │ relevant│    │  start  │
└─────────┘    └─────────┘    └─────────┘
```

---

## Lesson Schema

### Quick Lesson (capture fast)
```json
{
  "id": "L001",
  "type": "quick",
  "trigger": "Used pandas for 500MB file",
  "insight": "Polars 10x faster",
  "tags": ["performance", "polars"],
  "source": "user_correction",
  "context": {
    "tool": "edit",
    "intent": "optimize CSV processing"
  },
  "created": "2025-01-30T14:00:00Z",
  "confirmed": true,
  "supersedes": [],
  "related": ["L003"]
}
```

### Full Lesson (important, needs detail)
```json
{
  "id": "L002",
  "type": "full",
  "trigger": "Auth API returned 401 despite valid token",
  "insight": "API requires X-Request-ID header",
  "evidence": "Traced in network tab, header missing",
  "tags": ["api", "auth"],
  "severity": "high",
  "source": "test_failure",
  "context": {
    "tool": "bash",
    "intent": "run auth integration tests"
  },
  "created": "2025-01-30T14:00:00Z",
  "confirmed": true,
  "supersedes": ["L001"],
  "related": [],
  "pattern": {
    "bad": "requests.get(url, headers={'Authorization': token})",
    "good": "requests.get(url, headers={'Authorization': token, 'X-Request-ID': uuid4()})"
  }
}
```

### Deleted Lesson Record
```json
{
  "id": "L001",
  "type": "quick",
  "trigger": "Used pandas for 500MB file",
  "insight": "Polars 10x faster",
  "tags": ["performance", "polars"],
  "source": "user_correction",
  "deleted": true,
  "deletedAt": "2025-01-30T14:00:00Z"
}
```

Deletions are append-only and represented as full lesson records with `deleted: true` and `deletedAt`.
Legacy minimal tombstones (`{ id, deleted: true, deletedAt }`) remain readable for backward compatibility.

### Metadata & Lifecycle Fields
- **source**: `user_correction | self_correction | test_failure | manual`
- **context**: `{ tool: string, intent: string }` (captured at proposal time)
- **supersedes**: Array of lesson IDs replaced by this one
- **related**: Array of lesson IDs with adjacent relevance

### Lesson Categories (from user examples)
- **Preferences**: Use Polars not pandas, uv over pip
- **Project rules**: API requires X header, never modify Y
- **Patterns**: Always test, always document
- **Corrections**: Bad typing, wrong API calls, library misuse

---

## Capture Flow

### Trigger Detection (multi-signal)
1. User says "no", "wrong", "actually..."
2. Claude self-corrects after iteration (edit -> fail -> re-edit)
3. Test fails -> fix -> passes
4. Manual capture: "remember this" / /learn

### Quality Filter (prevent BS lessons)
Before proposing, Claude checks:
- [ ] Is this novel? (not already in lessons)
- [ ] Is this specific? (not "write better code")
- [ ] Is this actionable? (clear what to do differently)

If any NO -> don't propose lesson
If all YES -> propose with quick confirm

**Self-correction proposals** only appear if the quality filter passes.

### Confirmation UX
```
Claude: "Learned: Use Polars for large files. Confirm to save."
User: "yes" (or ignores = no save)
Claude: [uses lesson_capture MCP tool or capture --yes]
```

**Key principle**: Most sessions have NO lessons, and that's fine. Quality over quantity.

---

## Retrieval Strategy

### Session Start
1. Load CLAUDE.md (always, ~2-5K tokens)
2. Load top 3-5 **high-severity** lessons (most recent, confirmed)
3. No vector search (no task context yet)

### Plan Creation (explicit or internal)
1. Use the plan text as the retrieval query
2. Run vector search (must succeed; hard-fail if embeddings are unavailable)
3. Load top 3-5 relevant lessons
4. Emit a separate **"Lessons Check"** message after the plan

**No per-tool retrieval**. All context injection happens at plan time only.

### Search Ranking
```
score = vector_similarity
      * severity_boost (high=1.5, medium=1.0, low=0.8)
      * recency_boost (last 30d=1.2, older=1.0)
      * confirmation_boost (user confirmed=1.3)
```

---

## Compound Check (End of Implementation)

Runs at the end of a task to propose new lessons while context is fresh.

**Trigger**: Auto + manual.  
**Preconditions**: Problem solved + verified (user confirmation **or** tests pass).  
**Scope**: Always run at task end (non-trivial threshold = always).

**Parallel reflection (modeled after compound workflow):**
1. **Context Analyzer**: Summarize plan + recent tool calls + git diff + test output
2. **Mistake/Lesson Extractor**: Identify missteps, corrections, and fixes
3. **Related/Contradiction Checker**: Link `related` lessons, mark `supersedes` when needed
4. **Prevention Strategist**: Turn lessons into actionable guidance
5. **Classifier**: Quick vs full + severity for full lessons
6. **Writer**: Propose lessons directly (confirmation required)

**Output**: Proposed lessons only if they pass the quality filter.

---

## Technical Stack

| Component | Technology | Notes |
|-----------|------------|-------|
| Language | TypeScript | Deployable as dev dependency to any repo |
| Package Manager | pnpm | Fast, workspace-friendly |
| Storage | better-sqlite3 + FTS5 | Sync API, prebuilds available |
| Embeddings | node-llama-cpp + nomic-embed-text-v1.5 | ~500MB, downloaded on first use to ~/.cache |
| CLI framework | Commander.js | Standard Node.js CLI |
| Schema validation | Zod | Runtime type safety |
| Build | tsup | Fast TypeScript bundler |

## Deployment Model

```
# Install as dev dependency in any repo
pnpm add -D @scope/compound-agent

# Or link locally during development
pnpm add -D ../compound_agent

# Usage via package.json scripts or npx
pnpm learn "Use Polars not pandas"
npx ca search "data processing"
```

The package installs a CLI (`ca` / `learn`) that:
- Stores lessons in `.claude/lessons/index.jsonl` (per-repo, git-tracked)
- Caches SQLite index in `.claude/.cache/lessons.sqlite` (gitignored)
- Downloads embedding model to `~/.cache/compound-agent/models/` (global, first-use)

---

## Implementation Plan

### Week 1: Core Storage + Manual Capture

**Day 1-2: Project setup + JSONL + SQLite**
- pnpm init, TypeScript config, tsup build
- Zod schemas for lessons (quick + full types)
- JSONL read/write with atomic append
- better-sqlite3 with FTS5 virtual table
- Rebuild index from JSONL command

**Day 3-4: Local embeddings**
- node-llama-cpp setup
- Model download to ~/.cache on first use
- Embedding cache (content hash -> vector)
- Vector similarity search (cosine)

**Day 5: Manual capture CLI**
- Commander.js CLI with `learn` and `lessons` commands
- Quick vs full lesson prompts
- Novelty check against existing lessons

### Week 2: Retrieval + Claude Integration

**Day 1-2: Retrieval system**
- Search ranking with boosts (severity, recency, confirmation)
- Session-start high-severity load (no vector search)
- Plan-time retrieval + "Lessons Check" message
- Hard-fail if embeddings are unavailable
- Programmatic API for hooks

**Day 3-4: Capture triggers**
- User correction detection patterns
- Self-correction detection patterns
- Test failure -> fix detection
- Quality filter (novel? specific? actionable?)
- Related/contradiction linking (related + supersedes)

**Day 5: Integration + hooks**
- Export functions for Claude Code hooks
- Example hook configurations
- Quick confirm UX flow
- Compound check (parallel reflection) at end of implementation

### Week 3: Polish + Iteration

**Day 1-2: Compaction**
- Deleted-record compaction + periodic rewrite
- Archive old lessons (>90 days, never retrieved)
- Retrieval count tracking
- Simple truncation (no AI summarization initially)

**Day 3-4: Quality of life**
- `lessons stats` command
- `lessons export` / `lessons import` for cross-repo sharing
- Better CLI output formatting

**Day 5: Testing + docs**
- Vitest unit tests
- Integration test: capture -> index -> search
- README with usage examples

---

## File Structure

```
compound_agent/
├── docs/
│   ├── SPEC.md                 <- This file
│   ├── CONTEXT.md              <- Research & decisions
│   └── PLAN.md                 <- Detailed implementation plan
├── src/
│   ├── index.ts                <- Public API exports
│   ├── cli.ts                  <- Commander.js CLI entry
│   ├── types.ts                <- Zod schemas + TypeScript types
│   ├── storage/
│   │   ├── index.ts
│   │   ├── jsonl.ts            <- JSONL read/write
│   │   └── sqlite.ts           <- better-sqlite3 + FTS5
│   ├── embeddings/
│   │   ├── index.ts
│   │   ├── nomic.ts            <- node-llama-cpp wrapper
│   │   ├── download.ts         <- Model download logic
│   │   └── cache.ts            <- Embedding cache
│   ├── search/
│   │   ├── index.ts
│   │   ├── vector.ts           <- Cosine similarity
│   │   └── ranking.ts          <- Score boosting
│   └── capture/
│       ├── index.ts
│       ├── triggers.ts         <- Detection patterns
│       └── quality.ts          <- BS filter
├── tests/
│   ├── storage.test.ts
│   ├── embeddings.test.ts
│   └── search.test.ts
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

## Package.json

```json
{
  "name": "@scope/compound-agent",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "compound-agent": "./dist/cli.js",
    "ca": "./dist/cli.js"
  },
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest",
    "prepublishOnly": "pnpm build"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "node-llama-cpp": "^3.0.0",
    "commander": "^12.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.4.0",
    "vitest": "^2.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^20.0.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

---

## Critic Feedback (Incorporated)

From neutral reviewer:

1. **"No definition of mistake"** -> Added lesson categories + quality filter
2. **"Agent can't recognize mistakes"** -> Kept agent-initiated BUT with user confirm
3. **"Subagent is over-engineered"** -> Changed to inline capture with quick confirm
4. **"Start with keyword search"** -> User insisted on vectors, keeping them
5. **"Lesson inflation risk"** -> Added quality filter + "most sessions have no lessons" principle
6. **"Missing contradiction detection"** -> Added to Week 2 scope
7. **"Missing provenance"** -> Added source + context metadata

---

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Global vs project scope? | Project only, copy to share |
| SQLite vs JSONL? | Hybrid: JSONL source, SQLite index |
| Online embedding fallback? | No, local only |
| Embedding failure behavior? | Hard fail |
| Retrieval timing? | Session-start (high severity) + plan-time only |
| Pre-compaction flush? | Cut from MVP, add if needed |
| Hierarchical scopes? | Cut, too complex |

---

## Success Criteria

1. **Context efficiency**: Lessons add <2K tokens per session
2. **Retrieval usefulness**: User reports lessons are relevant in periodic review
3. **Capture quality**: <10% of lessons are "BS" (vague, obvious)
4. **User friction**: Quick confirm takes <5 seconds
5. **Reliability**: Works offline, no external API deps

---

## Next Steps

1. Initialize pnpm + TypeScript project
2. Implement JSONL storage + schema
3. Add SQLite index with FTS5
4. Integrate nomic embeddings
5. Build CLI for manual capture
6. Add Claude Code hooks

---

## Version Notes

This section documents changes since the original spec (v0.1.0).

### v0.2.8 (2026-02-04) - Hook UX Improvements

**New Hooks:**
- UserPromptSubmit: Detects correction/planning language, injects lesson tool reminders
- PostToolUseFailure: Smart failure detection (2 same-target OR 3 total failures)
- PostToolUse: Resets failure state on success

**UX Improvements:**
- Pre-commit prompt redesigned with checklist format
- HookInstallResult discriminated union for clear status messages
- Gentle reminder system encourages natural lesson tool usage

### v0.2.7 (2026-02-04) - MCP-First Integration

**MCP Priority:**
- Updated prime output to prioritize MCP tools at top
- `lesson_search` and `lesson_capture` as primary methods
- CLI commands moved to fallback section
- Consistent with AGENTS.md MCP-first approach

### v0.2.6 (2026-02-04) - MCP Config Location Fix

**Fixes:**
- MCP config now writes to `.mcp.json` (project root) per Claude Code docs
- Hooks remain in `.claude/settings.json`
- AGENTS.md template updated with "MCP Tools (ALWAYS USE THESE)" section

### v0.2.4-v0.2.5 - Hook System Refinement

**Key Changes:**
- MCP server integration with `lesson_search` and `lesson_capture` tools
- One-shot `ca setup` command for init + hooks + MCP + model
- Removed invalid `PreCommit` Claude Code hook
- Git pre-commit hook for remind-capture

### v0.2.2-v0.2.3 - Hardening & Quality Gates

**Schema Extensions:**
- `citation` field (optional) - Track source file, line number, commit hash
- `compactionLevel` (0|1|2) - Age-based validity tracking (active/flagged/archived)
- `invalidatedAt`, `invalidationReason` - Manual invalidation support

**Quality Improvements:**
- SQLite graceful degradation (JSONL-only fallback)
- Age-based warnings in `load-session` for lessons > 30/60/90 days
- Comprehensive test suite (~1000 tests)

See [CHANGELOG.md](../CHANGELOG.md) for complete history.
