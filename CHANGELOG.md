# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.6] - 2026-02-04

### Fixed

- **MCP Config Location**: Write to `.mcp.json` (project scope) instead of `.claude/settings.json`
  - Per Claude Code docs, MCP servers should be in `.mcp.json` at project root
  - Hooks remain correctly in `.claude/settings.json`
  - `setup claude --status` now checks both files

- **AGENTS.md MCP Priority**: Updated template to clearly prioritize MCP tools
  - "MCP Tools (ALWAYS USE THESE)" section at top
  - CLI commands clearly marked as "fallback only"
  - Claude will now prefer `lesson_search`/`lesson_capture` over CLI

### Changed

- Architecture diagram in README updated to show `.mcp.json` location
- Simplified AGENTS.md structure: MCP tools first, mandatory recall, capture protocol

## [0.2.5] - 2026-02-03

### Fixed

- Remove invalid `PreCommit` Claude Code hook (not a valid hook type)
- Remind-capture now uses git pre-commit hook instead of Claude Code hook
- Fix `setup claude --status` to check for `/search` instead of `/check-plan`

## [0.2.4] - 2026-02-03

### Added

- **MCP Server Integration**
  - Native Claude tools via Model Context Protocol (MCP)
  - `lesson_search` tool for semantic lesson retrieval
  - `lesson_capture` tool for capturing new lessons
  - Auto-registered in Claude Code settings during setup

- **One-Shot Setup Command**
  - `lna setup` combines init, hooks, MCP, and model download
  - `--skip-model` flag to skip embedding model download
  - Idempotent: safe to run multiple times

- **Two-Hook System** (Claude Code hooks)
  - `SessionStart`: Loads workflow context via `lna prime`
  - `PreCompact`: Reloads context before compaction via `lna prime`
  - Git pre-commit hook: Reminds to capture lessons via `lna remind-capture`

- **Remind-Capture Command**
  - `lna remind-capture` prompts for lesson capture before commits
  - Checks for uncommitted corrections that could become lessons

### Changed

- **Hook Configuration**
  - Hooks now use `lna prime` instead of `load-session` for trust language
  - Removed `check-plan` hook in favor of `lesson_search` MCP tool
  - Updated AGENTS.md with "Mandatory Recall" section for compliance

- **AGENTS.md Template**
  - Now focuses on MCP tools (`lesson_search`, `lesson_capture`)
  - Trust language patterns: "MUST", "NEVER", "Mandatory Recall"
  - Clearer workflow instructions for Claude integration

- **Slash Commands**
  - Replaced `/check-plan` with `/search` for lesson search
  - Added `/prime` for context recovery

### Removed

- `check-plan` command (replaced by `lesson_search` MCP tool)
- Auto-invoke triggers (replaced by MCP-based workflow)

## [0.2.3] - 2026-02-01

### Added

- **SQLite Graceful Degradation** (2f0)
  - Works as dev dependency without native bindings failing
  - JSONL-only mode when SQLite unavailable
  - Keyword search falls back gracefully
  - Warning displayed in degraded mode

- **Claude Code Integration** (ctv, 8lp, 6nw, 501, 2jp, lfy)
  - Claude Plugin structure (`.claude-plugin/`) with manifest and commands
  - `/learn` slash command for quick lesson capture
  - `/check-plan` slash command for plan-time retrieval
  - Auto-invoke triggers for lesson capture patterns
  - Detection triggers wired to Claude Code workflow
  - AGENTS.md includes reference to CLAUDE.md

- **Context Recovery** (gpv)
  - `lna prime` command for context recovery after compaction/clear
  - Outputs workflow rules, commands, and quality gates

- **Diagnostics** (qi0)
  - `setup claude --status` shows integration health
  - Displays settings file, hook status, slash command availability
  - JSON output with `--json` flag

### Changed

- **Architecture Refactoring** (e73, zpl)
  - Split sqlite.ts (644 lines) into focused modules (<200 lines each)
  - Module imports now use barrel exports (Parnas principles)
  - Cleaner internal boundaries and improved maintainability

