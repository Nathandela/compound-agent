# ADR 0001 — Background-session backend seam for loop/polish/review

- **Status:** accepted
- **Date:** 2026-05-17
- **Epic:** learning_agent-3bkj
- **Deciders:** Nathan; cook-it spec-dev (G1–G4 empirical spikes); Opus+Sonnet independent reviews

## Context

Anthropic's 2026-06-15 billing split meters `claude -p` / Agent SDK
(separate, capped credit pool at full API rates) while interactive Claude Code
— **including `claude --bg` background sessions** — stays on the subscription
pool (empirically confirmed + Anthropic email + docs). Compound Agent's
infinity loop, polish loop, and review loop spawn dozens–hundreds of
`claude -p` turns per run; post-split that is economically untenable.

## Decision

Introduce a single **3-operation backend seam** in the generated bash
(`agent_dispatch` / `agent_poll` / `agent_collect` + `agent_stop` /
`agent_cleanup`) and route every Claude invocation through it. Two backends:

- **`bg`** (new default): `claude --bg --dangerously-skip-permissions`,
  completion detected from `~/.claude/jobs/<id>/state.json`
  (`.state` ∈ {done,completed,failed,stopped,error,cancel} ∧ `.inFlight.tasks==0`).
- **`p`** (legacy, opt-in via `--backend p` / env): byte-identical to today.

The loop framework (epic queue, retry, `EPIC_COMPLETE`/`HUMAN_REQUIRED:`/
`EPIC_FAILED` protocol, screen orchestrator, polish 3-cycle, review N-cycle)
is unchanged. gemini/codex reviewers are unaffected and stay as-is.

## Empirical basis (spec-dev spikes G1–G4, 2026-05-17)

- **G1 PASS (corrected):** `claude --bg` ignores `--session-id` but
  `claude --bg --resume <sessionId>` **retains the conversation**. Review
  multi-cycle pattern: cycle 1 plain `claude --bg`, read `.sessionId` from
  `state.json`, cycle 2+ `claude --bg --resume <sessionId>`. → R-REVIEW uses
  session-resume (no stateless fallback needed).
- **G2 FAIL:** `bd` from inside a git worktree cannot reach the Dolt server
  (keyed to the main repo path). → all beads operations run in the **main
  tree, post-harvest**; never `bd` inside the bg worktree.
- **G3 END-ONLY:** the `.linkScanPath` transcript is written only at terminal
  state, not streamed. → stale-liveness watchdog uses `state.json`
  mtime/`.inFlight` heartbeat, not transcript byte-growth.
- **G4 PASS:** `claude stop` halts a session in ~1 s with no further writes.
  → `stop` is a viable watchdog kill (ladder: `stop` → `rm` → scoped sweep).
- Prior spikes: `--bg` auto-isolates into `.claude/worktrees/<n>/` on branch
  `worktree-<n>` (outer branch untouched); `.output.result` carries the
  verbatim marker; `claude rm` destroys the worktree; one-time per-machine
  human bypass-disclaimer accept is required (not scriptable).

## Consequences

- Loop/polish/review Claude turns move to the subscription pool (de-metered).
- **One accepted framework deviation:** a worktree-harvest step inside
  `agent_collect` (merge `worktree-<n>` into the working branch, reconcile
  beads in the main tree, then `claude rm`) — forced by `--bg` git isolation.
- New mandatory operator prerequisite: one-time bypass-disclaimer accept;
  `ca` preflight must fail loudly if absent.
- The improve loop is removed entirely (separate, unrelated to billing;
  reduces generator surface).
- Durability hedge: `--backend p` remains fully supported — Anthropic has
  reserved the right to change the `--bg` classification.

## Alternatives rejected

- Keep `-p`, accept metered cost — untenable on Pro/Max.
- Shannon-style keystroke injection into an interactive TUI — ToS-adjacent,
  fragile; `--bg` is first-party and supported.
- Stateless-bg review (re-inject prior findings) — unnecessary given G1 PASS.
