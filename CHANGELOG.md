# Changelog

> **Note**: This project was renamed from **learning-agent** (CLI: `lna`) to **compound-agent** (CLI: `ca`) as part of the compound-agent rename. Historical entries below use the original name.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.7.2] - 2026-04-16

### Added

- **`ca uninstall` command**: reverses `ca init` / `ca setup` in three tiers. Default removes managed Claude Code hooks from `.claude/settings.json`. `--templates` additionally removes the `compound/` template directories (`.claude/agents/compound/`, `.claude/commands/compound/`, `.claude/skills/compound/`, `docs/compound/`) and `.claude/plugin.json`. `--all` additionally removes `.compound-agent/` runtime state and strips managed marker blocks from `AGENTS.md`, `.claude/CLAUDE.md`, root `.gitignore`, and `.claude/.gitignore`. `.claude/lessons/` and `.claude/compound-agent.json` are ALWAYS preserved. Requires `--yes` to skip interactive confirmation.
- **Install profiles (`ca setup --profile <minimal|workflow|full>`)**: `minimal` installs only lesson-capture plumbing (lessons dir, AGENTS.md integration, plugin.json, and 3 hooks — SessionStart/PreCompact prime + UserPromptSubmit reminder) — no commands, no phase skills, no agent role skills, no docs. `workflow` adds the 5-phase cook-it workflow (all commands, phase skills, agent role skills, doc templates, all phase/failure hooks) but skips the `docs/compound/research/` tree. `full` (default, backward-compatible) installs everything. `--confirm-prune` is required when a lower profile would delete existing templates on disk.

### Changed

- **Default model bumped to Opus 4.7**: All default model references updated from `claude-opus-4-6[1m]` to `claude-opus-4-7[1m]`. Affects `ca loop --model`, `ca loop --review-model`, `ca polish --model`, `ca improve --model`, the `claude-opus` reviewer selector in the generated review/polish scripts, and the Simplicity lens in the architect advisory fleet. Template skills (`loop-launcher/SKILL.md`, `architect/references/infinity-loop/README.md`, `architect/references/infinity-loop/troubleshooting.md`, `architect/references/polish-loop/README.md`, `architect/references/advisory-fleet.md`) and shipped docs (`CLI_REFERENCE.md`) updated to match. The Windows PowerShell reference template `$MODEL` default also updated.

### Fixed