- **CLI Improvements** (79k, e2r)
  - CLI releases database resources on SIGINT/SIGTERM signals
  - `setup claude --uninstall` removes AGENTS.md section and CLAUDE.md reference
  - Clean uninstall preserves other content

### Fixed

- Claude now uses CLI commands instead of editing JSONL directly (0p5)
- Plan-time lessons now appear via check-plan hook integration (6nw)

## [0.2.2] - 2026-02-01

### Added

- **Age-based Temporal Validity** (LANDSCAPE.md: eik)
  - `CompactionLevelSchema` for lesson lifecycle (0=active, 1=flagged, 2=archived)
  - Age distribution display in `stats` command (<30d, 30-90d, >90d)
  - Age warnings in `load-session` for lessons older than 90 days
  - New schema fields: `compactionLevel`, `compactedAt`, `lastRetrieved`

- **Manual Invalidation** (LANDSCAPE.md: mov)
  - `learning-agent wrong <id>` - Mark a lesson as invalid/wrong
  - `learning-agent validate <id>` - Re-enable a previously invalidated lesson
  - `list --invalidated` flag to show only invalidated lessons
  - New schema fields: `invalidatedAt`, `invalidationReason`

- **Optional Citation Field** (LANDSCAPE.md: tn3)
  - `CitationSchema` for lesson provenance tracking
  - Store file path, line number, and git commit with lessons
  - `learn --citation <file:line>` and `--citation-commit <hash>` flags

- **Count Warning** (LANDSCAPE.md: qp9)
  - Warning in `stats` when lesson count exceeds 20 (context pollution prevention)
  - Note in `load-session` when total lessons may degrade retrieval quality

### Changed

- Lesson schema now includes optional fields for citation, age-tracking, and invalidation
- `list` command shows `[INVALID]` marker for invalidated lessons
- `load-session` JSON output includes `totalCount` field
- CLI refactored into command modules (`src/commands/`) for maintainability
- Age calculation logic centralized in `src/utils.ts`

### Fixed

- **SQLite schema now stores v0.2.2 fields** (x9y)
  - Added columns: `invalidated_at`, `invalidation_reason`, `citation_*`, `compaction_level`, `compacted_at`
  - `rebuildIndex` preserves all v0.2.2 fields during cache rebuild
  - `rowToLesson` correctly maps all fields back to Lesson objects

- **Retrieval paths filter out invalidated lessons** (z8k)
  - `searchKeyword` excludes lessons with `invalidated_at` set
  - `searchVector` skips invalidated lessons during scoring
  - `loadSessionLessons` filters out invalidated high-severity lessons

## [0.2.1] - 2026-02-01

### Added

- **CLI Commands**
  - `lna` short alias for `learning-agent` CLI
  - `show <id>` - Display lesson details
  - `update <id>` - Modify lesson fields (insight, severity, tags, confirmed)
  - `delete <id>` - Create tombstone for lesson removal
  - `download-model` - Download embedding model (~278MB)
  - `--severity` flag for `learn` command to set lesson severity

- **Documentation**
  - Complete lesson schema documentation in README
  - Required vs optional fields explained
  - Session-start loading requirements (type=full + severity=high + confirmed=true)
  - "Never Edit JSONL Directly" warning in AGENTS.md template

### Changed

- `setup claude` now defaults to project-local (was global)
- `setup claude --global` required for global installation
- `init` now includes `setup claude` step by default
- Auto-sync SQLite after every CLI mutation (learn, update, delete, import)

### Fixed

- Pre-commit hook now inserted before exit statements (not appended after)
- JSONL edits properly sync to SQLite index
- High-severity lessons load correctly at session start

## [0.2.0] - 2026-01-31

### Added

- **Claude Code Integration**
  - `learning-agent setup claude` - Install SessionStart hooks into Claude Code settings
  - `--project` flag for project-level hooks (vs global)
  - `--uninstall` to remove hooks
  - `--dry-run` to preview changes
  - Automatic lesson injection at session start, resume, and compact events

