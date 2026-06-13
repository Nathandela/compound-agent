# Goose Harness Integration - Open-Model Implementer + Compound Primitives

> Spec ID: TBD (assign on triage)
> Status: Draft
> Author: Nathan + investigation session (2026-06-13)
> Created: 2026-06-13

## Goal

Add Goose (github.com/block/goose, Apache-2.0, Linux Foundation AAIF) as a first-class
**implementer** in the infinity and polish loops, driving epics with **open-source local
models (Ollama)** and **API open-weight models (DeepSeek / Qwen3-Coder / GLM)** as co-equal
targets. In the same effort, install compound-agent's core primitives (memory priming,
phase-gate, lesson capture, review fleet, skills, memory file) **into Goose** so that epics
run with compound's structure intact. End state: a fully-open mode of the compound loop that
does not depend on Anthropic, while keeping the existing Claude/Codex/Gemini paths.

## Context

- **Why now (economics).** ADR-0001 records that Anthropic's 2026-06-15 billing split meters
  `claude -p` at API rates while `claude --bg` stays on subscription. The whole `bg`/`p`
  backend seam exists to manage that. Open/local/API models are the next cost-and-sovereignty
  lever: a Goose implementer on DeepSeek or local Ollama sidesteps Anthropic metering entirely.
- **Why Goose (fit).** compound-agent's identity is "Memory. Knowledge. Structure.
  Accountability. Fully local, git-tracked." Goose is Apache-2.0, Linux-Foundation-governed
  (no single-vendor risk), local-capable, and headless. It was the only harness in our survey
  that cleared all four hard gates: (1) a pre-tool hook that can **block** (phase-gate), (2)
  **native parallel subagents** (review fleet), (3) **local Ollama + arbitrary API** providers,
  (4) genuinely **open + maintained + headless**.
