# Changelog

> **Note**: This project was renamed from **learning-agent** (CLI: `lna`) to **compound-agent** (CLI: `ca`) as part of the compound-agent rename. Historical entries below use the original name.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.6.1] - 2026-03-05

### Changed

- **Renamed brainstorm phase to spec-dev**: The `/compound:brainstorm` slash command is now `/compound:spec-dev`. The phase focuses on structured specification development using EARS notation, Mermaid diagrams, and Socratic dialogue rather than open-ended brainstorming. Old `brainstorm.md` command files are auto-cleaned during upgrade.
- **Integration test stability**: Reduced integration test parallelism (`maxForks: 1`) and increased timeouts to 60s to eliminate non-deterministic ETIMEDOUT failures under load.

### Added

- **Spec reference file**: `.claude/skills/compound/spec-dev/references/spec-guide.md` provides quick-reference material for EARS patterns, Mermaid diagram selection, NL ambiguity detection, and trade-off documentation frameworks. Installed automatically during `ca setup`.
- **Hook error visibility**: Hook runners now log errors to stderr when `CA_DEBUG` environment variable is set, instead of silently swallowing all failures.
- **check-plan stdin safety**: `ca check-plan` now enforces a 30-second timeout and 1MB size limit when reading from stdin, preventing hangs in CI/CD environments.
- **Embed lock expiry**: Embedding lock files now expire after 1 hour as a safety valve against zombie processes holding locks indefinitely.
- **Phase-state backward compatibility**: Legacy `lfg_active` field in phase state files is automatically migrated to `cookit_active` on read.
- **clean-lessons scope messaging**: `ca clean-lessons` now reports when non-lesson items are excluded from analysis.

### Fixed

- **Missing spec-guide.md**: The reference file was declared in skill templates and CHANGELOG but never generated during setup. Now installed alongside phase skills.
- **Upgrade cleanup for lfg.md**: Added `lfg.md` to deprecated commands list so `ca setup --update` removes stale lfg command files from upgraded repos.
- **Docs template terminology**: WORKFLOW.md template now uses "Spec Dev" instead of "Brainstorm" for Phase 1.
- **Test file naming**: Renamed `brainstorm-phase.test.ts` to `spec-dev-phase.test.ts` to match the refactored phase name.
- **Library bundle cleanup**: Moved CLI-only re-exports (`registerWatchCommand`, `registerLoopCommands`) out of the library barrel to eliminate unused import warnings in `dist/index.js`.
- **plan.test.ts embedding guard**: Added `skipIf(skipEmbedding)` to unguarded test that calls `retrieveForPlan` without mocking.
- **Agent template test count**: Updated setup.test.ts to expect 9 agent templates (was 8), matching the actual AGENT_TEMPLATES count after `lessons-reviewer.md` was added.

## [1.6.0] - 2026-03-02

### Added

- **`ca watch` command**: Live pretty-printer for infinity loop trace files. Tails `agent_logs/trace_*.jsonl` and formats stream-json events (tool calls, text deltas, token usage, epic markers) with colored output. Supports `--epic <id>` to watch a specific epic and `--no-follow` for one-shot reads.
- **Stream-json micro logging**: Generated infinity loop scripts now use `--output-format stream-json --include-partial-messages` to capture structured JSONL event traces alongside the existing macro text log. Trace files written to `agent_logs/trace_<epic>-<ts>.jsonl` with `.latest` symlink for easy discovery.
- **`/compound:learn-that` slash command**: Conversation-aware lesson capture with user confirmation before saving
- **`/compound:check-that` slash command**: Search lessons and proactively apply them to current work
- **Eager knowledge embedding**: Knowledge chunks from `docs/` are now embedded for semantic search when the model is available
  - `ca index-docs --embed` embeds chunks after indexing
  - `ca init` now downloads the embedding model (with `--skip-model` opt-out) and installs the post-commit hook
  - Background embedding spawns after `ca init`/`ca setup` so users can start working immediately
  - PID-based lock file prevents concurrent embedding processes
  - Status file (`embed-status.json`) tracks background embedding progress
- **New modules**: `embed-chunks.ts`, `embed-lock.ts`, `embed-status.ts`, `embed-background.ts` with full test coverage

### Removed

- **`/compound:learn` slash command**: Replaced by `/compound:learn-that` with conversation-aware capture and user confirmation
- **`ca worktree` command family**: All five subcommands (`create`, `merge`, `list`, `cleanup`, `wire-deps`) removed. Claude Code now provides native `EnterWorktree` support. Running `ca worktree` prints a deprecation notice.
- **`/compound:set-worktree` slash command**: Use Claude Code's native worktree workflow instead.
- **Conditional Merge gate in `verify-gates`**: Only Review and Compound gates remain.
- **`shortId` utility**: Dead code after worktree removal, cleaned up.

### Changed

- **Loop script uses piped stream splitting**: Claude invocation changed from `&>` capture to a `tee | extract_text` pipeline. Raw JSONL streams to trace file while extracted text feeds the macro log for marker detection. Backwards compatible — all existing markers (EPIC_COMPLETE, EPIC_FAILED, HUMAN_REQUIRED) still work.
- **`ca setup --update` now cleans deprecated paths**: Automatically removes stale worktree skill/command files from `.claude/` and `.gemini/` directories.
- **`ca setup` also cleans deprecated paths**: Fresh setup runs now remove stale files from prior versions.
- **SKILLS.md template**: Command inventory now lists all 11 slash commands (was 7).

### Fixed