- **Storage Enhancements**
  - Compaction system for archiving old lessons and removing tombstones
  - Smart sync: rebuild index only when JSONL changes
  - Retrieval count tracking for lesson usage statistics

- **CLI Commands**
  - `learning-agent import <file>` - Import lessons from JSONL file
  - `learning-agent stats` - Show database health statistics
  - `learning-agent compact` - Archive old lessons
  - `learning-agent export` - Export lessons as JSON
  - Global flags: `--verbose`, `--quiet`
  - Colored output with chalk

- **Embeddings**
  - Switched to EmbeddingGemma-300M (~278MB, down from ~500MB)
  - Simplified model download using node-llama-cpp resolveModelFile

- **Testing**
  - 501 tests with property-based testing (fast-check)
  - Integration tests for capture workflows

### Changed

- Unified QuickLesson and FullLesson into single Lesson type
- Removed deprecated type exports
- `check-plan` now hard-fails on embedding errors (exit non-zero with actionable message)
- `capture` and `detect --save` now require `--yes` flag for saves
- `learn` command always saves with `confirmed: true`
- Hook installation is non-destructive (appends to existing hooks)
- Hook installation respects `core.hooksPath` git configuration

### Fixed

- Embedding errors no longer masked as "no relevant lessons" in check-plan
- Git hooks no longer overwrite existing pre-commit hooks
- AGENTS.md template now includes explicit plan-time instructions

## [0.1.0] - 2025-01-30

### Added

- **Core Storage**
  - JSONL storage for lessons with atomic append operations
  - SQLite index with FTS5 full-text search support
  - Automatic index rebuild from JSONL source of truth
  - Hybrid storage model: git-tracked JSONL + rebuildable SQLite cache

- **Embeddings**
  - Local semantic embeddings via node-llama-cpp
  - EmbeddingGemma-300M model (768 dimensions)
  - Manual model download via CLI (~278MB)
  - Model stored in `~/.node-llama-cpp/models/`

- **Search & Retrieval**
  - Vector similarity search using cosine distance
  - Ranking with configurable boosts (severity, recency, confirmation)
  - Session-start retrieval for high-severity lessons
  - Plan-time retrieval with semantic relevance

- **Capture System**
  - User correction detection patterns
  - Self-correction detection (edit-fail-re-edit cycles)
  - Test failure detection and fix tracking
  - Quality filter: novel, specific, and actionable checks

- **Lesson Types**
  - Quick lessons for fast capture
  - Full lessons with evidence and severity levels
  - Tombstone records for deletions/edits
  - Metadata: source, context, supersedes, related

- **Public API**
  - `appendLesson()` - Store new lessons
  - `readLessons()` - Read lessons with pagination
  - `searchKeyword()` - FTS5 keyword search
  - `searchVector()` - Semantic vector search
  - `loadSessionLessons()` - Session-start high-severity lessons
  - `retrieveForPlan()` - Plan-time relevant lesson retrieval
  - Detection triggers: `detectUserCorrection()`, `detectSelfCorrection()`, `detectTestFailure()`
  - Quality filters: `shouldPropose()`, `isNovel()`, `isSpecific()`, `isActionable()`

- **CLI**
  - `pnpm learn` - Capture a lesson manually
  - `learning-agent search` - Search lessons
  - `learning-agent rebuild` - Rebuild SQLite index

- **Developer Experience**
  - TypeScript with ESM modules
  - Zod schemas for runtime validation
  - Vitest test suite
  - tsup build configuration

[Unreleased]: https://github.com/Nathandela/learning_agent/compare/v0.2.5...HEAD
[0.2.5]: https://github.com/Nathandela/learning_agent/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/Nathandela/learning_agent/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/Nathandela/learning_agent/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/Nathandela/learning_agent/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/Nathandela/learning_agent/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Nathandela/learning_agent/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Nathandela/learning_agent/releases/tag/v0.1.0
