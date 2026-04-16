# Advisory Fleet

> Loaded on demand. Read when referenced by SKILL.md (Gate 2, post-Spec).

## Table of Contents

1. [Overview](#overview)
2. [Advisor Roles](#advisor-roles)
3. [Execution Protocol](#execution-protocol)
4. [Prompt Template](#prompt-template)
5. [Synthesis Format](#synthesis-format)
6. [Graceful Degradation](#graceful-degradation)

---

## Overview

The advisory fleet solicits independent architectural perspectives from external model CLIs before presenting a spec to the human at Gate 2. Each advisor evaluates the spec through a different lens, producing structured feedback that gets synthesized into a brief.

Advisors are **non-blocking** -- they inform the human's decision at the gate but cannot veto it. The fleet runs once (no multi-cycle iteration like the review fleet).

**Why external models**: Different model families have different training biases and blind spots. A Gemini advisor might catch scaling concerns that Claude overlooked. A Codex advisor might flag implementation complexity from a different angle. Model diversity produces richer advisory signal than same-model subagents with different prompts.

**Execution model**: The advisory fleet runs within an interactive Claude Code session using native tool parallelism. Each advisor is a background Bash call (`run_in_background: true`) — Claude gets notified when each finishes, then reads the reports and synthesizes.

## Advisor Roles

Four evaluation lenses, each assigned to a different model when available:

| # | Lens | Focus | Default CLI | Model Flag |
|---|------|-------|-------------|------------|
| 1 | **Security & Reliability** | Attack surfaces, failure modes, data integrity, recovery, trust boundaries | claude | `--model claude-sonnet-4-6` |
| 2 | **Scalability & Performance** | Bottlenecks, growth patterns, resource consumption, data volume, latency | gemini | (none needed) |
| 3 | **Organizational & Delivery** | Team boundaries, delivery risk, coordination cost, cognitive load, deployment order | codex | (none needed) |
| 4 | **Simplicity & Alternatives** | Over-engineering, simpler alternatives, premature abstraction, YAGNI violations | claude | `--model claude-opus-4-7` |

### Lens-Specific Questions

**Security & Reliability**:
- Where are the trust boundaries? Are they correctly placed?
- What happens when components fail? Is there a recovery path?
- Are there data integrity risks at epic boundaries?
- Do the interface contracts handle authentication/authorization?
- Are there implicit security assumptions that should be explicit?

**Scalability & Performance**:
- Which interfaces will become bottlenecks at 10x/100x scale?
- Are there shared resources that create contention?
- Do the epic boundaries align with scaling boundaries?
- Are there synchronous calls that should be async?
- What's the data growth pattern and does the decomposition account for it?

**Organizational & Delivery**:
- Can each epic be owned by a single team?
- What's the coordination cost between epics?
- Are there epics that will block all others?
- Does the dependency graph create a critical path that's too long?
- Is the cognitive load per epic within budget (7+/-2 concepts)?

**Simplicity & Alternatives** (devil's advocate):
- Could this be solved with fewer epics? Which boundaries are premature?
- Are there simpler architectural patterns that satisfy the same EARS requirements?
- Is the decomposition driven by real domain boundaries or anticipated-but-uncertain needs?
- Which interface contracts add complexity without clear benefit?
- What's the simplest version that could work, and how does it differ from this proposal?

### Assignment Fallback

When fewer than 4 CLIs are available, assign multiple lenses to the same CLI:

| Available CLIs | Assignment |
|---------------|------------|
| claude + gemini + codex | claude: Security + Simplicity, gemini: Scalability, codex: Organizational |
| claude + gemini | claude: Security + Simplicity, gemini: Scalability + Organizational |
| claude + codex | claude: Security + Simplicity + Scalability, codex: Organizational |
| gemini + codex | gemini: Security + Scalability, codex: Organizational + Simplicity |
| claude only | claude: all 4 lenses in a single prompt |
| gemini only | gemini: all 4 lenses in a single prompt |
| codex only | codex: all 4 lenses in a single prompt |

When a single CLI handles multiple lenses, combine them into one call with clearly labeled sections in the prompt (e.g., "## Lens 1: Security & Reliability ... ## Lens 2: Simplicity & Alternatives ..."). See the [combined-lens prompt variant](#combined-lens-variant) below.

## Execution Protocol

The advisory fleet uses Claude Code's native tool parallelism — no script file needed. Each advisor is a **background Bash call** (`run_in_background: true`). Claude gets notified as each completes, then reads the reports and synthesizes.

### Step 1: Detect available CLIs

Run a single Bash call to check which CLIs are installed and healthy:

```bash
for cli in claude gemini codex; do
  if command -v "$cli" >/dev/null 2>&1 && "$cli" --version >/dev/null 2>&1; then
    echo "$cli: available"
  else
    echo "$cli: unavailable"
  fi
done
```

If none are available, skip the advisory phase entirely.

### Step 2: Write prompt files

Use the Write tool to create one prompt file per advisor lens in `/tmp/advisory/`. Each file contains the prompt template (see [Prompt Template](#prompt-template)) with the spec content appended. Write all prompt files in parallel (multiple Write tool calls in one message).

For the fallback case where one CLI handles multiple lenses, write a single combined-lens prompt file instead (see [Combined-Lens Variant](#combined-lens-variant)).

### Step 3: Spawn advisors in parallel

Launch all advisor CLIs simultaneously using **parallel Bash tool calls with `run_in_background: true`**. Send all calls in a single message so they start at the same time.

**Claude** (sonnet or opus):
```bash
claude --model claude-sonnet-4-6 \
  --dangerously-skip-permissions \
  --output-format text \
  -p "$(cat /tmp/advisory/security-prompt.md)" \
  > /tmp/advisory/security-report.md 2>&1
```

**Gemini**:
```bash
gemini --yolo \
  -p "$(cat /tmp/advisory/scalability-prompt.md)" \
  > /tmp/advisory/scalability-report.md 2>/tmp/advisory/scalability-stderr.log
```

**Codex** (prompt via stdin, clean output via -o):
```bash
codex exec --full-auto \
  -o /tmp/advisory/organizational-report.md \
  -- - < /tmp/advisory/organizational-prompt.md 2>/dev/null
```

Each runs in background. Claude is notified as each completes — no polling or sleeping needed.

### Step 4: Read reports and synthesize

As advisors finish, read each `*-report.md` via the Read tool. Check for:
- **Empty file**: advisor crashed or timed out
- **API errors** (first 20 lines contain `rate limit`, `API_KEY`, `unauthorized`): infrastructure issue, not advisory feedback
- **Valid feedback**: everything else

Once all reports are collected, synthesize into a brief (see [Synthesis Format](#synthesis-format)).

### Step 5: Persist

Write the synthesized brief to `docs/specs/<name>-advisory-brief.md` alongside the spec. This makes the advisory signal durable for future reference.

### Key CLI Patterns

These are the same patterns validated by the review fleet (see `review-fleet.md`):

| CLI | Flags | Why |
|-----|-------|-----|
| claude | `--dangerously-skip-permissions --output-format text` | Without skip-permissions, Claude pauses for confirmations with no human. `text` mode for parseable output. Note: `2>&1` merges stderr into the report — first line may contain a harmless "no stdin data" warning; ignore it during synthesis. |
| gemini | `--yolo` | Autonomous execution (Gemini's skip-permissions equivalent). |
| codex | `exec --full-auto -o <file> -- - < <prompt>` | `-p` is `--profile` not prompt. Positional arg or stdin for prompt. `-o` for clean output (stdout has UI chrome). |

### Timeout

The Bash tool has a configurable timeout (up to 600,000ms / 10 minutes). Set the timeout on each background Bash call to 600,000ms. If an advisor exceeds this, the Bash call terminates and Claude is notified of the timeout — no hung processes.

### Combined-Lens Variant

When a single CLI handles multiple lenses (see the [Assignment Fallback](#assignment-fallback) table), write a single combined prompt file:

```markdown
You are an architectural advisor reviewing a system specification.
You will evaluate it through MULTIPLE lenses. Provide separate, clearly labeled analysis for each.

## Lens 1: Security & Reliability
Focus on: Attack surfaces, failure modes, data integrity, recovery, trust boundaries

## Lens 2: Simplicity & Alternatives
Focus on: Over-engineering signals, simpler alternatives, premature abstraction, YAGNI violations

## Output Format
For EACH lens, provide:
### [Lens Name] — Concerns
- **[P0/P1/P2]** ...
### [Lens Name] — Strengths
### [Lens Name] — Confidence
HIGH / MEDIUM / LOW with justification

---

## Specification
{spec content}
```

## Prompt Template

The per-lens prompt template has these design properties:

- **Structured output format**: Explicit P0/P1/P2 severity, with Detail/Risk/Suggestion per concern. This enables mechanical aggregation during synthesis.
- **Confidence signal**: Each advisor states HIGH/MEDIUM/LOW confidence. Low confidence from the Simplicity advisor (devil's advocate) is actually a positive signal -- it means the spec is hard to argue against.
- **Spec-only context**: Advisors see only the spec content, not project files. This is intentional -- they evaluate the architecture on its merits without being anchored by implementation details. If the spec references external files, include the relevant excerpts inline.

**Context window note**: If the spec exceeds ~4,000 tokens (large EARS table + multiple Mermaid diagrams + full scenario table), consider trimming the scenario table from the advisor prompts to stay within Gemini and Codex input limits. The EARS requirements and architecture diagrams carry the most signal for architectural review.

## Synthesis Format

After reading all advisor reports, synthesize them into a single brief. This synthesis happens in the Claude Code conversation (not in the script).

### Brief Structure

```markdown
## Advisory Fleet Brief

**Advisors consulted**: {list of lenses that produced valid feedback}
**Advisors unavailable**: {list of lenses that failed, timed out, or were unassigned}

### P0 Concerns (if any)
{Aggregated P0 concerns across all advisors, deduplicated, with source attribution}

### P1 Concerns
{Aggregated P1 concerns, deduplicated}

### P2 Concerns
{Aggregated P2 concerns, deduplicated}

### Strengths (consensus)
{Points where multiple advisors agreed the spec is strong}

### Alternative Approaches
{Any alternatives suggested by advisors, with source attribution}

### Confidence Summary
| Advisor | Confidence | Justification |
|---------|-----------|---------------|
| Security & Reliability | HIGH/MEDIUM/LOW | ... |
| Scalability & Performance | HIGH/MEDIUM/LOW | ... |
| Organizational & Delivery | HIGH/MEDIUM/LOW | ... |
| Simplicity & Alternatives | HIGH/MEDIUM/LOW | ... |
```

### Deduplication

When multiple advisors flag overlapping concerns:
- **Merge only when** the same component AND the same risk are named. A Security advisor's "no auth on endpoint X" and a Scalability advisor's "endpoint X has no rate limiting" are related but distinct -- list them separately with a "(related to: ...)" note.
- When genuinely the same concern: merge into one entry, note which advisors flagged it (consensus = stronger signal), use the highest severity.
- When in doubt, keep them separate. Over-merging loses nuance; slight redundancy is acceptable.

### Persistence

Write the synthesized brief to `docs/specs/<name>-advisory-brief.md` alongside the spec. This makes the advisory signal durable -- if someone later asks why an architectural decision was made, the brief provides the multi-perspective rationale that informed Gate 2.

### Presentation at Gate 2

Include the brief in the `AskUserQuestion` at Gate 2. The Gate 2 question MUST include the advisory brief so the human sees both the spec and the external perspectives in the same view.

Options to offer:
- **Approve as-is**: Proceed to Phase 3 with the spec unchanged
- **Address concerns**: Revise the spec based on advisory feedback, then re-present Gate 2
- **Re-run advisors**: Revise the spec, then re-run the fleet from the top of this protocol with a fresh temp directory. The new brief replaces the previous one.

## Graceful Degradation

The advisory fleet adds value but is not required. Handle all failure modes gracefully:

| Scenario | Behavior |
|----------|----------|
| No CLIs available | Skip advisory phase, proceed to Gate 2 with note: "Advisory fleet skipped: no external CLIs available" |
| Some CLIs unavailable | Run with available CLIs, note gaps in brief |
| All advisors time out | Log warning, proceed to Gate 2 without advisory brief |
| All advisors return errors | Log errors, proceed to Gate 2 without advisory brief |
| Only 1 advisor succeeds | Present that single perspective, note limited coverage |

The human always has final authority at Gate 2 regardless of advisory feedback.
