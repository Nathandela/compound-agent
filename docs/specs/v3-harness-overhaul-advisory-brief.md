# Advisory Fleet Brief — v3.0 Harness Overhaul

**Date**: 2026-03-31
**Advisors**: Claude (Security, Simplicity), Gemini (Scalability), Codex/GPT-5.4 (Delivery)

---

## P0 Concerns (Critical)

None identified. The system is local-only with no network egress, bounding blast radius.

## P1 Concerns (Major)

### Windows Named Pipes IPC — No Authentication
**Source**: Security advisor
Named pipes on Windows are accessible to any local user unless a DACL is set. Unix sockets should also be tightened from 0o755 to 0o700/0o600.
**Action**: Create pipes with restrictive DACL. Add per-session nonce token. Tighten Unix socket permissions.

### Telemetry Logs Leak Sensitive Context
**Source**: Security advisor
The `query` field in retrieval telemetry contains file paths, code snippets, error traces. Logging raw queries creates a secondary sensitive data store.
**Action**: Truncate/hash queries (80 chars or hash+token count). Define `outcome` as enum, not freeform. Set file permissions to 0o600. Add to .gitignore.

### Skill Metadata Routing — Prompt Injection Surface
**Source**: Security advisor
Context-string matching for `when-to-use` could be manipulated by adversarial repo content.
**Action**: Match on `{phase, hook_event}` tuples, not conversation content. Use allowlist patterns.

### Windows is Release-Sized
**Source**: Delivery + Simplicity advisors (consensus)
Windows touches IPC, hooks, CI, packaging, npm, shell escaping. No Windows CI runner exists. One-shot GA is HIGH risk.
**Action**: Stage as v3.0-rc1 → v3.0. Or scope Windows to v3.1 entirely.

### JSONL vs SQLite — Redundant Data Store
**Source**: Simplicity advisor
SQLite is already in the stack. Adding JSONL telemetry means a second data store with its own rotation logic. `ca health` would parse JSONL when SQL is purpose-built for aggregation.
**Action**: Consider using a `telemetry` SQLite table instead of JSONL files.

## P2 Concerns (Minor)

### Skill Metadata May Be Dead Without a Selector
**Source**: Simplicity advisor
`when-to-use` and `scope` fields need a runtime consumer. Without a skill selector, the metadata is advisory-only. Start with `phase` field only.

### Pre-compile Skill Metadata at Setup Time
**Source**: Scalability advisor
Don't parse YAML frontmatter at runtime on every hook invocation. Compile into `skills_index.json` or SQLite during `ca setup`.

### Async Telemetry Appends
**Source**: Scalability advisor
Use fire-and-forget goroutine for telemetry writes. Don't block the hook hot path. Check log size probabilistically, not on every call.

### Embed Daemon Crash Asymmetry on Windows
**Source**: Security advisor
Named pipes vanish on crash (unlike socket files). Lock coordination needs `LockFileEx` instead of `syscall.Flock`. Add crash-recovery scenario to spec.

### Shell Escape Differences on Windows
**Source**: Security advisor
Single-quote escaping differs between cmd.exe and PowerShell. Test `ShellEscape()` with adversarial path characters on Windows.

### Spec Drift — Transformers.js vs ONNX/ORT
**Source**: Delivery advisor
Spec describes Rust daemon as using Transformers.js but repo uses ONNX/ORT. Fix before decomposition.

### `ca explain` → `ca info`
**Source**: Simplicity advisor
Ship lightweight `ca info` (hook count, skill count, version) in v3.0. Defer full "structured data flow overview" to v3.1 when the system is stable.

### Release Train Recommendation
**Source**: Delivery advisor
v3.0-rc1 for Windows + telemetry core → canary → v3.0 GA after smoke tests pass across platforms.

## Strengths (Consensus)

- **FTS5 scales effortlessly** — no concern up to 10K+ lessons (Scalability)
- **Named pipes IPC overhead is negligible** — ~1-2ms connection setup (Scalability)
- **Documentation fixes are zero-risk, high-trust** — all advisors agree (All)
- **Local-only architecture bounds blast radius** — no critical security findings (Security)
- **Backwards-compatible skill fallback (REQ-S3)** is correct safety net (Scalability, Simplicity)

## Alternative Approaches

| Spec Feature | Alternative | Source |
|---|---|---|
| Windows native | WSL2 docs + `ca doctor` check | Simplicity |
| JSONL telemetry | SQLite `telemetry` table | Simplicity |
| Full skill metadata | `phase` field only; defer `when-to-use`, `scope` | Simplicity |
| `ca explain` | `ca info` (lightweight) | Simplicity |
| Log rotation | Eliminated by SQLite; or external logrotate | Simplicity |
| Workflow hints | Print at end of `ca setup` | Simplicity |

## Confidence Summary

| Lens | Confidence | Notes |
|---|---|---|
| Security & Reliability | HIGH | Local-only bounds risk. Named pipe DACL is the key action item. |
| Scalability & Performance | HIGH | FTS5 and named pipes are non-issues. Pre-compile metadata is the key optimization. |
| Organizational & Delivery | MEDIUM | Windows verification gap is the primary concern. RC staging recommended. |
| Simplicity & Alternatives | HIGH | Strong challenge to scope. 2-epic minimal alternative proposed. |