- **Eager embedding hardening** (production readiness fixes from triple review):
  - **P0**: Background worker spawn now resolves `dist/cli.js` deterministically instead of relying on `npx ca` (which failed silently in dev/built contexts)
  - **P0**: `embed-worker` command hidden from `ca --help` output
  - **P1**: Stale lock recovery uses atomic delete-then-`wx` to prevent two processes both reclaiming
  - **P1**: DB connection opened after lock acquisition to prevent leak on contention
  - **P1**: `--embed` now throws when model unavailable (was silently returning 0)
  - **P2**: Batch embedding (16 chunks per call) with per-batch SQLite transactions (was 1 fsync per row)
  - **P2**: `EmbedStatus` rewritten as discriminated union; removed dead `chunksTotal` field
  - **P2**: `readLock` validates JSON shape instead of blind `as` cast
  - **P2**: Vector batch length assertion guards against short responses from embedding backend
  - **P3**: Extracted `indexAndSpawnEmbed()` shared helper — `init.ts` and `all.ts` no longer duplicate logic
  - **P3**: `ca setup` now prints feedback when background embedding spawns
  - **P3**: `filesErrored` count shown in `ca index-docs` output
  - **P3**: Barrel re-exports consolidated through `./memory/knowledge/index.js`
- **`EPIC_ID_PATTERN` duplication**: `loop.ts` now uses distinctly named `LOOP_EPIC_ID_PATTERN` to avoid confusion with the canonical pattern in `cli-utils.ts`.
- **Stale worktree lesson invalidated**: Memory item `Ld204372e` marked invalid to prevent irrelevant context injection.

### Performance

- **Eliminate double model initialization**: `ca search` now uses `isModelAvailable()` (fs.existsSync, zero cost) instead of `isModelUsable()` which loaded the 278MB native model just to probe availability, then loaded it again for actual embedding
- **Bulk-read cached embeddings**: `getCachedEmbeddingsBulk()` replaces N individual `getCachedEmbedding()` SQLite queries with a single bulk read
- **Eliminate redundant JSONL parsing**: `searchVector()` and `findSimilarLessons()` now use `readAllFromSqlite()` after `syncIfNeeded()` instead of re-parsing the JSONL file
- **Float32Array consistency**: Lesson embedding path now keeps `Float32Array` from node-llama-cpp instead of converting via `Array.from()` (4x memory savings per vector)
- **Pre-warm lesson embedding cache**: `ca init` now pre-computes embeddings for all lessons with missing or stale cache entries, eliminating cold-start latency on first search
- **Graceful embedding fallback**: `ca search` falls back to keyword-only search on runtime embedding failures instead of crashing

## [1.5.0] - 2026-02-24

### Added

- **Gemini CLI compatibility adapter**: `ca setup gemini` scaffolds `.gemini/` directory with hook scripts, TOML slash commands, and inlined skills -- bridging compound-agent to work with Google's Gemini CLI via the Adapter Pattern
- **Gemini hooks**: Maps SessionStart, BeforeAgent, BeforeTool, AfterTool to compound-agent's existing hook pipeline (`ca prime`, `ca hooks run user-prompt`, `ca hooks run phase-guard`, `ca hooks run post-tool-success`)
- **Gemini TOML commands**: Auto-generates `.gemini/commands/compound/*.toml` using `@{path}` file injection to maintain a single source of truth with Claude commands
- **Gemini skills proxying**: Inlines phase and agent role skill content into `.gemini/skills/` with YAML frontmatter
- **23 integration tests** for the Gemini adapter covering hooks, settings.json, TOML commands, skills, and dry-run mode

### Fixed

- **Gemini hook stderr leak**: Corrected `2>&1 > /dev/null` (leaks stderr to stdout, corrupting JSON) to `> /dev/null 2>&1`
- **Gemini TOML file injection syntax**: Changed `@path` to `@{path}` (Gemini CLI requires curly braces)
- **Gemini skill file injection**: Skills now inline content instead of using `@{path}` which only works in TOML prompt fields, not SKILL.md
- **Gemini phase guard always allowing**: Hook now checks `ca hooks run phase-guard` exit code and returns structured `{"decision": "deny"}` on failure (exit 0, not exit 2, so Gemini parses the reason from stdout)
- **Gemini BeforeTool matcher incomplete**: Added `create_file` to BeforeTool and AfterTool matchers alongside `replace` and `write_file`
- **TOML description escaping**: `parseDescription` now escapes `\` and `"` to prevent malformed TOML output
- **Flaky embedding test**: Added 15s timeout to `isModelUsable` test

## [1.4.4] - 2026-02-23

### Added

- **Security arc with P0-P3 severity model**: Security-reviewer promoted from generic OWASP checker to mandatory core-4 reviewer with P0 (blocks merge), P1 (requires ack), P2 (should fix), P3 (nice to have) classification
- **5 on-demand security specialist skills**: `/security-injection`, `/security-secrets`, `/security-auth`, `/security-data`, `/security-deps` -- spawned by security-reviewer via SendMessage within the review AgentTeam for deep trace analysis
- **6 security reference docs** (`docs/research/security/`): overview, injection-patterns, secrets-checklist, auth-patterns, data-exposure, dependency-security -- distilled from the secure-coding-failure PhD survey into actionable agent guides
- **Native addon build injection** (`scripts/postinstall.mjs`): Postinstall script auto-patches consumer `package.json` with `pnpm.onlyBuiltDependencies` config for `better-sqlite3` and `node-llama-cpp`. Handles indent preservation, BOM stripping, atomic writes
- **CLI preflight diagnostics** (`src/cli-preflight.ts`): Catches native module load failures before commands run, prints PM-specific fix instructions (pnpm: 3 options; npm/yarn: rebuild + build tool hints)
- **`ca doctor` pnpm check**: Verifies `onlyBuiltDependencies` is configured correctly for pnpm projects, recognizes wildcard `["*"]` as valid
- **Escalation-wiring tests**: 7 new tests verifying security-reviewer mentions all 5 specialists, each specialist declares "Spawned by security-reviewer", P0 documented as merge-blocking, each specialist has `npx ca knowledge` and references correct research doc
- **better-sqlite3 injection patterns**: Added project-specific `db.exec()` vs `db.prepare().run()` examples to `injection-patterns.md`

