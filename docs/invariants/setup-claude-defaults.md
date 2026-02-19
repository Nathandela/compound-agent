# Invariants for `setup claude` Default Behavior

## Module: CLI Command `setup claude`

### Purpose
Configure Claude Code to automatically load high-severity lessons by installing all 5 Claude Code hooks (SessionStart, PreCompact, UserPromptSubmit, PostToolUseFailure, PostToolUse).

### Current Behavior (v0.2.0)
- Default: `~/.claude/settings.json` (global - affects ALL projects)
- `--project` flag: `.claude/settings.json` (project-local)

### Target Behavior (v0.2.1)
- Default: `.claude/settings.json` (project-local)
- `--global` flag: `~/.claude/settings.json` (global)

**Breaking Change**: Semantics are swapped. Default behavior changes from global to local.

---

## Data Invariants

### I1: Settings Path Determination
**Invariant**: `getClaudeSettingsPath(global: boolean)` always returns a valid absolute path
- When `global === true`: `${HOME}/.claude/settings.json`
- When `global === false`: `${REPO_ROOT}/.claude/settings.json`
- Never returns relative path
- Never returns undefined/null

**Test Strategy**: Unit test with mocked HOME and REPO_ROOT

### I2: Flag Semantics
**Invariant**: Exactly one of `--global` or default (project-local) applies per invocation
- No `--global` flag provided → project-local (default)
- `--global` flag provided → global install
- Never both project AND global simultaneously
- `--project` flag no longer exists (removed in v0.2.1)

**Test Strategy**: Test default behavior, test with `--global`, verify error on conflicting flags

### I3: Scope Consistency
**Invariant**: All operations (install/uninstall/dry-run) respect the same scope
- Install without `--global` → writes to `.claude/settings.json`
- Uninstall without `--global` → removes from `.claude/settings.json`
- Dry-run without `--global` → reports would affect `.claude/settings.json`
- Install with `--global` → writes to `~/.claude/settings.json`
- Uninstall with `--global` → removes from `~/.claude/settings.json`

**Test Strategy**: Cross-test install/uninstall with and without `--global`

### I4: Display Path Accuracy
**Invariant**: Output messages always show the actual path being modified
- Project install → shows `.claude/settings.json`
- Global install → shows `~/.claude/settings.json`
- Display path matches actual file written
- No misleading output

**Test Strategy**: Parse CLI output, verify path matches actual file location

### I5: Settings File Schema
**Invariant**: Settings JSON structure is preserved
- All 5 hook event arrays (SessionStart, PreCompact, UserPromptSubmit, PostToolUseFailure, PostToolUse) are always arrays
- Our hook entries have exact structure: `{ matcher, hooks: [{ type, command }] }`
- Existing hooks in any event array are never deleted
- Non-hook fields (permissions, mcpServers) are never modified
- JSON is always valid (parseable)

**Test Strategy**: Load existing settings, run setup, verify schema unchanged except for hooks array

---

## Safety Properties (Must NEVER Happen)

### S1: No Cross-Scope Pollution
**Property**: Installing to project-local must NEVER modify global settings
- `setup claude` (no flags) → `~/.claude/settings.json` unchanged
- `setup claude --global` → `.claude/settings.json` unchanged

**Why**: Prevents unintended side effects. User expects scoped changes.

**Test Strategy**:
- Create both global and project settings with different content
- Run `setup claude` (project install)
- Verify global settings unchanged
- Run `setup claude --global`
- Verify project settings unchanged

### S2: No Wrong-Scope Uninstall
**Property**: Uninstalling from wrong scope must not corrupt files
- Hook installed globally, uninstall without `--global` → global hook remains
- Hook installed project-locally, uninstall with `--global` → project hook remains
- No "silent failure" where user thinks hook is removed but it isn't

**Why**: User must explicitly target the correct scope for removal.

**Test Strategy**:
- Install globally
- Run `setup claude --uninstall` (project scope)
- Verify global hook still exists
- Verify helpful message shown (e.g., "No hook found in project scope")

### S3: No Directory Traversal Vulnerabilities
**Property**: Project path must always be within repository root
- `getClaudeSettingsPath(false)` never writes outside repo
- Malicious `REPO_ROOT` cannot escape to parent directories
- Path is always normalized and validated

**Why**: Prevents writing to arbitrary filesystem locations.

**Test Strategy**: Mock `getRepoRoot()` with edge cases (parent refs like `../../../`)

### S4: No Duplicate Hooks
**Property**: Running `setup claude` multiple times (idempotent) never creates duplicate hooks
- First run: adds hook
- Second run: detects existing hook, does NOT add duplicate
- Works for both project and global scopes
- Marker detection is reliable

**Why**: Duplicate hooks waste resources and clutter settings.

**Test Strategy**: Run setup twice, count hooks in SessionStart array

### S5: No Settings Corruption
**Property**: Invalid input or errors must never corrupt settings.json
- Parse error → no changes written
- Partial write → atomic replace (temp file + rename)
- File permissions error → no partial write
- Settings remain valid JSON at all times

**Why**: Settings file is critical for Claude Code. Corruption breaks the editor.

**Test Strategy**:
- Mock write failure scenarios
- Verify settings.json unchanged on error
- Use atomic write pattern (write to .tmp, then rename)

### S6: No Repo Root Confusion
**Property**: Project install must always use the correct repository root
- Running from subdirectory → finds repo root, installs at `.claude/settings.json` relative to root
- Running from repo root → same behavior
- No git repo → fails with clear error (does NOT default to cwd)

**Why**: Settings must be in a predictable, consistent location.

**Test Strategy**:
- Run from subdirectory, verify path is relative to repo root
- Run from non-git directory, verify error message

---

## Liveness Properties (Must EVENTUALLY Happen)

