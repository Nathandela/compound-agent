# Advisory Fleet Brief — Windows Native Support

**Advisors consulted**: Security & Reliability (Claude Sonnet), Scalability & Performance (Gemini), Organizational & Delivery (Codex), Simplicity & Alternatives (Claude Opus)
**Advisors unavailable**: None — all 4 lenses produced valid feedback.

## P0 Concerns

1. **Command injection via openURL on Windows** (Security)
   - `cmd /c start "" url` passes URL through cmd.exe which interprets metacharacters (`&`, `|`, `^`, `%`). If the URL contains attacker-controlled input, arbitrary command execution is possible.
   - **Action**: Use `exec.Command("cmd", "/c", "start", "", url)` (Go argument splitting) AND validate URL begins with `https://` or `http://` before passing to shell.

2. **Binary integrity in postinstall** (Security)
   - **NOTE: Already implemented.** The postinstall script (`scripts/postinstall.cjs`) already verifies SHA-256 checksums against `checksums.txt` before renaming binaries. This P0 is a false positive — the advisor didn't see the implementation. No action needed.

3. **4 epics is over-decomposed** (Simplicity)
   - The actual change surface is ~15 files. Epic 4 (Graceful Degradation) is a YAGNI epic — the codebase already has the fallback path. Separating SQLite swap from platform code creates a phantom dependency (can't verify on Windows until Epic 2).
   - **Action**: Consider collapsing to 2 epics: "Go changes" (driver + platform code) and "Build pipeline" (CI, npm, GoReleaser).

4. **Epic 1 is too large a bottleneck** (Organizational)
   - Mixes runtime dependency swap, DSN semantics, test/build tag removal, CI changes, and CGO_ENABLED=0. If this slips, everything stalls.
   - **Action**: Related to concern #3 — restructuring the epics addresses this.

## P1 Concerns

1. **Lock orphaning on Windows process crash** (Security)
   - Crash between schema write and lock release leaves partially-written file. Use write-then-rename pattern.

2. **os.Rename recovery path undefined** (Security)
   - W1 says "prevent" but doesn't define recovery. Specify: write to temp path, rename on success, leave old file intact on failure, log actionable error.

3. **Degraded search mode not surfaced to users** (Security)
   - Windows keyword-only mode should emit a one-time notice, not be completely silent. Distinguish "no crash" from "no information."

4. **modernc.org/sqlite performance overhead** (Scalability)
   - Transpiled C-to-Go typically shows 2-4x slowdown. Combined with no vector search on Windows, FTS5 carries full search load.
   - **Action**: Benchmark before/after. Consider build tags to retain mattn on macOS/Linux if regression is unacceptable.

5. **Epic 4 is a catch-all** (Organizational)
   - Accumulates leftover work, unclear acceptance criteria. Move UX checks into the epic that introduces the behavior.

6. **SQLite swap doesn't need to be separate from platform code** (Simplicity)
   - Can't verify driver swap works on Windows until platform code lands. Merging enables testing from day one.

7. **Integration Verification as separate epic is unnecessary** (Simplicity)
   - Add `windows-latest` to CI matrix early so every PR runs on Windows. No separate verification epic needed.

## P2 Concerns

1. **WAL/journal mode PRAGMA divergence** (Security) — Explicitly set identical PRAGMAs regardless of driver.
2. **Git Bash detection on Windows** (Security) — `ca setup` should verify Git Bash before writing hooks.
3. **FTS5 index integrity after driver swap** (Security) — Run integrity-check on first open with new driver.
4. **Windows mandatory file locking contention** (Scalability) — Configure `busy_timeout`, tune `SetMaxOpenConns`.
5. **Cognitive load near upper bound** (Organizational) — Add sub-checklists, separate runtime from test portability.
6. **os.Rename risk overstated** (Simplicity) — Fix easy case (close before rename), don't build retry machinery preemptively.
7. **PE metadata and Authenticode are distractions** (Simplicity) — Remove O1/O2 from spec.

## Strengths (Consensus)

All 4 advisors agreed on:
- **Non-goals are well-defined**: Excluding Rust daemon from Windows, rejecting WSL2 proxy, skipping PowerShell installer.
- **CGO_ENABLED=0 is the right foundation**: Eliminates C compiler from trust chain, enables trivial cross-compilation.
- **EARS requirements are crisp and testable**.
- **Risk register is honest** — real risks identified without inflation.
- **Graceful degradation boundary** (embed daemon → FTS5 fallback) is sound architecture.

## Alternative Approaches

- **2-epic structure** (Simplicity advisor, HIGH confidence): Collapse to "Go changes" + "Build pipeline". The platform code and driver swap are coupled (can't test one without the other on Windows), and Epic 4 is already partially implemented in the codebase.
- **Build-tag conditional driver** (Scalability advisor): Keep mattn on macOS/Linux for performance, use modernc only on Windows. Adds complexity but preserves performance.
- **Spike-first approach** (Organizational advisor): Before full execution, prove one Windows test run and one packaged binary install as early integration checkpoints.

## Confidence Summary

| Advisor | Confidence | Justification |
|---------|-----------|---------------|
| Security & Reliability | MEDIUM | Two genuine P0s identified (command injection is real; binary integrity is false positive). Incomplete failure mode specification. |
| Scalability & Performance | MEDIUM | modernc performance risk underestimated. FTS5 carries full load on Windows. Needs benchmarking. |
| Organizational & Delivery | HIGH | Spec is concrete and evaluable. Main risk is Epic 1 as bottleneck and Epic 4 as catch-all. |
| Simplicity & Alternatives | HIGH | Over-decomposed for the change surface. 2 epics achieves same outcome with less overhead. |