- **Alternatives considered and rejected.** OpenHands (passes all gates but defaults to a
  Docker sandbox, operational weight); Cline CLI 2.0 (passes, but hooks are a TypeScript-SDK
  plugin layer and the product is IDE-first); Qwen Code (hooks fine, but subagents are
  sequential / ~40% Claude-parity); OpenCode (most popular, 75+ providers, but blocking hooks
  are **bypassed by subagent tool calls**, bug #5894 - fatal for phase-gating). Option A
  ("keep Claude Code, swap the model" via claude-code-router or DeepSeek's Anthropic-compatible
  endpoint) is the lower-effort alternative and remains a valid fallback, but was not chosen
  because it does not give a native open harness with first-class primitives and it inherits
  Claude Code's hardcoded subagent-model enum.

## Current architecture (what we mapped)

File references are to `go/internal/cli/` as of the 2026-06-13 investigation; line numbers drift.

- `ca loop` / `ca polish` are **Go script generators**. They emit a self-contained bash script
  (`.compound-agent/infinity-loop.sh`) that is run inside a `screen` session for durability and
  as the data source for `ca watch`.
- The loop iterates over **epics** (beads / `bd` work items). For each epic it builds a prompt,
  dispatches an agent through a **3-operation backend seam**, and detects completion from text
  markers.
- **Backend seam** (`commands_scripts.go`): `agent_dispatch` (~1012), `agent_poll` (~1075),
  `agent_collect` (~1132), `agent_stop` (~1228), `agent_cleanup` (~1252), `agent_invoke` (~1383).
  Each is a `case "$CA_BACKEND" in p|bg) ... esac`. Both backends are **Claude**:
  - `p`: `claude -p --output-format stream-json ... | tee | extract_text` (subshell PID handle).
  - `bg`: `claude --bg ...` (8-hex session id handle; auto-isolates into a git worktree that is
    harvested/merged before cleanup; completion polled from `~/.claude/jobs/<id>/state.json`).
- **Completion protocol** is harness-agnostic text markers: `EPIC_COMPLETE`,
  `HUMAN_REQUIRED: <reason>`, `EPIC_FAILED`. `detect_marker` (~770) greps the extracted log and
  the raw trace.
- **Prompt** (`build_prompt`, ~682) instructs the agent to run `/compound:cook-it from plan`
  (a Claude Code slash-command) and to print the marker. This is the **deepest Claude coupling**.
- **Output parsing** (`extract_text`, ~737) parses **Claude Code stream-json**.
- **Reviewer fleet is already multi-harness** (`commands_scripts_polish.go` ~707,
  `commands_scripts_review.go` ~572): `case "$reviewer" in (claude-*) agent_invoke ... |
  (gemini) gemini --yolo | (codex) codex exec --full-auto`. Reviewer models are hardcoded per
  name (`claude-sonnet-4-6`, `claude-opus-4-7[1m]`, review.go ~574). Availability is probed with
  `command -v <cli>` + `--version` (review.go ~129).
- A prior mapping produced a **10-touchpoint plan** for a `--provider` / `--implementer` flag
  threaded into a `case "$IMPLEMENTER"` switch inside `agent_dispatch`. Minimal diff = touch
  `agent_dispatch` + the `ca loop` flag only; defer `ca polish` and the reviewer fleet.
- **Constraints inherited from ADR-0001.** `bd` (beads/Dolt) is unreachable from inside a git
  worktree (spike G2), so all `bd` operations run in the main tree post-harvest. `claude --bg`
  auto-commits; other implementers do not (the prompt must commit/push explicitly).

## Goose capabilities (verified 2026-06)

- **Hooks** (Open Plugins spec): `SessionStart`, `SessionEnd`, `Stop`, `UserPromptSubmit`,
  `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `BeforeReadFile`, `AfterFileEdit`,
  `BeforeShellExecution`, `AfterShellExecution`. **Blocking confirmed** (PR #9304, shipped
  v1.35.0, May 2026): a `PreToolUse` hook denies by exit code `2` or by writing
  `{"decision":"block","reason":"..."}` to stdout; the reason is fed back to the model as a
  tool error. Hook types: `command` (arbitrary shell), `http`, `mcp_tool`, `prompt`, `agent`.
  Discovery path: `~/.agents/plugins/<name>/hooks/hooks.json` (user) or
  `<project>/.agents/plugins/<name>/hooks/hooks.json` (project). Matcher regex for per-tool
  targeting; first explicit deny wins.
- **Subagents**: native isolated `Agent` instances, parallel (max 10 concurrent, 25 turns,
  5-min default timeout), anti-recursion guard (subagents cannot spawn subagents). **Subrecipes**:
  child `goose run --recipe` processes with **per-recipe `goose_provider` / `goose_model`** (so a
  heterogeneous review fleet can put each reviewer on a different model), parallel up to 10.
- **Providers**: Ollama is first-class (`http://localhost:11434/v1`, no API key); any
  OpenAI-compatible `baseUrl` + key (DeepSeek, DashScope/Qwen, GLM/Zhipu, OpenRouter, LM Studio,
  vLLM, etc.). Gotcha: Ollama default context is 4096; set `OLLAMA_CONTEXT_LENGTH` >= 32768 or
  extensions and `.goosehints` are silently ignored. Goose docs note it "works best with Claude 4";
  local tool-calling is fragile below ~14B.
- **Recipes** (skills analog): YAML with `title`, `description`, `instructions`/`prompt`, typed
  `parameters`, `extensions` (MCP pinned per recipe), `settings` (per-recipe model/provider/
  temperature/max_turns), `retry` (shell-check loops), `response` (JSON schema enforcement),
  Jinja `{% extends %}` template inheritance. Recipes register as slash commands.
- **Memory file**: `.goosehints` (project-level, analog of `CLAUDE.md`); Goose also reads
  `AGENTS.md`.
- **MCP**: native extension primitive; pinnable per recipe.
- **Headless**: `goose run --no-session -i <promptfile>`; `GOOSE_CONTEXT_STRATEGY` controls
  overflow (summarize/truncate/clear).
- **Maturity**: Apache-2.0, ~49k stars, Block + Linux Foundation AAIF, weekly releases
  (v1.37.0, June 2026). Rust core.

## Primitive mapping: compound (Claude Code / Gemini CLI) -> Goose

| compound primitive | current mechanism | Goose mechanism | porting note |
|---|---|---|---|
| Session-start memory priming | `SessionStart` hook runs `npx ca load-session` | Goose `SessionStart` hook (`command`) | reuse shell logic; new path `~/.agents/plugins/compound/hooks/hooks.json` |
| Lesson injection on prompt | `UserPromptSubmit` hook | Goose `UserPromptSubmit` hook | direct |
| **Phase-gate (block edit if wrong phase)** | `PreToolUse` hook denies | Goose `PreToolUse` hook, exit 2 / `decision:block` | event-name + matcher remap; **must verify it fires inside subrecipes** |
| Lesson capture | `PostToolUse` hook | Goose `PostToolUse` / `AfterFileEdit` / `AfterShellExecution` | map per tool class |
| Review fleet (parallel specialists) | `.claude/agents` + Task tool | Goose **subrecipes** (per-model) or subagents | subrecipes preferred (per-agent model + process isolation) |
| Skills / slash-commands (`/compound:cook-it`) | Claude slash-command | Goose **recipe** `compound-cook-it` (registerable as slash command) | encode plan/work/review/compound as instructions or subrecipes |
| Memory file (CLAUDE.md / AGENTS.md) | loaded at session start | `.goosehints` (+ AGENTS.md read natively) | direct |
| MCP servers | `.mcp.json` | Goose extensions (recipe-pinned) | direct |
| Completion markers | text in output | unchanged (text) | harness-agnostic, already portable |

## Implementation design

### A. Goose as a loop implementer (the seam)

- **Flag**: add `--implementer {claude,goose}` to `ca loop` (and later `ca polish`). For Goose,
  `--model` accepts a `provider/model` reference (e.g. `ollama/qwen2.5-coder:14b`,
  `deepseek/deepseek-chat`, `glm/glm-5.1`). The generator emits `CA_IMPLEMENTER`, `GOOSE_PROVIDER`,
  `GOOSE_MODEL` into the script. This generalizes the existing `--backend` precedence pattern and
  reuses the 10-touchpoint `--provider` map.
- **Seam cases** (key the existing `case` blocks on `CA_IMPLEMENTER`, nesting the current
  `CA_BACKEND` switch under `claude`):
  - `agent_dispatch` (goose): `goose run --no-session -i "$promptfile"` (MVP) or
    `goose run --recipe compound-cook-it --params epic="$EPIC_ID"` (preferred), with
    `GOOSE_PROVIDER`/`GOOSE_MODEL` in env; run as a background subshell, `AGENT_HANDLE=$!`;
    `tee` stdout to `$tracefile`.
  - `agent_poll` (goose): `kill -0 "$handle"` (p-style PID poll).
  - `agent_collect` (goose): `detect_marker` over the goose stdout log; in-tree, no worktree
    harvest for MVP.
  - `agent_stop` / `agent_cleanup` (goose): kill the PID / no-op.
  - `extract_text` (goose): Goose stdout is human-readable text, so marker grep works directly;
    add a `--format json` parser only if richer extraction is needed.
  - `build_prompt` (goose): cannot call `/compound:cook-it`. Either (preferred) invoke the
    `compound-cook-it` **recipe**, or inline the plan->work->review->compound steps as plain
    instructions. Either way keep the explicit "print `EPIC_COMPLETE` on its own line" and an
    explicit `git add -A && commit && push` step (Goose does not auto-commit).
- **Preflight** (goose): `command -v goose`; provider readiness (local: `ollama` up + model
  pulled; API: key env var set); `OLLAMA_CONTEXT_LENGTH >= 32768`; **skip** the Claude
  bypass-disclaimer and `worktree.bgIsolation` checks.

### B. Compound primitives installed into Goose (`ca setup` Goose target)

Add a third harness install target alongside `.claude/` and `.gemini/`:

- **Hooks** at `~/.agents/plugins/compound/hooks/hooks.json` (and/or project
  `.agents/plugins/compound/`), mapping: `SessionStart` -> prime, `UserPromptSubmit` -> inject
  lessons, `PreToolUse` -> phase-gate (exit 2 / `decision:block`), `PostToolUse` /
  `AfterFileEdit` -> capture lessons. Reuse the existing Claude/Gemini hook shell scripts; adapt
  event names and matchers to the Open Plugins schema.
- **Memory**: write `.goosehints` (and keep `AGENTS.md`, which Goose reads).
- **Recipes**: `compound-cook-it.yaml` for the workflow; optionally `compound-plan`,
  `compound-work`, `compound-review`, `compound-compound` as recipes/subrecipes.
- **Review fleet**: one subrecipe per reviewer (e.g. `compound-review-security.yaml`), each with
  its own `goose_model`, so the fleet can be heterogeneous and fully open.

### C. Open-model review fleet (Phase 3)

Add Goose subrecipe reviewers to the loop's review phase as an alternative to the existing
`claude-sonnet,claude-opus,gemini,codex` fleet, selected by name like the others.

### Model targets (co-equal)

| | Local Ollama | API open-weights |
|---|---|---|
| Config | `GOOSE_PROVIDER=ollama`, `baseUrl=localhost:11434/v1`, no key, `OLLAMA_CONTEXT_LENGTH>=32768` | `GOOSE_PROVIDER=<openai-compatible>`, `baseUrl`+key (DeepSeek / DashScope-Qwen / GLM / OpenRouter) |
| Models | `qwen2.5-coder:14b`, `qwen3-coder` (tool-calling-capable, fit 16 GB) | DeepSeek V3/V4, Qwen3-Coder, GLM-5.1 |
| Reality | weak tool-calling < 14B; slow on 16 GB M1; treat as dev/experiment | reliable tool-calling; the practical path for real runs |

Both selected through the same `--model provider/model` reference; preflight and config handle
either uniformly.

## Requirements

- [ ] R1: `ca loop --implementer goose --model <provider/model>` generates a script that runs
      epics via `goose run`, in-tree, with PID polling and marker detection.
- [ ] R2: The generated script emits and honors `EPIC_COMPLETE` / `HUMAN_REQUIRED:` /
      `EPIC_FAILED` from Goose output identically to the Claude path.
- [ ] R3: A `compound-cook-it` Goose recipe encodes the plan/work/review/compound workflow and
      requires the completion marker.
- [ ] R4: `ca setup` can install compound's hooks (`SessionStart`, `UserPromptSubmit`,
      `PreToolUse` phase-gate, `PostToolUse` capture), `.goosehints`, and recipes into a Goose
      target.