### Fixed

- **Noisy `node-llama-cpp` warnings on headless Linux**: Vulkan binary fallback and `special_eos_id` tokenizer warnings no longer print during `ca search` / `ca knowledge` -- GPU auto-detection preserved via `progressLogs: false` + `logLevel: error`
- **Resource leak in `isModelUsable()`**: `Llama` and `LlamaModel` instances are now properly disposed after the preflight usability check
- **Wildcard `onlyBuiltDependencies`**: Doctor and postinstall now recognize `["*"]` as fully configured (no false positive)
- **Infinity loop marker injection**: `--model` validated against shell metacharacters; grep patterns anchored (`^EPIC_COMPLETE`, `^EPIC_FAILED`) to prevent false-positive matches from prompt echo in logs
- **Template-to-deployed SKILL.md drift**: Backported all deployed specialist improvements (output fields, collaboration notes, `npx ca knowledge` lines) into source templates so `ca setup --update` no longer regresses
- **SSRF citations**: 3 OWASP references in `secure-coding-failure.md` corrected from A01 (Broken Access Control) to A10 (SSRF)
- **Stale verification docs**: Exit criteria updated from 6 to 8 categories (added Security Clear + Workflow Gates); closed-loop review process updated with security check in Stage 4 flowchart
- **Broken dual-path reference** in `subagent-pipeline.md`: Now documents both `docs/research/security/` (source repo) and `docs/compound/research/security/` (consumer repos)
- **Incomplete OWASP mapping** in `overview.md`: Completed from 5/10 to 10/10 (added A04, A05, A07, A08, A09)

### Changed

- **`getLlama()` initialization hardened**: Both call sites (`nomic.ts`, `model.ts`) now pass `build: 'never'` to prevent silent compilation from source on exotic platforms; set `NODE_LLAMA_CPP_DEBUG=true` to re-enable verbose output
- **Review skill wired to security arc**: P0 added to severity overview, security specialist skills listed as on-demand members, quality criteria include P0/P1 checks
- **WORKFLOW template**: Severity classification updated from P1/P2/P3 to P0-P3 with "Fix all P0/P1 findings"
- **Zero-findings instruction**: All 6 security templates (reviewer + 5 specialists) now include "return CLEAR" instruction when no findings detected
- **Scope-limiting instruction**: `security-injection` prioritizes files with interpreter sinks over pure data/config for large diffs (500+ lines)
- **Non-web context**: `security-auth` includes step for CLI/API-only projects without web routes
- **Graceful audit skip**: `security-deps` handles missing `pnpm audit` / `pip-audit` gracefully instead of failing

## [1.4.3] - 2026-02-23

### Fixed