### L1: User-Friendly Migration
**Property**: Users upgrading from v0.2.0 must understand the change
- CHANGELOG documents breaking change
- README shows new default behavior
- Error messages suggest correct flag if wrong scope used

**Timeline**: Documented in release notes (v0.2.1)

**Monitoring**: User reports, GitHub issues

### L2: Clear Error Messages
**Property**: When operations fail, user knows how to fix it
- Missing repo root → "Not in a git repository. Run from project root or use --global."
- Wrong scope on uninstall → "No hook found in [scope]. Did you mean --global?"
- Parse error → "Settings file is invalid JSON. Please fix manually."
- Timeout: Errors appear immediately (< 100ms)

**Test Strategy**: Test error scenarios, validate error message content

### L3: Atomic Operations Complete
**Property**: Install/uninstall operations are atomic
- Either fully succeeds or fully fails
- No partial state (half-written JSON)
- Write completes within 500ms (p95)

**Test Strategy**: Mock slow disk I/O, verify timeout behavior

### L4: Idempotency Check is Fast
**Property**: Detecting existing hooks completes quickly
- Check completes in < 50ms for typical settings files
- No performance regression for large settings files
- Linear time complexity O(n) where n = number of SessionStart hooks

**Test Strategy**: Benchmark with 100+ hooks in SessionStart array

---

## Edge Cases

### E1: Empty Settings File
**Scenario**: `.claude/settings.json` exists but is empty or `{}`
**Expected**: Create `hooks.SessionStart` array, add our hook

### E2: Settings Directory Doesn't Exist
**Scenario**: `.claude/` directory doesn't exist
**Expected**: Create directory recursively, then create settings.json

### E3: Settings File Has Non-Hook Content
**Scenario**: Settings file exists with `permissions`, `mcpServers`, etc.
**Expected**: Preserve all existing fields, only add/modify `hooks.SessionStart`

### E4: Multiple Existing SessionStart Hooks
**Scenario**: Settings file already has 3 other SessionStart hooks
**Expected**: Append our hook as 4th entry, preserve all others

### E5: Running from Subdirectory
**Scenario**: User is in `src/components/` when running `setup claude`
**Expected**: Find repo root, install to `<REPO_ROOT>/.claude/settings.json`

### E6: No Git Repository
**Scenario**: Running in directory without .git
**Expected**: Clear error message: "Not in a git repository. Run from project root or use --global."

### E7: Both Project and Global Hooks Installed
**Scenario**: User has hooks in both `.claude/settings.json` and `~/.claude/settings.json`
**Expected**: Claude Code behavior determines precedence (project overrides global). Document this.

### E8: Uninstall from Wrong Scope
**Scenario**: Hook installed globally, user runs `setup claude --uninstall` (project scope)
**Expected**: Helpful message: "No compound-agent hook found in project settings. Did you mean --global?"

### E9: Concurrent Modifications
**Scenario**: Two processes modify settings.json simultaneously
**Expected**: Atomic write (temp + rename) prevents corruption. Last writer wins.

### E10: Symlinked .claude Directory
**Scenario**: `.claude/` is a symlink to another location
**Expected**: Follow symlink, write to target location. No errors.

---

## Backward Compatibility

### Breaking Changes in v0.2.1

1. **Default behavior reversed**:
   - v0.2.0: `setup claude` → global
   - v0.2.1: `setup claude` → project-local

2. **Flag removed**:
   - v0.2.0: `--project` for local install
   - v0.2.1: `--project` flag removed, use default for local

3. **New flag added**:
   - v0.2.1: `--global` for global install

### Migration Path

Users upgrading from v0.2.0 who installed globally:
```bash
# v0.2.0 behavior (installed globally)
npx ca@0.2.0 setup claude

# v0.2.1 equivalent (now needs explicit --global)
npx ca@0.2.1 setup claude --global
```

Users who want project-local (new default):
```bash
# v0.2.0 required --project flag
npx ca@0.2.0 setup claude --project

# v0.2.1 is now the default
npx ca@0.2.1 setup claude
```

### Deprecation Strategy

- v0.2.0: `--project` is valid (deprecated warning in docs)
- v0.2.1: `--project` removed, error if used: "Flag --project no longer exists. Use default for project install or --global for global."

---

## Test Coverage Requirements

### Unit Tests (100% coverage)
- `getClaudeSettingsPath(false)` returns project path
- `getClaudeSettingsPath(true)` returns global path
- Path is always absolute
- Idempotency check works correctly
- Atomic write pattern (temp + rename)

### Integration Tests
- Default install writes to `.claude/settings.json`
- `--global` writes to `~/.claude/settings.json`
- Uninstall from correct scope removes hook
- Uninstall from wrong scope shows helpful error
- Output displays correct path

### Property-Based Tests
- Settings file remains valid JSON after any operation
- Idempotency: N runs = same result as 1 run (for any N > 0)
- Hook count never decreases unintentionally

### Regression Tests
- v0.2.0 global installs still work with `--global` flag
- Error messages improved from v0.2.0

---

## Acceptance Criteria

ALL of the following must be true for this feature to be complete:

1. `setup claude` (no flags) installs to `.claude/settings.json`
2. `setup claude --global` installs to `~/.claude/settings.json`
3. Output shows correct location (project vs global)
4. Tests cover all edge cases listed above
5. CHANGELOG documents breaking change
6. README updated with new default behavior
7. Error messages guide users when wrong scope used
8. `/implementation-reviewer` returns APPROVED

---

## References

- Original issue: `compound_agent-9bw`
- Related spec: `docs/SPEC.md` (CLI commands section)
- Current implementation: `src/cli.ts` lines 614-805
- Current tests: `src/cli.test.ts` lines 1453-1672