- **Concrete fallback quality-gate commands**: when the project stack cannot be detected, the fallback strings substituted for `{{QUALITY_GATE_TEST}}`, `{{QUALITY_GATE_LINT}}`, and `{{QUALITY_GATE_BUILD}}` are now shell commands that exit non-zero with a `[compound-agent]`-tagged diagnostic on stderr, e.g. `sh -c 'echo "[compound-agent] test command not configured..." >&2; exit 1'`. Previously the fallbacks were English prose ("detect and run the project's test suite") that, when rendered into SKILL.md as shell commands, broke sh parsing on the apostrophe and produced a confusing error rather than a clear failure. Agents now see a visible failure with actionable configuration guidance.
- **`hasTransitionEvidence` robustness**: replaced hardcoded `5` with `len(Phases)` so the cook-it final-phase branch tracks the phase list automatically. No behavioral change today (architect at index 6 correctly falls through); regression tests (`TestHasTransitionEvidence_OutOfRangeReturnsFalse`, `TestHasTransitionEvidence_FinalPhaseAlwaysTrue`) pin the contract so a future `Phases` shrink can't introduce a panic.
- **Empty hook arrays in `settings.json`**: `AddHooksForProfile` and `RemoveAllHooks` both drop empty `"PreToolUse": []` style entries at the end of their run (previously created eagerly by `upgradeNpxHooks` calling `getHookArray` for every known hook type). Cosmetic only; no behavioral change for in-profile hooks.
- **`removeIfPresent` (formerly `removeIfExists`) semantics**: rewrote to suppress `os.ErrNotExist` internally and return `(existed bool, err error)`. `uninstallTemplates` now propagates real I/O errors (permission denied, read-only FS) when removing `.claude/plugin.json` instead of silently reporting success. Previously a permission error on plugin.json would make `ca uninstall --templates` report success without removing the file — flagged by the second-pass reviewer as a blocking issue. Regression tests `TestRemoveIfPresent_RealIOErrorSurfaces` and `TestUninstallTemplates_PropagatesRealIOError` pin the contract.
- **`polish-loop.sh` dry-run leaked state** (#17, #16): `POLISH_DRY_RUN=1` now fully skips the post-loop commit/push block AND writes a distinct `"status":"dry-run-completed"` to `.polish-status.json` instead of overwriting it with `"status":"completed"`. Previously a dry run still mutated git *and* produced a status file indistinguishable from a real run, defeating the preflight contract and misleading any monitoring tool that polled the status file. Regression test `TestPolishCommand_PostLoopRespectsDryRun` pins the guard structure so this can't silently come back.

## [2.7.1] - 2026-04-10

### Added

- **Surface alignment reviewer**: New agent-role-skill that verifies cross-layer connectivity (frontend↔backend↔database↔API). Checks regenerate-and-diff compliance, architecture test presence, database testing fidelity, schema evolution safety, and auth surface coverage. Spawned for medium and large diffs during review phase.
- **P16 "Surfaces stay connected"**: New principle in the agentic audit/setup manifesto (Pillar II). Scores projects on cross-layer integration testing maturity (0-2). Updated overall scoring from 30→32.
- **5 deep research documents** shipped with the library: architecture tests (ArchUnit survey), regenerate-and-diff patterns, database testing patterns, test infrastructure as code, and protobuf schema evolution. Mapped to specific reviewer agents for calibrated reviews.
- **Research-calibrated review fleet**: Review skill now includes surface-alignment-reviewer in medium+ tier (9 reviewers), with calibration query for surface alignment lessons. Lesson-calibration references updated with all 5 research doc mappings.

### Changed

- **build-great-things**: Added "System coherence is craft" as third design philosophy foundation. New structural coherence section in mandatory quality checklist (6 items). Added laziness pattern #13 "Disconnected layers".
- **Existing reviewers enhanced**: drift-detector, test-coverage-reviewer, and architecture-reviewer now reference relevant research documents. test-coverage-reviewer distinguishes integration from unit tests and flags SQLite substitution.

### Fixed

- **Dependencies**: `modernc.org/sqlite` 1.48.0→1.48.1 (fixes memory leaks and double-free in multi-statement queries), `libc` 0.2.183→0.2.184 (patch bump of transitive Rust dependency).

## [2.7.0] - 2026-04-09

### Changed

- **Artifact consolidation**: All runtime artifacts (loop scripts, agent logs, phase state files) now live under `.compound-agent/` instead of being scattered across the project root and `.claude/`. The `ca setup` command auto-migrates legacy locations with conflict detection (skips if both old and new exist).
- **Root `.gitignore` management**: `ca setup` now maintains a marker-delimited block in the root `.gitignore` for `.compound-agent/` entries, replacing individual pattern lines.

### Fixed

- **Retrocompatibility**: `GetPhaseState()` now falls back to the legacy `.claude/.ca-phase-state.json` path when the new `.compound-agent/` path is missing, and auto-migrates on first access. Repos upgrading without re-running `ca init` no longer lose active cook-it sessions.
- **Failure tracker on fresh repos**: `writeFailureState()` now auto-creates the `.compound-agent/` directory, fixing silent `post-tool-failure` hook regression on repos that haven't run `ca init`.
- **Stale path references**: Updated all `./infinity-loop.sh`, `./polish-loop.sh`, `./improvement-loop.sh` references to `.compound-agent/` prefix in GOTCHA.md, infinity-loop README, review-fleet.md, and generated script headers.
- **`.claude/.gitignore` cleanup**: Removed stale `.ca-*-state.json` patterns (files moved to `.compound-agent/`), added `.ca-hints-shown` and `skills/compound/skills_index.json`.

## [2.6.2] - 2026-04-05

### Added

- **Loop monitoring protocol**: Loop-launcher skill now includes a structured health check protocol (post-launch verification, stall detection, progress table with ETA), plus a log file map for all `agent_logs/` artifacts.
- **Windows loop support references**: WSL2+tmux setup guide (recommended path) and native PowerShell infinity-loop reference template under `loop-launcher/references/windows/`. PS1 template is a structural translation of the bash infinity loop with documented Windows gaps.
- **CLI documentation**: Added `ca info`, `ca health`, `ca polish`, `ca feedback` commands to CLI_REFERENCE.md, README, and shipped docs quick reference.

### Fixed

- **P0: `--epics` syntax in docs**: CLI_REFERENCE.md and epic-ordering.md incorrectly showed space-separated `--epics` syntax; fixed to comma-separated (`--epics "id1,id2,id3"`).
- **P0: Duplicate `setupTestRepo`**: Renamed duplicate function in `integration_test.go` to `setupEmptyTestRepo` to prevent build bomb with integration tag.
- **PruneEvents performance**: Added row count guard — telemetry pruning now skips the full-table DELETE when table has fewer rows than the threshold.
- **Lesson search DB reuse**: `makeLessonSearchFunc` now reuses the caller's DB handle instead of opening a new connection per search call.
- **`openURL` error handling**: Browser open command errors are now logged to stderr instead of silently discarded.
- **`outcomeToSuccess` default**: Unknown telemetry outcomes now map to failure (0) instead of success (1).
- **Phase state atomic writes**: `WritePhaseState` now uses temp+rename pattern to prevent JSON corruption on crash.
- **`knowledgeNeedsRebuild` locking**: Added `busy_timeout` pragma to prevent indefinite blocking when another process holds the write lock.
- **`HydrateChunks` performance**: Replaced O(n^2) string concatenation with `strings.Builder` for IN-clause placeholders.
- **`formatInfoPhase` display**: Fixed "phase 6/5" display in architect mode by clamping total to actual phase index.
- **`lockedOpenKnowledgeDB` DSN**: Now uses shared `buildDSN()` instead of hardcoded DSN string.
- **Redundant TOCTOU check**: Removed redundant `os.Stat` before `OpenRepoDB` in info command.
- **WSL2 guide**: Fixed credential helper backslash escaping, updated to modern Git path, added Claude Code auth step and `bd` prerequisite.
- **PS1 template**: Fixed 6-backtick comment, `Get-Command` resolution, crash handler variable, symlink HardLink fallback, added `-Encoding utf8`, optimized JSONL extraction with `switch -File`.
- **SKILL.md monitoring**: Fixed `readlink` basename path, replaced hardcoded session names with `.beads/loop-session-name`, added epoch delta calculation example and ETA disclaimer.
- **Stale docs**: Removed orphaned TypeScript-era CHANGELOG entries, fixed `npx ca` references in lessons-reviewer, removed stale TS path in lint-classifier, updated GOTCHA.md Windows statement.
- **README alignment**: Fixed `--review-model` default, Node.js version (>=18), `--epics` variadic notation.
- **Test improvements**: Removed duplicate `TestOpenDB_SchemaVersionIs7`, added error checking to PRAGMA test calls, added `testing.Short()` guard to telemetry overhead test (threshold raised to 100ms), added `t.Parallel()` to 13 storage tests, fixed `writePhaseState` test helper error handling.
- **`publish-platforms.cjs`**: Fixed Buffer-to-string coercion in error output handling.

## [2.6.1] - 2026-04-03

### Added

- **Architect phase state support**: Phase system now recognizes `architect` as phase index 6. `ca phase-check init <id> --phase architect` initializes architect-specific state, enabling phase guard and read tracker during architect sessions.
- **Loop script stale state cleanup**: Generated infinity loop scripts now run `ca phase-check clean` before each epic, preventing leftover architect or previous-epic state from blocking cook-it initialization.

### Fixed

- **Architect Phase 5 skipping loop-launcher skill**: Replaced inline "Quick summary" in architect SKILL.md Phase 5 with mandatory delegation to `/compound:launch-loop` command, which enforces reading loop-launcher/SKILL.md before generating scripts.
- **Stale TypeScript binary detection**: Loop-launcher pre-flight now verifies `ca loop --help` shows Cobra output and `ca polish --help` succeeds, catching stale TypeScript CLI binaries before they cause model validation or missing command errors.
- **Phase status display**: `ca phase-check status` no longer hardcodes `/5` denominator, correctly displaying architect phase index.
- **Phase guard message**: Warning no longer hardcodes `phase N/5` format, now shows phase name and index.

## [2.6.0] - 2026-04-01

### Added

- **`--compact-pct` flag** for `ca loop`, `ca improve`, and `ca polish`: Sets `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` in generated scripts to trigger context compaction earlier during autonomous workflows. Default 0 (use Claude Code default). Suggested value: 50 for Opus 1M sessions. Only affects generated scripts, not interactive sessions. Validates range 0-100.
- **Windows Native Support**: Native Windows binaries (amd64 + arm64) distributed via npm. Pure-Go SQLite driver eliminates CGO requirement. Real `LockFileEx`/`UnlockFileEx` file locking, `OpenProcess`/`GetExitCodeProcess` process detection, and `cmd /c start` URL opening with command injection prevention. Search gracefully degrades to keyword-only FTS5 (embed daemon is Unix-only). CI matrix includes `windows-latest`.
- **Self-Explaining System (`ca info`)** (Epic 4): New CLI command displaying comprehensive system health — version, hooks, skills, phase state, telemetry, and lesson corpus stats. 13 tests.
- **Skill Phase Metadata** (Epic 3): Structured `phase` field in YAML frontmatter of all SKILL.md files with pre-compiled `skills_index.json` for fast runtime skill lookup. Phase guard uses `ResolveSkillPath` for phase-aware routing.
- **Telemetry Foundation** (Epic 2): Schema v7 with telemetry table, `ca health` command, file-based lock for concurrent access, and hook execution instrumentation.
- **V3.0 Harness Overhaul Specification**: Spec and advisory brief for upcoming harness overhaul.
- **GOTCHA.md for architect skill**: Documented common pitfalls for architect workflows.

### Changed

- **SQLite driver**: Replaced `mattn/go-sqlite3` (CGO) with `modernc.org/sqlite` (pure Go). Enables `CGO_ENABLED=0` builds and Windows cross-compilation. DSN format uses `_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)`. FTS5 included by default — no build tags required.
- **Build pipeline**: All builds now use `CGO_ENABLED=0`. Removed `-tags sqlite_fts5` from Makefile, CI, GoReleaser, and lint config. Added `windows-amd64` and `windows-arm64` targets to GoReleaser, CI matrix, and Makefile.
- **npm distribution**: Added `@syottos/win32-x64` and `@syottos/win32-arm64` platform packages. Updated `bin/ca` wrapper, `postinstall.cjs`, and `publish-platforms.cjs` for `.exe` handling and embed daemon exclusion on Windows.

### Fixed

- **Documentation inaccuracies** (Epic 1): Fixed TypeScript/npm references across docs and templates, corrected hook counts, rewrote README with Mermaid diagram, added WSL2 doctor check.
- **Screen session name collisions**: Unique session names using `compound-loop-$(basename $(pwd))` pattern to avoid host-level collisions (PR #10).
- **6 golangci-lint violations**: gofmt alignment in map literals, extracted `checkHooks`/`printDoctorResults` helpers to reduce cyclop/funlen, handled `flockUnlock` error return.
- **Review findings**: Multiple rounds of P0-P3 fixes from external reviewers across Epics 1-4.
- **Command injection in `openURL`**: Windows `cmd /c start` now validates URL scheme (`http://`/`https://` only) and uses `exec.Command` argument splitting to prevent shell metacharacter injection.

### Dependencies

- **modernc.org/sqlite**: v1.48.0 — pure-Go SQLite driver replacing mattn/go-sqlite3 (CGO). Enables Windows native builds.
- **golang.org/x/sys**: v0.42.0 — Windows `LockFileEx`/`UnlockFileEx` and process APIs.
- **thiserror**: 1.0.69 to 2.0.18 in Rust embed daemon — major version bump with no-std support and improved diagnostics (PR #8).
- **tokenizers**: 0.21.4 to 0.22.2 in Rust embed daemon — PyO3 0.26, faster vocab loading, GIL-free (PR #7).

## [2.5.2] - 2026-03-31

### Added

- **Stale output watchdog (Layer 4)**: New background watchdog monitors trace file for output inactivity during Claude sessions. If no output is written for `SESSION_STALE_TIMEOUT` seconds (default: 1800s/30min), the session is killed and the loop proceeds. Prevents indefinite hangs when the Claude CLI completes its API work but fails to exit.

### Fixed

- **Polish loop deadlock**: Architect prompt no longer uses `Parent: $META_EPIC` label, which caused the architect to wire blocking dependencies to a meta-epic that never closes. Replaced with context-only reference and explicit prohibition against `--parent` and `bd dep add` to the meta-epic.
- **Silent zero-work exit**: Infinity loop now exits with code 2 (distinct from success=0 and failure=1) when zero epics are completed and zero failed, signaling that all epics were blocked or skipped.
- **Inner loop exit code swallowed**: Polish loop's `run_inner_loop` used `|| true` which discarded the exit code. Now captures exit code properly and detects zero-work (exit 2) to surface blocked-epic deadlocks.
- **Inner loop `set -e` cascade**: `run_inner_loop` call in main polish loop now guarded with `||` handler, matching the pattern used for `run_polish_architect`, preventing a single failed cycle from aborting the entire polish script.

### Removed

- **Improve loop references from architect skill**: Removed `ca improve` references from shipped architect SKILL.md, infinity-loop README, pre-flight docs, and deleted the `references/improve-loop/` directory. The improve loop remains available as a standalone CLI command but is not part of the architect workflow.

## [2.5.1] - 2026-03-28

### Added

- **Visual verification in polish audit**: Reviewers now auto-detect UI projects and take Playwright screenshots at 4 viewports (375px, 768px, 1024px, 1440px) as part of their audit, critiquing layout, spacing, contrast, hierarchy, and responsiveness alongside static code analysis. Graceful degradation when Playwright is unavailable or no UI detected (P3/INFO + [NEEDS_QA] fallback).
- **Visual verification in cook-it review**: Step 10b in the review skill takes Playwright screenshots when the Verification Contract requires `browser_evidence`, `design_craft_check`, or `responsive_check`. References QA Engineer detection logic for framework auto-detection.

## [2.5.0] - 2026-03-27

### Added

- **Polish Loop (Phase 6)**: New `ca polish` CLI command generates a standalone bash script for iterative quality refinement. Runs N cycles of: multi-model audit fleet evaluating full implementation against the build-great-things pre-ship checklist (34 quality items + 12 laziness anti-patterns), mini-architect decomposing findings into improvement epics, and inner infinity loop implementing them. Supports claude-opus, claude-sonnet, gemini, and codex as reviewers. Includes dry-run mode, crash handler with status JSON, reviewer CLI detection with graceful degradation, and per-cycle observability (individual reports, synthesized reports, architect logs).
- **Architect Phase 6**: Opt-in phase in architect SKILL.md that activates after the infinity loop completes. Gate 5 for user confirmation. Generates and launches the polish loop script with monitoring commands.
- **Polish loop reference docs**: `architect/references/polish-loop/README.md` (configuration reference) and `audit-prompt.md` (audit prompt design explaining how it differs from the review fleet).

### Fixed

- **Polish loop: dry-run crash** (P0): `POLISH_EPICS` variable initialized before the loop and at start of each cycle to prevent unbound variable error under `set -u`.
- **Polish loop: crash handler exit code** (P0): EXIT trap now preserves the original exit code with `exit $exit_code` so callers detect failures.
- **Polish loop: log() ordering** (P1): `log()` function defined before crash handler in script assembly to prevent `log: command not found` during early failures.
- **Polish loop: missing ca prerequisite** (P1): Added `command -v ca` check alongside claude and bd.
- **Polish loop: ARG_MAX risk** (P1): Reviewer prompts piped via stdin (`-p - < file`) instead of command substitution to handle large specs.
- **Polish loop: architect heredoc expansion** (P1): Mini-architect prompt uses quoted heredoc + file-based injection to prevent shell expansion of report content containing `$` or backticks.
- **Polish loop: spec file validation** (P1): Script fails fast if spec file doesn't exist at runtime.
- **Polish loop: git commit before push**: Post-loop commits synthesized reports and status artifacts before pushing.

## [2.4.1] - 2026-03-26

### Fixed

- **Platform binary version mismatch**: `package.json` optionalDependencies pointed `@syottos/*` packages at `2.3.0` while the main package was `2.4.0`. Users installing `compound-agent@2.4.0` got v2.3.0 Go binaries, silently missing `build-great-things` and `qa-engineer` skills, updated `architect` references (advisory fleet, improve loop), and updated `review` skill (QA engineer integration). Added `TestPlatformVersionSync` CI test and documented the version sync requirement in CONTRIBUTING.md and CLAUDE.md to prevent recurrence.

## [2.4.0] - 2026-03-26

### Added

- **Build Great Things skill**: New `skills/build-great-things/` ships a comprehensive design and development playbook via `ca init`. Covers both software design philosophy (Ousterhout's complexity management, deep modules, information hiding) and the full build sequence for user-facing products across 6 phases (Foundation → Structure → Craft → Motion → Performance → Launch) with separate website and webapp tracks. Includes mandatory quality checklist, 12 anti-patterns for common AI laziness, and routing table for task-specific guidance. 12 reference files provide phase-specific design principles and research pointers.
- **Design research library**: 50 new research documents shipped under `docs/compound/research/` covering web design (typography, color theory, IA, interaction design, accessibility, responsive design), frontend craft (CSS/WebGL, motion design, award-winning site anatomy), financial report design (dashboards, data visualization, tables), design styles (Swiss International, brutalist, editorial, luxury, academic, synthwave), B2C product strategy (JTBD, positioning, conversion, behavioral psychology, growth loops), and software design philosophy (Ousterhout). All indexed in `research/index.md` with skill/agent targeting.
- **Architect design skill detection**: Architect skill Phase 1 now auto-detects systems where design quality matters and Phase 2 adds an advisory note recommending `/compound:build-great-things` for applicable epics.
- **Research docs shipping**: `ca init` now installs `docs/compound/research/` (42 files across 9 topic directories) to consumer repos via `go:embed`. Restores research delivery that was lost during the Go migration -- ~25 template files (agent-role-skills, phase skills, commands) reference these docs for domain knowledge (security, TDD, property testing, code review, etc.).
- **Research drift tests**: `TestTemplateDrift_ResearchSourceMatchesEmbed` verifies source and embedded research trees stay in sync. `TestTemplateDrift_ResearchReferencesResolve` validates all `docs/compound/research/` path references in templates point to files that actually exist.
- **Nested reference directories**: `//go:embed` patterns changed from explicit file globs to directory-level embedding (`skills`, `agent-role-skills`), enabling skills to ship structured reference subdirectories. The install/prune pipeline already supported nesting — only the embed pattern was blocking.
- **Architect infinity-loop reference restructure**: Replaced the 734-line monolith `infinity-loop.md` with 7 concern-based files in `references/infinity-loop/`: README.md (symptom→file router), pre-flight.md, memory-safety.md, epic-ordering.md, logging.md, review-fleet.md, troubleshooting.md. Includes 4 new failure modes from overnight run post-mortem analysis.
- **Architect advisory fleet**: New `references/advisory-fleet.md` adds a multi-model advisory phase before Gate 2 (post-Spec). Spawns up to 4 external model CLIs (claude-sonnet, gemini, codex, claude-opus) in parallel via background Bash calls, each evaluating the spec through a different lens (security/reliability, scalability/performance, organizational/delivery, simplicity/alternatives). All CLI invocation patterns live-tested against actual CLIs. Advisory only — informs the human's decision at the gate but cannot veto. Gracefully degrades when CLIs are unavailable.
- **QA Engineer skill**: New `skills/qa-engineer/` ships hands-on browser-based QA testing via `ca init`. Decision-tree routing (Web UI / HTTP API / CLI skip), reconnaissance-first methodology (networkidle → screenshot → DOM → console → network capture before acting), 6 test strategies (smoke, exploratory break-things, visual review, accessibility, form/input boundary, network inspection), and structured P0-P3 reporting. Three reference docs: `exploratory-testing.md` (systematic boundary/state/auth/fuzzing playbook), `browser-automation.md` (Playwright patterns, server lifecycle, viewport testing, axe-core integration), `constitution-schema.md` (optional persistent test definitions per page). Design informed by deep analysis of Anthropic's webapp-testing, lackeyjb/playwright-skill, and hemangjoshi37a/claude-code-frontend-dev. Integrated into review SKILL.md as optional step 8 for visual/UI changes and referenced in infinity-loop review-fleet.md.

### Fixed

- **Phantom runtime-verification references**: 4 template files referenced `docs/research/q-and-a/runtime-verification.md` which never existed. Redirected to `docs/compound/research/scenario-testing/`.
- **Research index.md accuracy**: Fixed source path (was `docs/research/`, now `docs/compound/research/`). Added managed-directory warning so users know `docs/compound/research/` is fully managed by `ca init` and user research belongs in `docs/research/`.
- **Loop generator: `log()` stdout corruption** (P0): `log()` now writes to stderr (`>&2`). Previously, `log()` wrote to stdout, causing skip messages from `check_deps_closed()` to corrupt epic IDs when captured via `EPIC_ID=$(get_next_epic)`. This single bug caused 5 cascading failures in a 6-hour overnight run.
- **Loop generator: Claude reviewers silent** (P1): Added `--dangerously-skip-permissions` to Claude reviewer invocations (both `--session-id` cycle 1 and `--resume` cycle 2+). Without it, reviewers couldn't use tools in non-interactive mode, producing 1-byte output files.
- **Loop generator: Codex reviewer broken** (P1): Fixed Codex invocation — `-p` is `--profile` (not prompt), prompt is a positional arg. Changed to `codex exec --full-auto -o "$report" -- - < "$prompt_file"` for stdin input and clean output capture. Stdout redirect (`>`) captured UI chrome; `-o` captures only the assistant's response.
- **Loop generator: dry-run contamination** (P2): Guarded `COMPLETED` increment, `log_result`, periodic review trigger, git dirty check, summary JSONL write, `write_status`, and `git push` with `LOOP_DRY_RUN` checks. Previously, dry-run wrote ghost entries to the execution log.

## [2.3.0] - 2026-03-25

### Added

- **Smarter failure escalation** (Epic 1): When Claude Code tools fail repeatedly (≥3 same-target or ≥3 total), the post-tool-failure hook now searches the lesson database for relevant past solutions instead of showing a static tip. Includes injectable `LessonSearchFunc`, rune-safe token extraction from error output, BM25-scored FTS5 search with 500ms timeout, 4-level fallback chain, and confidence annotations for low-scoring matches.
- **Architect intelligence** (Epic 2): Architect skill gains a research sufficiency gate (search `ca search` + `docs/research/` before spec writing) and automatic integration verification epic creation during decomposition.
- **Acceptance criteria protocol** (Epic 3): AC table generation from EARS requirements in the plan phase, AC reading in the work phase, and an AC gate between plan and work in the cook-it pipeline.
- **Lesson-calibrated reviews** (Epic 4): Review skill now searches past lessons per-reviewer (3-5 cap, recency bias) and conditionally triggers runtime verification via the new `runtime-verifier` agent role skill for ephemeral Playwright testing.
- **Integration verification** (Epic 5): Template drift detection test that verifies reviewer names in skill templates have matching agent role skill directories.
- **Context-aware FTS5 search**: New `SearchKeywordScoredORContext()` method threads `context.Context` through to `QueryContext`, enforcing the 500ms timeout contract at the database layer.

### Fixed

- **Failure threshold off-by-one**: `sameTargetThreshold` changed from 2 to 3 to match EARS spec FE-1 (≥3 failures before escalation).
- **Phantom reviewer names**: Fixed `cct-reviewer` → `cct-subagent` and `docs-reviewer` → `doc-gardener` in review and compound skill templates.
- **Cyclop complexity violation**: Extracted `installAgentRoleSkillReferences()` helper from `InstallAgentRoleSkills()` in `primitives.go` to stay within the cyclomatic complexity limit.
- **Comma-separated epic IDs in loop generator**: `ca loop` now converts comma-separated epic IDs to space-separated for bash `for` loop compatibility.

## [2.2.1] - 2026-03-24

### Added

- **Loop generator production parity**: Brought the Go `ca loop` script generator to full parity with the hardened production `infinity-loop.sh`. Ported crash handler (EXIT trap with status file logging), 3-layer memory safety (repo-scoped orphan cleanup, memory gate, background watchdog with PID tracking), `parse_json()` with jq/python3 fallback, dependency-aware epic ordering (`check_deps_closed()`), dual-file anchored marker detection, and CLI prerequisite checks.
- **Loop review and improve phases**: Implemented 8 missing flags from the former TS CLI: `--reviewers`, `--review-every`, `--max-review-cycles`, `--review-blocking`, `--review-model`, `--improve`, `--improve-max-iters`, `--improve-time-budget`. Review phase supports multi-model spawning, session management, and review cycles with implementer fix loop. Improve phase supports topic discovery, iteration with rollback, and time budget.
- **Field-tested enhancements**: Git status check after epic completion (auto-commits if dirty), git push at loop end (with remote availability check), reviewer availability summary logging.
- **Infinity-loop reference docs**: Added troubleshooting section and real-world example from compound-agent's own 6-epic loop run.

### Fixed

- **Review triggers were dead code**: Review phase triggers were placed after an exit statement and never executed.
- **Undefined variable in periodic trigger**: `$RESULT` replaced with `$SUCCESS` in periodic review trigger.
- **Review base SHA reset in loop**: `REVIEW_BASE_SHA` was incorrectly reset inside the while loop on every iteration.
- **Improve phase stdin piping**: `extract_text` was using file args instead of stdin pipe.
- **Conditional exit**: Exit line now omitted when improve phase follows review phase.

## [2.2.0] - 2026-03-23

### Added

- **CLI flag parity with TypeScript**: Ported 5 missing flags from the former TS CLI to the Go implementation for full migration parity:
  - `--quiet` / `-q` global flag — suppresses non-essential `[ok]`/status output in `init` and `setup`
  - `init --skip-agents` — skips template installation (AGENTS.md, skills, commands, docs)
  - `init --skip-claude` — skips Claude Code hooks installation (alias for `--skip-hooks`)
  - `setup claude --dry-run` — previews what would be installed/upgraded/reconciled without writing
  - `download-model --json` — outputs download result as JSON
- **Stack-aware quality gates**: `ca setup` now detects the project stack (Go, Rust, Python, Node, Make) and substitutes `{{QUALITY_GATE_TEST}}` / `{{QUALITY_GATE_LINT}}` placeholders in skill and doc templates with the correct commands. Non-JS codebases no longer see hardcoded `pnpm test` / `pnpm lint`.

### Changed

- **Refactored `main.go`**: Extracted `buildHooksCmd()` helper from `main()` to stay within 50-line function limit.
- **Refactored `commands_setup.go`**: Extracted `setupClaudeOpts` struct and `runSetupClaude()` function from the `registerSetupClaudeCmd` inline closure.
- **Refactored `commands_advanced.go`**: Extracted `printDownloadModelResult()` helper from `downloadModelCmd`.

## [2.1.2] - 2026-03-23

### Fixed

- **Compound-agent prime output was invisible in Claude hooks**: `ca prime` now writes normal command output to stdout instead of stderr, so `SessionStart` and `PreCompact` hook output is visible to Claude Code rather than being dropped by stderr redirection or ignored by hook rendering.
- **Duplicate Claude hook reconciliation**: `ca setup claude` now detects and repairs duplicated compound-agent hook entries in `.claude/settings.json` instead of treating them as healthy installs. Hook detection and removal now correctly recognize shell-escaped binary commands like `'/path/to/ca' prime`.

## [2.1.1] - 2026-03-23

### Fixed

- **Tip strings broken for npm-installed users**: Reverted `npx ca` → `ca` change in user-facing tip strings (correction reminder, planning reminder, failure tip, trust language). npm-installed users only have `npx ca` in PATH — the `ca` binary lives in `node_modules/.bin/`. Hook commands in `settings.json` correctly use absolute binary paths and are unaffected.
- **CI lint action**: Upgraded `golangci-lint-action` from v6 to v7 (v6 doesn't support golangci-lint v2).

## [2.1.0] - 2026-03-23

### Added

- **Structured logging via `log/slog`**: Replaced all ad-hoc `fmt.Fprintf(os.Stderr, ...)` calls in production code with structured `slog` calls (Error/Warn/Debug levels). No external dependencies — uses Go stdlib only.
- **`--verbose` / `-v` global flag**: New persistent flag on the root command enables debug-level JSON logging to stderr. Default level is Warn (silent in normal operation).
- **Dependabot configuration**: Added `.github/dependabot.yml` for automated weekly dependency update PRs targeting Go modules (`/go`) and Cargo (`/rust/embed-daemon`).

### Changed

- **AGENTS.md rewritten for Go**: Complete rewrite of AGENTS.md to reflect the Go-based architecture. Removed all stale TypeScript/pnpm/vitest/Commander.js references. Now accurately documents Cobra CLI commands, `go/internal/` package layout, Go conventions, and build/test commands.

### Fixed

- **CI lint pipeline**: Upgraded golangci-lint to v2.11.4 (Go 1.26 support), migrated `.golangci.yml` from v1 to v2 format, resolved all 313 pre-existing lint violations across 72 files. All refactoring is purely structural — no behavior changes.
- **Stale `npx ca` references in runtime strings**: Replaced `npx ca` with `ca` in user-facing hook messages (pre-commit reminder, correction/planning reminders, failure tips) and AI context strings (`ca prime` trust language, loop prompt builder).
- **Setup upgrade reconciliation**: `ca setup` now reconciles existing managed files during upgrades, prunes retired templates and nested phase reference files from managed `compound/` directories.
- **GoReleaser config**: Fixed deprecated `.goreleaser.yml` fields (`format` → `formats`, `builds` → `ids`).
- **Duplicate function**: Removed duplicate `countOldLessons` definition in `commands_scripts.go`.

## [2.0.3] - 2026-03-22

### Fixed

- **SessionStart/PreCompact hooks broken with npx**: Hooks using `npx ca prime` fail silently in Claude Code hook context (different PATH/environment). `ca setup` now writes the absolute binary path instead. Existing `npx ca` hooks are automatically upgraded to use the direct path on next `ca setup`.

## [2.0.2] - 2026-03-22

### Fixed

- **Silent empty-result messages**: `search`, `load-session`, and `check-plan` commands showed no output when no results found (missing trailing newline merged text with shell prompt).
- **Setup command output**: `setup` now shows the same detailed breakdown as `init` (directories created, template counts by type, AGENTS.md/CLAUDE.md status).
- **Beads status reporting**: `init` and `setup` now report whether beads CLI is installed and whether the repo is initialized. Shows install instructions if missing.

## [2.0.1] - 2026-03-22

### Changed

- **Platform-specific npm distribution**: Switch from postinstall-only binary download to industry-standard optional dependencies pattern (`@syottos/{os}-{arch}`). Works with pnpm out of the box — no `approve-builds` needed.
- **Lazy download fallback**: If platform packages are missing and postinstall was blocked, the bin wrapper downloads the binary on first use from GitHub Releases.
- **Non-fatal postinstall**: Postinstall no longer crashes `npm install` on download failure — the lazy fallback handles it.
- **npm publish provenance**: All packages published with `--provenance` for supply chain transparency.
- **Checksum verification in CI**: Release workflow verifies SHA256 checksums before publishing to npm.
- **Version-aware skip logic**: Postinstall checks binary version matches package version, preventing stale binaries after upgrades.

### Added

- **Weekly npm token health check**: Scheduled workflow verifies `NPM_TOKEN` validity every Monday.
- **Platform publish script**: `scripts/publish-platforms.cjs` handles creating and publishing `@syottos/*` packages during releases. Idempotent — safe to re-run.

## [1.8.0] - 2026-03-15

### Added

- **`ca improve` command**: Generates a bash script that autonomously improves the codebase using `improve/*.md` program files. Each program defines what to improve, how to find work, and how to validate changes. Options: `--topics` (filter specific topics), `--max-iters` (iterations per topic, default 5), `--time-budget` (total seconds, 0=unlimited), `--model`, `--force`, `--dry-run`. Includes `ca improve init` subcommand to scaffold an example program file.
- **`ca watch` command**: Tails and pretty-prints live trace JSONL from infinity loop and improvement loop sessions. Supports `--epic <id>` to watch a specific epic, `--improve` to watch improvement loop traces, and `--no-follow` to print existing trace and exit. Formats tool calls, thinking blocks, token usage, and result markers into a compact, color-coded stream.

### Fixed

- **`git clean` scoping in improvement loop**: Bare `git clean -fd` on rollback was removing all untracked files including the script's own log directory, causing crashes. All three rollback paths now use `git clean -fd -e "$LOG_DIR/"` to exclude agent logs.
- **Embedded dirty-worktree guard fallthrough**: In embedded mode (when improvement loop runs inside `ca loop --improve`), setting `IMPROVE_RESULT=1` on a dirty worktree did not prevent the loop body from executing. Restructured to use `if/else` so the loop body only runs inside the `else` branch.
- **`ca watch --improve` ignoring `.latest` symlink**: The `--improve` code path had inline logic that only did reverse filename sort, bypassing the `.latest` symlink that the improvement loop maintains. Refactored `findLatestTraceFile()` with a `prefix` parameter to unify both code paths.
- **`--topics` flag ignored in `get_topics()`**: The `TOPIC_FILTER` variable from the CLI `--topics` flag was not used in the generated bash `get_topics()` function, causing all topics to run regardless of filtering.
- **Update-check hardening**: Switched to a lightweight npm registry endpoint, added CI environment guards, and corrected the update command shown to users.

## [1.7.6] - 2026-03-12

### Added

- **`ca install-beads` command**: Standalone subcommand to install the beads CLI via the official script. Includes a platform guard (skips on Windows with `exitCode 1`), an "already installed" short-circuit, a `--yes` flag to bypass the confirmation hint (safe: never runs `curl | bash` without explicit opt-in), `spawnSync` with a 60-second timeout, and a post-install shell-reload warning. Non-TTY mode without `--yes` prints the install command as a copy-pasteable hint rather than silently doing nothing.

### Fixed

- **Beads hint display**: `printBeadsFullStatus` was silently swallowing the install hint message when the beads CLI was not found. The curl install command is now printed below the "not found" line.
- **Beads hint text**: `checkBeadsAvailable` now returns the actual `curl -sSL ... | bash` install command in its message instead of a bare repo URL.
- **Doctor fix message**: `ca doctor` now shows `Run: ca install-beads` for the missing-beads check instead of pointing to a URL.
- **`ca knowledge` description**: Reframed from "Ask the project docs any question" to "Semantic search over project docs — use keyword phrases, not questions" in both the live prime template and the setup template, reflecting the underlying embedding RAG retrieval mechanism.

## [1.7.5] - 2026-03-12

### Added

- **`ca feedback` command**: Surfaces the GitHub Discussions URL for bug reports and feature requests. `ca feedback --open` opens the page directly in the browser. Cross-platform (macOS `open`, Windows `start`, Linux `xdg-open`).
- **Star and feedback prompt in `ca about`**: TTY sessions now see a star-us link and the GitHub Discussions URL after the changelog output.

### Changed

- **README overhaul**: Complete rewrite to present compound-agent as a full agentic development environment rather than a memory plugin.
  - New thesis-driven one-liner that names category, mechanism, and benefit
  - "What gets installed" inventory table (15 commands, 24 agent role skills, 7 hooks, 5 phase skills, 5 docs)
  - Three principles section mapping each architecture layer to the problem it solves (Memory / Feedback Loops / Navigable Structure)
  - "Agents are interchangeable" design principle explained in the overview
  - Levels of use replacing flat Quick Start: memory-only, structured workflow, and factory mode with code examples
  - `/compound:architect` promoted to its own section with 4-phase description and context-window motivation
  - Infinity loop elevated from CLI table row to its own section with full flag examples and honest maturity note
  - Automatic hooks table with per-hook descriptions
  - Architecture diagram updated to reflect three-principle mapping and accurate counts
  - Compound loop diagram updated with architect as optional upstream entry point
  - "Open with an AI agent" entry point in the Documentation section

## [1.7.4] - 2026-03-11

### Added

- **Research-enriched phase skills**: Applied insights from 3 PhD-level research documents (Science of Decomposition, Architecture Under Uncertainty, Emergent Behavior in Composed Systems) across all 6 core phase skills:
  - **Architect**: reversibility analysis (Baldwin & Clark), change volatility, 6-subagent convoy (added STPA control structure analyst + structural-semantic gap analyst), implicit interface contracts (threading, backpressure, delivery guarantees), organizational alignment (Team Topologies), multi-criteria validation gate (structural/semantic/organizational/economic), assumption capture with fitness functions and re-decomposition triggers
  - **Spec-dev**: Cynefin classification (Clear/Complicated/Complex), composition EARS templates (timeout/retry interactions), change volatility assessment
  - **Plan**: boundary stability check, Last Responsible Moment identification, change coupling prevention
  - **Work**: Fowler technical debt quadrant (only Prudent/Deliberate accepted), composition boundary verification with metastable failure checks
  - **Review**: composition-specific reviewers (boundary-reviewer, control-structure-reviewer, observability-reviewer), architect assumption validation
  - **Compound**: decomposition quality assessment, assumption tracking (predicted vs actual), emergence root cause classification (Garlan/STPA/phase transition)
- **Lint graduation in compound phase**: The compound phase (step 10) now spawns a `lint-classifier` subagent that classifies each captured insight as LINTABLE, PARTIAL, or NOT_LINTABLE. High-confidence lintable insights are promoted to beads tasks under a "Linting Improvement" epic with self-contained rule specifications. Two rule classes: Class A (native `rules.json` — regex/glob) and Class B (external linter — AST analysis).
- **Linter detection module** (`src/lint/`): Scans repos for ESLint (flat + legacy configs including TypeScript variants), Ruff (including `pyproject.toml`), Clippy, golangci-lint, ast-grep, and Semgrep. Exported from the package as `detectLinter()`, `LinterInfoSchema`, `LinterNameSchema`.
- **Lint-classifier agent template**: Ships via `npx ca init` to `.claude/agents/compound/lint-classifier.md`. Includes 7 few-shot examples, Class A/B routing, and linter-aware task creation.

### Fixed

- **PhD research output path**: `/compound:get-a-phd` now writes user-generated research to `docs/research/` instead of `docs/compound/research/`. The `docs/compound/` directory is reserved for shipped library content; project-specific research no longer pollutes it. Overlap scanning checks both directories.

## [1.7.3] - 2026-03-09

### Added

- **Update notification**: CLI checks npm registry for newer versions on startup (24h file-based cache, non-blocking). Notification displays after command output (TTY only) and in `ca prime` context.

### Fixed

- **Spec-dev epic type**: `bd create` in spec-dev Phase 4 now explicitly uses `--type=epic`, preventing epics from defaulting to task type. Plan phase also validates the epic type and corrects it if needed.
- **Update-check hardening**: Added explicit `res.ok` check in `fetchLatestVersion`, removed dead `checkedAt` cache field, removed redundant type cast.

## [1.7.2] - 2026-03-09

### Added

- **Loop review phase**: `ca loop` can now spawn independent AI reviewers (Claude Sonnet, Claude Opus, Gemini, Codex) in parallel after every N completed epics. Reviewers produce severity-tagged reports, an implementer session fixes findings, and reviewers are resumed (not fresh) to verify fixes. Iterates until all approve or max cycles reached. New CLI options: `--reviewers`, `--review-every`, `--max-review-cycles`, `--review-blocking`, `--review-model`. Gracefully skips unavailable CLIs.

### Fixed

- **Security: command injection in `ca test-summary --cmd`**: User-supplied test command is now validated against an allowlist of safe prefixes (`pnpm`, `npm`, `vitest`, etc.) and shell metacharacters are rejected.
- **Security: shell injection in `ca doctor`**: Replaced `execSync(cmd, {shell})` with `execFileSync('bd', ['doctor'])` to avoid shell interpretation.
- **Portable timeout for macOS**: Generated loop scripts now use a `portable_timeout()` wrapper that tries GNU `timeout`, then `gtimeout` (Homebrew coreutils), then a shell-based kill/watchdog fallback. Previously failed silently on macOS.
- **Session ID python3 fallback**: Review phase session ID management now falls back to python3 when `jq` is unavailable, with a centralized `read_session_id()` helper.
- **Git diff window stability**: Replaced fragile `HEAD~$N..HEAD` commit-count arithmetic with SHA-based `$REVIEW_BASE_SHA..HEAD` diff ranges, immune to rebases and cherry-picks.
- **ID collision risk**: Memory item IDs now use 64-bit entropy (16 hex chars) instead of 32-bit (8 hex chars).
- **JSONL resilience**: Malformed lines in JSONL files are now skipped with try/catch per line instead of crashing the entire read.
- **Stdin timeout leak**: `clearTimeout` now called in `finally` block for stdin reads in retrieval and hooks.
- **Double JSONL read eliminated**: `readMemoryItems()` now returns `deletedIds` set, removing the need for a separate `wasLessonDeleted()` file read.
- **FTS5 trigger optimization**: SQLite update trigger now scoped to FTS-indexed columns only, reducing unnecessary FTS rebuilds.
- **Clustering noise accuracy**: Single-item clusters now correctly returned as `noise` instead of an always-empty noise array.
- **Embed-worker path validation**: `embed-worker` command now validates that `repoRoot` exists and is a directory before proceeding.
- **Script check timeout**: Rule-based script checks now have a 30-second default timeout, configurable via `check.timeout`.

### Changed

- **Anchored approval detection**: Review loop now uses `^REVIEW_APPROVED` anchored grep to prevent false positives from partial-line matches.
- **Numeric option validation**: `--review-every` and `--max-review-cycles` now reject NaN, negative, and non-integer values.
- **`isModelUsable()` replaced**: `compound` command now uses lightweight `isModelAvailable()` (fs check) instead of loading the 278MB model just to probe.
- **Dead code removed**: `addCompoundAgentHook()`, back-compat hook aliases (`CLAUDE_READ_TRACKER_HOOK_CONFIG`, `CLAUDE_STOP_AUDIT_HOOK_CONFIG`), and `wasLessonDeleted()` removed.
- **Hardcoded model extracted**: Five occurrences of `'claude-opus-4-6'` in loop.ts extracted to `DEFAULT_MODEL` constant.
- **EPIC_ID_PATTERN deduplicated**: `watch.ts` now imports `LOOP_EPIC_ID_PATTERN` from `loop.ts` instead of maintaining a duplicate.
- **`warn()` output corrected**: `shared.ts` warn helper now writes to `stderr` instead of `stdout`.
- **Templates import fixed**: `templates.ts` now imports `VERSION` from `../version.js` instead of barrel re-export.

## [1.7.1] - 2026-03-09

### Added

- **Scenario testing integration**: Spec-dev Phase 3 now generates scenario tables from EARS requirements and Mermaid diagrams with five categories (happy, error, boundary, combinatorial, adversarial). Review phase verifies coverage via a new `scenario-coverage-reviewer` agent using heuristic AI-driven matching.
- **Scenario coverage reviewer**: New medium-tier AgentTeam reviewer that matches test files against epic scenario tables and flags gaps (P1) or partial coverage (P2). Spawned for diffs >100 lines.

### Fixed

- **Stale reviewer count in tests**: Updated "5 reviewer perspectives" test to "6" with `scenario-coverage` assertion. Removed no-op `.replace('security-', 'security-')` in escalation wiring test.

## [1.7.0] - 2026-03-08

### Added

- **Loop observability**: Generated loop script now writes `.loop-status.json` (real-time epic/attempt/status) and `loop-execution.jsonl` (append-only result log with per-epic duration and end-of-loop summary). Enables `ca watch --status` and post-mortem forensics.
- **ESLint rule `no-solo-trivial-assertion`**: Custom rule that warns when a test's only assertion is `toBeDefined()`, `toBeTruthy()`, `toBeFalsy()`, or `toBeNull()`. Registered but not yet enabled (requires cleanup of ~40 existing violations).

### Fixed

- **Loop 0-byte log resilience**: `extract_text` pipeline could produce 0-byte log files while the trace JSONL had valid content, causing the loop to falsely detect failure. New `detect_marker()` function checks the macro log first (anchored grep), then falls back to the trace JSONL (unanchored grep). Includes health check warning on extraction failure.
- **Search fallback when embeddings unavailable**: `retrieveForPlan()` no longer throws when the embedding model is missing or broken. Falls back to keyword-only search with a console warning.

### Changed

- **Anti-cargo-cult reviewer strengthened**: Added three new subtle anti-patterns to the reviewer agent: solo trivial assertions, substring-only `toContain()` checks, and keyword-presence tests. Each with bad/good examples.
- **Loop template extraction**: Bash script templates moved to `loop-templates.ts` to stay within lint limits.

## [1.6.5] - 2026-03-07

### Fixed

- **Loop script bash 3.2 syntax error**: macOS ships bash 3.2 which misparses `case` pattern `)` inside `$(...)` as closing the subshell. Added `(` prefix to case patterns for POSIX compliance. Added `/bin/bash -n` regression test.
- **Loop script `--verbose` flag**: `--output-format=stream-json` with `-p` requires `--verbose`, not `--include-partial-messages`.

## [1.6.4] - 2026-03-07

### Fixed

- **Embedding memory leak**: Every `npx ca search` spawned a process that loaded the ~150MB native embedding model. Without explicit cleanup, native threads kept processes alive as zombies. During heavy usage (Claude Code subagents), 32+ processes accumulated = 4.5GB leaked.
  - `withEmbedding(fn)` scoped wrapper guarantees cleanup via try/finally. All 9 command-layer consumers migrated from manual try/finally to this single API.
  - ESLint rule `require-embedding-cleanup` catches any file importing `embedText`/`getEmbedding` without a cleanup function. Scoped to `src/commands/` and `src/setup/`.
  - `cli-app.ts` backstop: top-level finally in `runProgram()` catches anything the above two miss.
- **`embedText` probe inside `withEmbedding` scope**: `clean-lessons` command was calling `embedText` outside of `withEmbedding`, leaking the model on every invocation.
- **Agentic skill report format**: Markdown table was missing `|---|` separator row, rendering as plain text in some renderers.
- **Agentic skill missing setup remediation**: 5 of 15 principles (P8, P12-P15) had no setup actions. Added concrete remediation guidance for each.
- **Agentic skill missing completion gate**: Other skills have phase gates; the agentic skill was missing one. Added Setup Completion Gate with verification steps.
- **Agentic skill stack-biased scoring**: Rubric was TypeScript-heavy. Added language-neutral scoring guidance (mypy, clippy, ruff equivalents).
- **Agentic skill `$ARGUMENTS` dead code**: Mode is set by the calling command (`/compound:agentic-audit` or `/compound:agentic-setup`), not parsed from `$ARGUMENTS`.
- **Docs template missing agentic commands**: `SKILLS.md` template now lists `agentic-audit` and `agentic-setup` in the command inventory.

## [1.6.3] - 2026-03-05

### Changed

- **Cook-it session banner**: Replaced "Claude the Cooker" chef ASCII art with rscr's detailed front-view brain ASCII art ("Claw'd"). Brain features ANSI-colored augmentation zones: cyan neural interface (`##`), bright cyan signal crosslinks (`::`), green bio-circuits (`%`), magenta data highways (`######`), and yellow power nodes (`@@`).

## [1.6.2] - 2026-03-05

### Fixed

- **Cook-it session banner**: The cook-it skill now instructs Claude to print the "Claude the Cooker" ASCII chef banner at the very start of every cooking session.

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
- **Float32Array consistency**: Lesson embedding path now keeps `Float32Array` from the embedding pipeline instead of converting via `Array.from()` (4x memory savings per vector)
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

[Unreleased]: https://github.com/Nathandela/compound-agent/compare/v1.6.5...HEAD
[1.6.5]: https://github.com/Nathandela/compound-agent/compare/v1.6.4...v1.6.5
[1.6.4]: https://github.com/Nathandela/compound-agent/compare/v1.6.3...v1.6.4
[1.6.3]: https://github.com/Nathandela/compound-agent/compare/v1.6.2...v1.6.3
[1.6.2]: https://github.com/Nathandela/compound-agent/compare/v1.6.1...v1.6.2
[1.6.1]: https://github.com/Nathandela/compound-agent/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/Nathandela/compound-agent/compare/v1.5.0...v1.6.0
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