- **Setup reports success when SQLite is broken**: `npx ca setup` now verifies that `better-sqlite3` actually loads after configuring `pnpm.onlyBuiltDependencies`, and auto-rebuilds if needed (escalates from `pnpm rebuild` to `pnpm install + rebuild`)
- **Misleading error message**: `ensureSqliteAvailable()` no longer suggests "Run: npx ca setup" (which didn't fix the problem); now provides per-package-manager rebuild instructions and build tools hint

### Added

- **SQLite health check in `ca doctor`**: New check reports `[FAIL]` with fix hint when `better-sqlite3` cannot load
- **SQLite status in `ca setup --status`**: Shows "OK" or "not available" alongside other status checks
- **`resetSqliteAvailability()` export**: Allows re-probing SQLite after native module rebuild

## [1.4.2] - 2026-02-23

### Fixed

- **Banner audio crash on headless Linux**: Async `ENOENT` error from missing `aplay` no longer crashes `ca setup --update`
- **PowerShell path injection on Windows**: Temp paths containing apostrophes no longer break or inject commands in `banner-audio.ts`
- **Banner audio test coverage**: Rewrote tests with proper mock isolation (`vi.spyOn` + file-scope `vi.mock`), covering async ENOENT, sync throw, stop() idempotency, and normal exit cleanup

## [1.4.1] - 2026-02-22

### Changed

- **Broader retrieval messaging**: `ca search` and `ca knowledge` descriptions in prime output and AGENTS.md now encourage general-purpose use beyond mandatory architectural triggers

## [1.4.0] - 2026-02-22

### Fixed

- **Plugin manifest**: Corrected repository URL from `compound_agent` to `learning_agent`

### Changed

- **Version consolidation**: Roll-up release of v1.3.7–v1.3.9 production readiness fixes (test pipeline hardening, data integrity, two-phase vector search, FTS5 sanitization)

## [1.3.9] - 2026-02-22

### Fixed

- **Integration test pipeline reliability**: Moved `pnpm build` from vitest globalSetup to npm script pre-step, eliminating EPERM errors from tsx/IPC conflicts inside vitest's process
- **Fail-fast globalSetup**: Missing `dist/cli.js` now throws a clear error instead of cascading 68+ test failures
- **Integration pool isolation**: Changed from `threads` to `forks` for integration tests — proper process isolation for subprocess-spawning tests
- **Timeout safety net**: Added `testTimeout: 30_000` to fallback vitest.config.ts, preventing 5s default under edge conditions

## [1.3.8] - 2026-02-22

### Fixed

- **Integration test reliability**: Dynamic assertion on workflow command count instead of hardcoded magic number; 30s test timeout for integration suite; conditional build in global-setup; 30s timeout on all bare `execSync` calls in init tests
- **Data integrity**: Indexing pipeline wraps delete/upsert/hash-set in a single transaction for atomic file re-indexing
- **FTS5 sanitization**: Extended regex to strip parentheses, colons, and braces in addition to existing special chars
- **Safe JSON.parse**: `rowToMemoryItem` now uses `safeJsonParse` with fallbacks instead of bare `JSON.parse`
- **ENOENT on schema migration**: `unlinkSync` in lessons DB wrapped in try/catch (matches knowledge DB pattern)
- **Worktree hook support**: `getGitHooksDir` resolves `.git` file (`gitdir:` reference) in worktrees

### Changed

- **Two-phase vector search**: Knowledge vector search loads only IDs + embeddings in phase 1, hydrates full text for top-k only in phase 2 (reduces memory from O(n * text) to O(n * embedding) + O(k * text))
- **Deduplicated FTS5 search**: `searchKeyword` and `searchKeywordScored` share a single `executeFtsQuery` helper
- **Removed redundant COUNT pre-checks**: FTS5 naturally returns empty on empty tables
- **Extracted chunk count helpers**: `getChunkCount` / `getChunkCountByFilePath` replace raw SQL in `knowledge.ts` and `indexing.ts`
- **Immutable extension sets**: `SUPPORTED_EXTENSIONS` typed as `ReadonlySet`; new `CODE_EXTENSIONS` constant replaces hardcoded array in chunking
- **`test:all` builds first**: Script now runs `pnpm build` before model download and test run
- **Test describe label**: Fixed misleading `'when stop_hook_active is false'` to match actual test condition

### Added

- `filesErrored` field in `IndexResult` to track file read failures during indexing
- `tsx` added to devDependencies (was used but not declared)

## [1.3.7] - 2026-02-22

### Fixed

- **Flaky tests**: Hardened auto-sync, init, and stop-audit tests with proper subprocess timeouts, guard assertions, and path resolution fixes
- **Conditional expects**: Replaced silent-pass `if (condition) { expect() }` patterns with explicit `it.runIf`/`it.skipIf` in model.test.ts
- **Singleton test timing**: Replaced `setTimeout(50)` with deterministic microtask yield in nomic-singleton.test.ts

### Changed

- **Test pipeline**: Split vitest workspace into unit/integration/embedding projects; `test:fast` now runs in ~12s (was ~107s)
- **Export tests**: Consolidated 27 individual export-existence tests into 7 grouped assertions in index.test.ts

### Added

- `pnpm test:unit` and `pnpm test:integration` scripts for targeted test execution
- Integration tags on 8 CLI test files outside `src/cli/`

## [1.3.3] - 2026-02-21

### Changed

- **Banner audio**: Rewritten as vaporwave composition with PolyBLEP anti-aliased sawtooth synthesis, biquad filters, Schroeder reverb, and delay. E minor ambiguity resolves to E major at bloom, synced 300ms ahead of the visual climax (neural brain lighting up). Post-animation reverb tail holds 1.8s for natural dissolution.

## [1.3.2] - 2026-02-21

### Added

- **Banner audio**: Pure TypeScript WAV synthesis during the tendril animation. Cross-platform: `afplay` (macOS), `aplay` (Linux), PowerShell (Windows). Silently skips if player unavailable. Zero dependencies.
- **Test coverage**: 19 new tests for `ca about` command, changelog extraction/escaping, and `--update` doc migration path

### Fixed

- **`setup --update` doc migration**: `--update` now installs the 5 split docs before removing legacy `HOW_TO_COMPOUND.md`, preventing empty `docs/compound/`
- **Fresh checkout type-check**: `src/changelog-data.ts` tracked in git so `tsc --noEmit` passes without a prior build
- **Trailing status text**: Banner animation no longer leaves "al tendrils..." remnant from previous phase

### Changed

- **`ca about` command**: Renamed from `ca version-show` for brevity
- **Changelog extraction**: Core parsing/escaping logic extracted to `scripts/changelog-utils.ts` (shared between prebuild script and tests)
- **Narrowed `.gitignore`**: Setup-generated patterns scoped to `compound/` subdirectories to avoid hiding tracked TDD agent definitions

## [1.3.1] - 2026-02-21

### Added

- **`ca about` command**: Displays version with terminal animation (tendril growth) and recent changelog entries. Non-TTY environments get plain text output. Changelog is embedded at build time from CHANGELOG.md.
- **3 new doctor checks**: Beads initialized (`.beads/` dir), beads healthy (`bd doctor`), codebase scope (user-scope detection)
- **Beads + scope status in init/setup output**: Full beads health display (CLI available, initialized, healthy) and scope status shown after `ca init`, `ca setup`, and `ca setup --update`
- **Banner on `--update`**: Terminal art animation now plays during `ca setup --update` and `ca init --update` (same TTY/quiet guards as fresh install)

### Changed

- **Split documentation**: `HOW_TO_COMPOUND.md` replaced by 5 focused documents in `docs/compound/`: `README.md`, `WORKFLOW.md`, `CLI_REFERENCE.md`, `SKILLS.md`, `INTEGRATION.md`
- **Test-cleaner Phase 3 strengthened**: Adversarial review phase now mandates iteration loop until both reviewers give unconditional approval. Heading, emphasis, and quality criteria updated.
- **Update hint on upgrade**: When `ca init` or `ca setup` detects an existing install, displays tip to run with `--update` to regenerate managed files
- **HOW_TO_COMPOUND.md migration**: `ca setup --update` automatically removes old monolithic `HOW_TO_COMPOUND.md` if it has version frontmatter (generated by compound-agent)
- **Doctor doc check**: Now checks for `docs/compound/README.md` instead of `HOW_TO_COMPOUND.md`

## [1.3.0] - 2026-02-21

### Added

- **Setup hardening**: Four new pre-flight checks during `ca init` and `ca setup`:
  - **Beads CLI check** (`beads-check.ts`): Detects if `bd` is available, shows install URL if missing (informational, non-blocking)
  - **User-scope detection** (`scope-check.ts`): Warns when installing at home directory level where lessons are shared across projects
  - **.gitignore injection** (`gitignore.ts`): Ensures `node_modules/` and `.claude/.cache/` patterns exist in `.gitignore`
  - **Upgrade detection** (`upgrade.ts`): Detects existing installs and runs migration pipeline (deprecated command removal, header stripping, doc version update)
- **Upgrade engine**: Automated migration from v1.2.x to v1.3.0:
  - Removes 5 deprecated CLI wrapper commands (`search.md`, `list.md`, `show.md`, `stats.md`, `wrong.md`)
  - Strips legacy `<!-- generated by compound-agent -->` headers from installed files
  - Updates `HOW_TO_COMPOUND.md` version during upgrade
- **`/compound:research` skill**: PhD-depth research producing structured survey documents following `TEMPLATE_FOR_RESEARCH.md` format
- **`/compound:test-clean` skill**: 5-phase test suite optimization with adversarial review (audit, design, implement, verify, report)
- **Documentation template**: `HOW_TO_COMPOUND.md` deployed to `docs/compound/` during setup with version and date placeholders
- **Test scripts**: `test:segment` (run tests for specific module), `test:random` (seeded random subset), `test:critical` (*.critical.test.ts convention)
- **3 new doctor checks**: Beads CLI availability, `.gitignore` health, usage documentation presence

### Fixed

- **`setup --update --dry-run` no longer mutates files**: `runUpgrade()` now accepts a `dryRun` parameter propagated to all sub-functions (removeDeprecatedCommands, stripGeneratedHeaders, upgradeDocVersion)
- **`setup --uninstall` respects plugin.json ownership**: Checks `name === "compound-agent"` before deleting; user-owned plugin manifests are preserved
- **Upgrade ownership guard**: `removeDeprecatedCommands` checks file content for compound-agent markers before deleting, preventing silent removal of user-authored files with the same name
- **Malformed settings.json no longer silently clobbered**: On parse error, `configureClaudeSettings` warns and skips instead of overwriting with empty config

### Changed

- **`setup --update` overhaul**: Now uses path-based file detection (compound/ = managed) instead of marker-based. Runs upgrade pipeline and `.gitignore` remediation during update
- **JSON-first `bd` parsing in loop**: `jq` primary with `python3` fallback via `parse_json()` helper
- **CLI test helpers hardened**: Replaced shell string interpolation with `execFileSync` for safety and reliability
- **Beads check portable**: Uses POSIX `command -v` instead of non-portable `which`
- **Template expansion**: Brainstorm and plan skills now cross-reference researcher skill; 9 total skills, 11 total commands
- **Code organization**: Extracted display utilities to `display-utils.ts`, uninstall logic to `uninstall.ts`

### Removed

- **5 deprecated CLI wrapper commands**: `search.md`, `list.md`, `show.md`, `stats.md`, `wrong.md` (redundant wrappers around `npx ca <cmd>`)
- **`GENERATED_MARKER` on new installs**: New installs use path-based detection; marker retained only for backward-compatible `--update` detection

## [1.2.11] - 2026-02-19

### Added

- **Git worktree integration** (`ca worktree`): Isolate epic work in separate git worktrees for parallel execution. Five subcommands:
  - `ca worktree create <epic-id>` — Create worktree, install deps, copy lessons, create Merge beads task
  - `ca worktree wire-deps <epic-id>` — Connect Review/Compound tasks as merge blockers (graceful no-op without worktree)
  - `ca worktree merge <epic-id>` — Two-phase merge: resolve conflicts in worktree, then land clean on main
  - `ca worktree list` — Show active worktrees with epic and merge task status
  - `ca worktree cleanup <epic-id>` — Remove worktree, branch, and close Merge task (--force for dirty worktrees)
- **`/compound:set-worktree` slash command**: Set up a worktree before running `/compound:lfg` for isolated epic execution
- **Conditional Merge gate in `verify-gates`**: Worktree epics require the Merge task to be closed before epic closure. Non-worktree epics unaffected.
- **Plan skill wire-deps step**: Plan phase now calls `ca worktree wire-deps` to connect merge dependencies when a worktree is active.

### Changed

- **Worktree merge safety hardening**: Added branch verification (asserts main repo is on `main`), worktree existence guard, structured error messages with worktree paths for conflict resolution and test failures
- **JSONL reconciliation**: Switched from ID-based to line-based deduplication to preserve last-write-wins semantics for same-ID updates and deletes
- **Worktree cleanup safety**: Branch deletion uses `-d` (safe) by default; `-D` (force) only with `--force` flag
- **Shared beads utilities**: Extracted `validateEpicId`, `parseBdShowDeps`, and `shortId` to `cli-utils.ts`, eliminating duplication between `worktree.ts` and `verify-gates.ts`
- **Sync API**: All worktree functions are now synchronous (removed misleading `async` wrapper around purely synchronous `execFileSync` calls)

## [1.2.10] - 2026-02-19

### Fixed

- **pnpm native build auto-configuration**: `ca setup` and `ca init` now detect pnpm projects (via `pnpm-lock.yaml`) and automatically add `better-sqlite3` and `node-llama-cpp` to `pnpm.onlyBuiltDependencies` in the consumer's `package.json`. Prevents the "better-sqlite3 failed to load" error that pnpm v9+ users encountered when native addon builds were silently blocked.
- **Improved error message**: `better-sqlite3` load failure now suggests running `npx ca setup` as the primary fix.

## [1.2.9] - 2026-02-19

### Added

- **`ca phase-check` command**: Manage LFG phase state with `init`, `status`, `clean`, and `gate <name>` subcommands. State persisted in `.claude/.ca-phase-state.json`.
- **PreToolUse phase guard hook** (`ca hooks run phase-guard`): Warns when Edit or Write tools are used before the current phase's skill file has been read.
- **PostToolUse read tracker hook** (`ca hooks run read-tracker`): Tracks skill file reads in `.ca-phase-state.json` so the phase guard can verify compliance.
- **Stop audit hook** (`ca hooks run stop-audit`): Blocks Claude from stopping if no phase gate has been passed when `stop_hook_active` is set in phase state.
- **Phase state persistence**: `.claude/.ca-phase-state.json` stores LFG phase tracking data across hook invocations.
- **Failure state persistence**: `.claude/.ca-failure-state.json` persists PostToolUseFailure counters across process restarts.

### Changed

- **`ca init`** now installs all 5 Claude Code hooks: SessionStart, PreCompact, UserPromptSubmit, PostToolUseFailure, PostToolUse (previously only SessionStart).
- **`ca setup claude`** now installs all 5 Claude Code hooks (previously only SessionStart).
- **`ca setup`** now installs the git pre-commit hook in addition to Claude Code hooks.

### Removed

- **MCP server**: `compound-agent-mcp` binary and `@modelcontextprotocol/sdk` dependency removed. Use CLI commands instead.
- **`.mcp.json`**: Configuration file is no longer generated or needed.

## [1.2.7] - 2026-02-17

### Changed

- **Explicit agent mechanism language in phase skills**: Each phase now clearly distinguishes subagents (Task tool, lightweight research) from AgentTeam teammates (TeamCreate + Task with `team_name`, dedicated role skills). Relative paths to agent definitions and role skill files included in every step.
  - Brainstorm/Plan: "Spawn **subagents** via Task tool" referencing `.claude/agents/compound/*.md`
  - Work/Review/Compound: "Deploy an **AgentTeam** (TeamCreate + Task with `team_name`)" referencing `.claude/skills/compound/agents/*/SKILL.md`

### Fixed

- **`verify-gates` JSON array unwrap**: `bd show --json` returns an array, not an object. `parseDepsJson()` now unwraps the first element before reading `depends_on`. Previously caused false gate failures on valid epics.

## [1.2.6] - 2026-02-16

### Changed

- **CLI-first interface**: All templates, AGENTS.md, and prime output now reference CLI commands (`npx ca search`, `npx ca learn`) as the primary interface. MCP tool references (`memory_search`, `memory_capture`) removed from user-facing content.
- **Agent roles as skills**: Extracted agent role definitions (test-writer, implementer, security-reviewer, etc.) from inline agent templates into dedicated skill files under `agent-role-skills-*.ts`. Agent templates are now thin wrappers referencing skills.
- **Adaptive multi-teammate scaling**: Phase skills (work, review, compound) now encourage deploying MULTIPLE teammates of the same role (multiple test-writers, multiple implementers) scaled to workload complexity.
- **Parallelization emphasis**: Agent role skills for natural-fit roles (test-writer, implementer, reviewers, context-analyzer, lesson-extractor) now include guidance on spawning parallel opus subagents for independent subtasks.
- **Command templates simplified**: Slash command templates deduplicated by referencing shared agent role skills instead of inlining full role descriptions.

### Fixed

- **[P0] Shell injection in `verify-gates`**: Replaced `execSync` with `execFileSync` to prevent shell interpretation of epic IDs. Added regex validation (`/^[a-zA-Z0-9_-]+$/`) to reject IDs with metacharacters.
- **[P1] Brittle parsing in `verify-gates`**: Primary path now uses `bd show --json` for structured JSON parsing. Text regex parsing retained as fallback only.
- **[P1] `compound` command resilience**: Added `isModelUsable()` preflight check before embedding loop. Gracefully exits with actionable error (`Run: npx ca download-model`) instead of crashing.

## [1.2.5] - 2026-02-16

### Changed

- **Skills synced with commands**: Enforcement content (phase gates, anti-MEMORY.md warnings, adaptive reviewer tiers, verification gates) copied from slash command templates into skill SKILL.md templates so both formats contain the same workflow enforcement.
- **ESLint config**: Excluded `examples/` directory so `pnpm lint` works without requiring `pnpm build` first.

## [1.2.4] - 2026-02-15

### Changed

- **lfg.md delegates phases to slash commands**: Instead of inlining all 5 phase workflows (~80 lines), lfg.md now invokes `/compound:{brainstorm,plan,work,review,compound}`. This prevents phase instructions from being compacted away by late phases.
- **lfg.md slimmed to thin orchestrator**: Reduced from ~2200 to ~1324 characters. Removed inlined Purpose, Stop Conditions, and Memory Integration sections.
- **Phase gates relocated to individual commands**: PHASE GATE 3 moved to work.md, PHASE GATE 4 to review.md, FINAL GATE to compound.md — gates now survive compaction.
- **YAML frontmatter on all 13 command templates**: Each template now has name, description, and argument-hint metadata. lfg.md additionally uses `disable-model-invocation: true`.
- **Anti-MEMORY.md guardrails**: compound.md and review.md now explicitly warn against using MEMORY.md for lesson storage, directing Claude to use `memory_capture` MCP tool instead.

### Fixed

- **Phase 5 context drift**: Claude no longer falls back to MEMORY.md during compound phase because each phase loads fresh instructions from its dedicated slash command.

## [1.2.1] - 2026-02-15

### Added

- **`ca verify-gates <epic-id>` command**: Verifies review and compound beads tasks exist and are closed before epic can be marked complete
- **Phase enforcement gates in `/compound:lfg`**: Mechanical STOP markers (`PHASE GATE 3`, `PHASE GATE 4`, `FINAL GATE`) between workflow phases prevent Claude from skipping review and compound phases
- **Per-phase MEMORY CHECK instructions**: Each of the 5 phases in lfg.md now has explicit `MEMORY CHECK` instructions for memory_search/memory_capture
- **Phase state tracking**: lfg.md tracks phase completion via `bd update --notes` with `Phase: COMPLETE` markers, surviving context compaction
- **SESSION CLOSE checklist in lfg.md**: Inviolable 8-step checklist at end of lfg workflow ensures bd sync and git push

### Fixed

- **`ca setup --update` now ensures MCP config**: Previously only regenerated templates; now also calls `configureClaudeSettings()` to ensure `.mcp.json` and hooks are current for projects upgrading from older versions
- **`ca prime` warns when MCP server is missing**: Displays actionable warning with `Run 'npx ca setup'` when `.mcp.json` is not registered
- **work.md verification gate strengthened**: Replaced soft "Verification Gate" with `MANDATORY VERIFICATION` section requiring `/implementation-reviewer` APPROVED status
- **compound.md minimum capture requirement**: Added "At minimum, capture 1 lesson per significant decision" to prevent empty compound phases
- **plan.md post-plan verification**: Added `POST-PLAN VERIFICATION` section with grep checks for review and compound task creation

## [1.2.0] - 2026-02-15

### Added

- **`ca loop` command**: Generate autonomous infinity loop scripts that process beads epics end-to-end via chained Claude Code sessions
- **HUMAN_REQUIRED marker**: Loop detects human-blocking issues, logs reason to beads, skips epic without stopping the loop
- **Review+compound blocking tasks**: Plan phase now creates review and compound beads issues with dependencies, ensuring these phases survive context compaction and surface via `bd ready`

### Fixed

- **Loop script `set -u` crash**: `LOOP_DRY_RUN` now uses safe expansion (`${VAR:-}`) for `set -u` compatibility
- **Infinite reprocessing**: Loop tracks processed epics to prevent re-selecting the same epic in dry-run or human-required paths
- **Input validation**: `--max-retries` rejects non-integer values; epic IDs validated against safe pattern to prevent shell injection
- **Exit codes**: `ca loop` now returns non-zero on errors (overwrite refusal, invalid options)

## [1.1.0] - 2026-02-15

### Added

- **External reviewer integration**: Optional Gemini CLI and Codex CLI as headless cross-model reviewers. Enable with `ca reviewer enable gemini`. Advisory only, non-blocking.
- **`ca reviewer` command**: `ca reviewer enable|disable|list` to manage external reviewers
- **`ca doctor` command**: Verifies external dependencies (bd, embedding model, hooks, MCP server) with actionable fix hints
- **Dynamic reviewer selection**: Review workflow scales agent count with diff size — 4 core reviewers for small diffs, 7 for medium, full 11 for large
- **Auto-sync on session start**: `ca prime` now syncs the SQLite index before loading lessons, ensuring MCP searches have fresh data after `git pull`
- **Config system**: `.claude/compound-agent.json` for user-editable settings (not overwritten by `setup --update`)

### Changed

- **Workflow commands**: Moved slash commands into `compound/` subfolder with legacy cleanup migration
- **Review template**: Tiered reviewer selection replaces fixed 11-reviewer spawn

### Fixed

- **Safe legacy migration**: `setup --update` and `--uninstall` now check for `GENERATED_MARKER` before deleting root-level commands — user-authored files preserved
- **Config robustness**: Malformed `.claude/compound-agent.json` no longer crashes reviewer commands
- **Consistent error handling**: `reviewer disable` and `list` now wrapped in try/catch matching `enable`
- **Template numbering**: Fixed duplicate step numbers in work.md workflow

## [1.0.0] - 2026-02-15

### Added

- **Unified memory types**: lesson, solution, pattern, preference -- all share one store, schema, and search mechanism
- **5-phase compound workflow**: brainstorm, plan, work, review, compound -- each with dedicated slash commands, SKILL.md files, and agent definitions
- **`/compound:lfg` command**: Chains all 5 phases sequentially for end-to-end workflow
- **Agent teams with inter-communication**: Specialized agents (reviewers, researchers, analysts) collaborate at each phase
- **MCP server**: `memory_search` and `memory_capture` tools, `memory://prime` resource for workflow context
- **Rule engine**: Config-driven validation for memory item quality via `ca rules check`
- **Audit system**: `ca audit` command runs pattern, rule, and lesson quality checks against the codebase
- **Test summary**: `ca test-summary` command runs tests and outputs a compact pass/fail summary
- **Intelligent compounding**: CCT pattern detection with similarity clustering and automatic synthesis
- **Embedding model**: EmbeddingGemma-300M via node-llama-cpp for local semantic search
- **Full-cycle integration tests**: 41 tests covering the complete compound workflow
- **Setup command (`ca setup`)**: One-shot configuration of hooks, MCP server, agents, commands, and skills
- **Setup update**: `ca setup --update` regenerates generated files while preserving user customizations
- **Setup status**: `ca setup --status` shows installation status of all components

### Changed

- **Renamed** from learning-agent (CLI: `lna`) to compound-agent (CLI: `ca`)
- **Architecture**: 3-layer design (Beads foundation, Semantic Memory, Workflows)
- **MCP integration**: MCP tools available alongside CLI commands
- **Memory storage**: Items stored in `.claude/lessons/index.jsonl` (backward compatible with v0.x lessons)
- **Hook system**: UserPromptSubmit and PostToolUse hooks for context-aware memory injection
- **MCP `memory_capture`**: Supports all memory types (lesson, solution, pattern, preference), severity, confirmation, supersedes, and related fields

### Fixed

- **Version state**: VERSION now reads from package.json at runtime
- **Model names**: Embedding model references use consistent naming
- **DB isolation**: Test suites use isolated database instances
- **Error visibility**: Structured error format with codes across all CLI commands

## [0.2.9] - 2026-02-07

### Fixed

- **Race conditions**: Embedding singleton init and TOCTOU in compaction
- **Score inflation**: Clamp combined boost multiplier in ranking
- **MCP resource cleanup**: Signal handlers for clean shutdown
- **Hook patterns**: Tighter matching and simplified failure tracking
- **Input validation**: Zod discriminated union for parseInputFile data shape
- **Version source**: Read from package.json instead of hardcoding

### Changed

- **Tombstone simplification**: Replaced tombstone records with `deleted` flag on Lesson
- **Command structure**: Flattened `setup/` and `management/` into `commands/`
- **Exports cleanup**: Removed unnecessary barrel re-exports
- **SQLite**: Removed graceful degradation layer and deprecated shim
- **MCP**: Deduplicated tool handlers into shared logic
- **Tests**: Consolidated three test utility files into `test-utils.ts`

## [0.2.8] - 2026-02-04

### Added

- **UserPromptSubmit Hook**: Detects correction and planning language in user messages
  - Correction detection: "actually", "wrong", "use X instead", "you forgot", etc.
  - Planning detection: "implement", "build", "create", "refactor", etc.
  - Injects gentle reminders to use `lesson_capture` and `lesson_search` MCP tools

- **PostToolUseFailure Hook**: Smart failure detection for Bash/Edit/Write tools
  - Triggers after 2 failures on same file/command OR 3 total failures
  - Suggests using `lesson_search` to find relevant lessons
  - State tracked per session, resets on success

- **PostToolUse Hook**: Resets failure tracking state after successful tool use

### Changed

- **Pre-commit prompt redesigned** with checklist format for better reflection
  - "LESSON CAPTURE CHECKPOINT" header
  - Explicit checkboxes for self-reflection
  - Clearer call-to-action

- **HookInstallResult discriminated union** for clear status messages
  - `installed`, `already_installed`, `not_git_repo`, `appended` statuses
  - No more ambiguous "Already installed or not a git repo" messages

### Fixed

- Git hook installation now provides specific status messages

## [0.2.7] - 2026-02-04

### Fixed

- **Prime Context MCP Alignment**: Updated trust language template to prioritize MCP tools
  - "MCP Tools (ALWAYS USE THESE)" section at top of prime output
  - `lesson_search` and `lesson_capture` as primary methods
  - CLI commands moved to "fallback only" section
  - Now consistent with AGENTS.md MCP-first approach

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

[Unreleased]: https://github.com/Nathandela/compound-agent/compare/v1.5.0...HEAD
[1.5.0]: https://github.com/Nathandela/compound-agent/compare/v1.4.4...v1.5.0
[1.4.4]: https://github.com/Nathandela/compound-agent/compare/v1.4.3...v1.4.4
[1.4.3]: https://github.com/Nathandela/compound-agent/compare/v1.4.2...v1.4.3
[1.4.2]: https://github.com/Nathandela/compound-agent/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/Nathandela/compound-agent/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/Nathandela/compound-agent/compare/v1.3.9...v1.4.0
[1.3.9]: https://github.com/Nathandela/compound-agent/compare/v1.3.8...v1.3.9
[1.3.8]: https://github.com/Nathandela/compound-agent/compare/v1.3.7...v1.3.8
[1.3.7]: https://github.com/Nathandela/compound-agent/compare/v1.3.3...v1.3.7
[1.3.3]: https://github.com/Nathandela/compound-agent/compare/v1.3.2...v1.3.3
[1.3.2]: https://github.com/Nathandela/compound-agent/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/Nathandela/compound-agent/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/Nathandela/compound-agent/compare/v1.2.11...v1.3.0
[1.2.11]: https://github.com/Nathandela/compound-agent/compare/v1.2.10...v1.2.11
[1.2.10]: https://github.com/Nathandela/compound-agent/compare/v1.2.9...v1.2.10
[1.2.9]: https://github.com/Nathandela/compound-agent/compare/v1.2.7...v1.2.9
[1.2.7]: https://github.com/Nathandela/compound-agent/compare/v1.2.6...v1.2.7
[1.2.6]: https://github.com/Nathandela/compound-agent/compare/v1.2.5...v1.2.6
[1.2.5]: https://github.com/Nathandela/compound-agent/compare/v1.2.4...v1.2.5
[1.2.4]: https://github.com/Nathandela/compound-agent/compare/v1.2.1...v1.2.4
[1.2.1]: https://github.com/Nathandela/compound-agent/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/Nathandela/compound-agent/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Nathandela/compound-agent/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Nathandela/compound-agent/compare/v0.2.9...v1.0.0
[0.2.9]: https://github.com/Nathandela/compound-agent/compare/v0.2.8...v0.2.9
[0.2.8]: https://github.com/Nathandela/compound-agent/compare/v0.2.7...v0.2.8
[0.2.7]: https://github.com/Nathandela/compound-agent/compare/v0.2.6...v0.2.7
[0.2.6]: https://github.com/Nathandela/compound-agent/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/Nathandela/compound-agent/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/Nathandela/compound-agent/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/Nathandela/compound-agent/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/Nathandela/compound-agent/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/Nathandela/compound-agent/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Nathandela/compound-agent/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Nathandela/compound-agent/releases/tag/v0.1.0
