# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
  - 100% statement/function/line coverage (435 tests)
  - Property-based tests with fast-check
  - Integration tests for capture workflows

### Changed

- Unified QuickLesson and FullLesson into single Lesson type
- Removed deprecated type exports

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

[Unreleased]: https://github.com/nathanbraun/learning_agent/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/nathanbraun/learning_agent/releases/tag/v0.1.0