- [ ] R5: The `PreToolUse` phase-gate hook blocks an out-of-phase edit **including inside a
      subrecipe** (verified, not assumed).
- [ ] R6: Both local Ollama and an API open-weight provider are first-class and selectable via
      one `--model` reference; preflight validates the chosen provider.
- [ ] R7: The existing Claude/Codex/Gemini paths are unchanged (default `--implementer claude`
      is byte-identical to today).
- [ ] R8: A Goose-based review fleet (subrecipes, per-model) can be selected for the loop's
      review phase.

## Acceptance criteria

- [ ] Given `--implementer goose --model deepseek/deepseek-chat`, when one epic runs, then the
      epic is implemented, committed, `bd close`d, and `EPIC_COMPLETE` is detected.
- [ ] Given the same with `--model ollama/qwen2.5-coder:14b`, when one small epic runs, then it
      completes end-to-end (slower, but functionally identical).
- [ ] Given a phase-gate hook installed and a tool call out of phase, when an edit is attempted
      from a subrecipe, then the edit is blocked and the reason is returned to the model.
- [ ] Given a missing/down provider, when preflight runs, then the script fails loudly with
      remediation before entering the loop.
- [ ] Given `--implementer claude` (default), when a loop runs, then output is byte-identical to
      the pre-change generator (regression guard).

## Edge cases

| Scenario | Expected behavior |
|---|---|
| Goose CLI not installed | preflight fails with install instructions |
| Ollama down / model not pulled | preflight fails (local) with `ollama pull` remediation |
| API key env var unset | preflight fails (API) with the missing var named |
| `OLLAMA_CONTEXT_LENGTH` unset/too small | preflight warns and sets 32768, or fails loud |
| Model never emits `EPIC_COMPLETE` | fall back to "epic closed in `bd` + tests pass"; else mark `EPIC_FAILED` after retries |
| Subrecipe bypasses the phase-gate (OpenCode #5894 failure mode) | spike must confirm Goose does NOT have this gap before relying on phase-gating |
| Goose run hangs | watchdog kills the PID on stale-timeout (reuse loop watchdog) |
| `bd` write attempted from inside a worktree | run `bd` only in main tree (ADR-0001 G2) |

## Constraints

- **Technical**: macOS/Linux; Goose v1.35.0+ (PreToolUse denial). Hook path/event convention is
  Open Plugins, not Claude Code - needs a Goose-specific installer codepath.
- **Performance**: local models on 16 GB M1 are the ceiling at ~14B and slow (~4 tok/s); API
  open-weights for throughput.
- **Compatibility**: must not alter the Claude `bg`/`p` paths or the epic/marker protocol.

## Out of scope

- Replacing Claude as the default implementer (Goose is opt-in).
- Worktree isolation / parallel epics for the Goose path (Phase 4; MVP is in-tree, serial).
- Porting compound to OpenHands / Cline / Qwen Code / OpenCode (rejected alternatives).
- Option A (claude-code-router / DeepSeek Anthropic endpoint) - documented as a fallback only.

## Dependencies

- **Upstream**: Goose v1.35.0+; Ollama (local) or an API key (DeepSeek/Qwen/GLM); `bd`/Dolt.
- **Downstream**: the loop generator, `ca setup`, `loop-launcher` skill docs.
- **External**: provider availability and tool-calling quality of the chosen open model.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Local-model tool-calling too weak for agentic epics | High | High | API open-weights for real runs; local for experiments; smaller-scoped epics; recipe `retry` |
| Goose `PreToolUse` does NOT fire inside subrecipes (phase-gate bypass) | Medium | High | Phase-0 spike gates the effort; if it fails, gate per-recipe via tool restriction or fall back to in-loop phase checks |
| Open model never emits the completion marker | Medium | Medium | recipe `response` schema; fallback completion signal (bd state + tests) |
| Hook event/path divergence breaks installer assumptions | Medium | Medium | dedicated Goose install target with an event-name map |
| Goose auto-commit absence loses work | Low | Medium | explicit commit/push in the prompt/recipe |
| subagents/subrecipes API churn (unification on roadmap) | Low | Low | pin subrecipes now; revisit when unified |
| single-sponsor/geopolitical (Alibaba models) | Low | Low | provider-agnostic; swap model ref |

## Test strategy

- **Unit (Go)**: generator emits correct `CA_IMPLEMENTER`/`GOOSE_*` lines; `--implementer claude`
  output is byte-identical to golden (regression); flag validation rejects unknown providers.
- **Integration (bash, dry-run)**: `LOOP_DRY_RUN=1` shows the Goose dispatch path; preflight
  failure modes trigger correctly.
- **End-to-end (manual, Phase 0/1)**: one real epic on DeepSeek API and on Ollama 14B.
- **Property**: marker detection invariant holds across Claude and Goose outputs.

## Phased plan

- **Phase 0 - spikes (gate the whole effort).** Empirically verify on this machine: (a)
  `goose run --recipe` headless completes a trivial task and emits a custom marker; (b) a
  `PreToolUse` hook blocks an edit, **including inside a subrecipe** (the OpenCode #5894 failure
  mode); (c) Ollama + `qwen2.5-coder:14b` does a multi-step tool-calling task; (d) DeepSeek API
  does the same. If (b) fails, rethink phase-gating before proceeding.
- **Phase 1 - loop implementer MVP.** `--implementer goose` on `ca loop`; new seam cases
  (dispatch/poll/collect/stop/cleanup, in-tree); `compound-cook-it` recipe; preflight. Run one
  epic end-to-end on DeepSeek, then Ollama. Goose runs "bare" (no compound hooks yet).
- **Phase 2 - primitives port.** `ca setup` Goose target: hooks (`~/.agents/plugins/compound/`),
  `.goosehints`, recipes. Epics now run with compound memory + phase-gate + lesson capture.
- **Phase 3 - open review fleet.** Reviewers as per-model subrecipes; selectable in the loop's
  review phase. Now a fully-open loop: open-model implementer + open-model reviewers.
- **Phase 4 - isolation + polish.** Generalize worktree harvest for parallel safety; marker
  fallback; `loop-launcher/SKILL.md` examples (`ca loop --implementer goose --model
  deepseek/deepseek-chat`); docs.

## Code touchpoints (starting map)

- `go/internal/cli/commands_scripts.go`: `loopCmdOptions` (+ `implementer`, provider-aware
  `model`), `loopGenerateOptions`, `runLoop` validation, `loopScriptConfig` (emit
  `CA_IMPLEMENTER`/`GOOSE_PROVIDER`/`GOOSE_MODEL`), `agent_dispatch`/`agent_poll`/`agent_collect`
  (new `goose` cases), `build_prompt` (goose recipe path), preflight.
- `go/internal/cli/commands_scripts_polish.go`: mirror for `ca polish` (Phase 2+).
- New: `loopScriptGooseSeam()` (bash for goose cases); recipe assets (`compound-cook-it.yaml`,
  reviewer subrecipes); `ca setup` Goose installer (hooks.json, `.goosehints`).
- Reuse the existing reviewer-dispatch pattern (`commands_scripts_review.go` ~572) for the
  Phase-3 Goose review fleet.

## Open questions for next session

- Phase-gate inside subrecipes: confirm or refute the #5894-style bypass on Goose (Phase 0b).
- Worktree isolation for Goose: in-tree serial (MVP) vs generalized harvest (Phase 4) - decide
  after Phase 1.
- Recipe vs inlined prompt for `compound-cook-it`: prefer recipe, but confirm Goose recipe
  instructions reliably drive open models through all phases.
- Marker reliability fallback: define the exact "epic complete" secondary signal.
- Flag surface: unify `--implementer {claude,goose,codex,gemini}` vs keep `--provider` (CLI
  vendors) separate from `--implementer` (Claude bg/p vs Goose).

## Definition of done

- [ ] All acceptance criteria pass
- [ ] Tests written and passing (generator golden + dry-run + one e2e per model target)
- [ ] `--implementer claude` regression-clean
- [ ] `ca setup` Goose target installs hooks/recipes/.goosehints
- [ ] Phase-gate verified inside subrecipes
- [ ] `loop-launcher/SKILL.md` documents the Goose path with examples
- [ ] No regressions in existing tests
