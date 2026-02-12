# Invariants for `init` Includes `setup claude`

## Module: CLI Command `init`

### Purpose
Initialize compound-agent in a repository with a single command that sets up:
- Lessons directory structure (.claude/lessons/)
- AGENTS.md integration documentation
- Git pre-commit hooks
- Claude Code SessionStart hooks (NEW in this feature)

### Change Summary
**Before**: `init` only set up AGENTS.md and git hooks. Claude hooks required separate `setup claude` command.

**After**: `init` includes Claude hooks setup by default. Add `--skip-claude` flag to opt out.

---

## Data Invariants

### I1: Claude Hooks Default Behavior
**Invariant**: `init` command installs Claude hooks to project-local settings by default
- Default scope: `.claude/settings.json` (project-local, matching `setup claude` default)
- Same behavior as `setup claude` (no `--global` flag)
- Never installs to global unless explicitly requested
- Consistent with v0.2.1 `setup claude` defaults

**Rationale**: Project-local is safer default. Users expect repo-scoped init.

**Test Strategy**: Run `init`, verify `.claude/settings.json` exists and contains hook

### I2: Flag Semantics
**Invariant**: `--skip-claude` flag controls Claude hooks installation
- No `--skip-claude` flag → Claude hooks installed (default)
- `--skip-claude` present → Claude hooks NOT installed
- Flag name matches existing `--skip-agents` and `--skip-hooks` pattern
- Cannot be combined with `--global` for Claude (no such option exists yet)

**Rationale**: Consistent naming pattern. Clear opt-out semantics.

**Test Strategy**: Test both with and without flag, verify settings file state

### I3: Independence of Skip Flags
**Invariant**: `--skip-agents`, `--skip-hooks`, and `--skip-claude` are independent
- Possible to skip any subset: `--skip-agents`, `--skip-hooks`, `--skip-claude`
- Possible to skip all three: `--skip-agents --skip-hooks --skip-claude`
- Each flag only affects its own component
- No implicit dependencies (e.g., skipping hooks doesn't skip Claude)

**Test Strategy**: Test all 8 combinations (2^3 flag states)

### I4: Output Structure
**Invariant**: `init` output includes Claude hooks status
- Human output: Prints "Claude Code hooks: [installed | skipped | already installed | error]"
- JSON output: Includes `claudeHooks: boolean` field
- Matches existing output pattern for `agentsMd` and `hooks`
- Status line appears regardless of success/failure

**Test Strategy**: Parse CLI output, verify status line present in all scenarios

### I5: JSON Output Schema
**Invariant**: `--json` output has stable schema
```typescript
{
  initialized: boolean,
  lessonsDir: string,
  agentsMd: boolean,     // existing
  hooks: boolean,        // existing
  claudeHooks: boolean   // NEW
}
```
- `claudeHooks` is always present (even if false)
- Type is always boolean
- Order is stable (doesn't change between runs)

**Test Strategy**: JSON schema validation, property-based test

### I6: Idempotency Across All Components
**Invariant**: Running `init` multiple times is safe
- Second run detects existing Claude hooks → does NOT add duplicate
- Leverages existing `hasClaudeHook()` detection from `setup claude`
- Returns `claudeHooks: false` on subsequent runs (already installed)
- Applies to all three components: AGENTS.md, git hooks, Claude hooks

**Test Strategy**: Run `init` twice, count hooks in settings file

### I7: Coupling with `setup claude`
**Invariant**: `init` delegates Claude hooks logic to existing functions
- Uses `getClaudeSettingsPath(false)` for project-local path
- Uses `readClaudeSettings()` to load existing settings
- Uses `hasClaudeHook()` to detect existing hooks
- Uses `addCompoundAgentHook()` to insert hook
- Uses `writeClaudeSettings()` for atomic write
- NO code duplication from `setup claude` command

**Rationale**: Single source of truth. Changes to Claude hooks logic apply to both commands.

**Test Strategy**: Code review, verify function reuse

---

## Safety Properties (Must NEVER Happen)

### S1: No Duplicate Claude Hooks
**Property**: `init` must never create duplicate Claude hooks
- First `init` → adds hook
- Second `init` → detects existing hook, does NOT add duplicate
- Even if git hooks or AGENTS.md are missing, Claude hooks remain singular
- Detection works for hooks added by both `init` and `setup claude`

**Why**: Duplicate hooks waste resources, clutter settings, and cause redundant CLI calls.

**Test Strategy**:
- Run `init` twice, parse `.claude/settings.json`, count hooks with marker
- Run `setup claude` then `init`, verify single hook
- Run `init` then `setup claude`, verify single hook

### S2: No Partial Initialization on Error
**Property**: If Claude hooks installation fails, other components still complete
- AGENTS.md creation succeeds independently
- Git hooks installation succeeds independently
- Claude hooks error is logged but doesn't halt entire `init`
- Exit code is 0 if at least one component succeeds
- User gets clear error message about what failed

**Why**: One component's failure shouldn't prevent repository setup.

**Test Strategy**:
- Mock `writeClaudeSettings()` to throw error
- Verify AGENTS.md and git hooks still created
- Verify error message mentions Claude hooks failure
- Verify `claudeHooks: false` in JSON output

### S3: No Settings Corruption
**Property**: Invalid Claude settings or write errors must not corrupt settings.json
- Parse error in existing settings → log error, skip Claude hooks, continue
- Write error → atomic write (temp + rename) prevents partial writes
- Settings file remains valid JSON at all times
- Existing hooks are never deleted or modified

**Why**: Settings file is critical for Claude Code. Corruption breaks the editor.

**Test Strategy**:
- Create malformed `.claude/settings.json` (invalid JSON)
- Run `init`, verify file unchanged
- Verify error message shown
- Verify other components (AGENTS.md, git hooks) still succeed

### S4: No Cross-Scope Pollution
**Property**: `init` must NEVER modify global Claude settings
- `init` → `.claude/settings.json` (project-local) only
- `~/.claude/settings.json` unchanged
- No implicit `--global` behavior
- Consistent with `setup claude` default (v0.2.1)

**Why**: `init` is repository-scoped. Users expect no global side effects.

**Test Strategy**:
- Create `~/.claude/settings.json` with different content
- Run `init`
- Verify global settings unchanged byte-for-byte

### S5: No Silent Failures
**Property**: Claude hooks errors must be visible to user
- If hooks fail to install, output shows "Claude Code hooks: error"
- JSON output includes `claudeHooks: false`
- Error message explains what went wrong
- Not hidden behind `--quiet` flag (errors always shown)

**Why**: User must know if setup is incomplete.

**Test Strategy**: Mock various failure modes, verify error output

### S6: No Flag Conflicts
**Property**: Invalid flag combinations must be rejected
- Currently no conflicting flags (future-proofing)
- If `--global` added later, must conflict with `--skip-claude`
- Clear error message for conflicting flags

**Why**: Prevent ambiguous commands.

**Test Strategy**: Test reserved combinations, verify error messages

---

## Liveness Properties (Must EVENTUALLY Happen)

### L1: Initialization Completes Quickly
**Property**: `init` command completes within reasonable time
- p50: < 500ms (fast path, all components already exist)
- p95: < 2s (slow path, creating all components)
- No network calls (all operations are local)
- Disk I/O is the bottleneck

**Timeline**: Measured on typical developer hardware (SSD)

**Monitoring**: Add timing instrumentation in tests

### L2: Error Messages Guide User
**Property**: When Claude hooks fail, user knows how to fix it
- Parse error → "Claude settings file is invalid JSON at .claude/settings.json. Fix manually or delete and re-run."
- Write error → "Failed to write Claude settings. Check .claude/ directory permissions."
- Not a git repo → No error (Claude hooks installation succeeds independently)
- Timeout: < 100ms to show error

**Test Strategy**: Test error scenarios, validate message content

### L3: Idempotency Check is Fast
**Property**: Detecting existing Claude hooks completes quickly
- Check completes in < 50ms for typical settings files
- Linear time complexity O(n) where n = number of SessionStart hooks
- Same performance as `setup claude` idempotency check

**Test Strategy**: Benchmark with 100+ hooks in SessionStart array

### L4: Atomic Operations Complete
**Property**: Claude hooks installation is atomic
- Either fully succeeds or fully fails
- No partial state (half-written JSON)
- Write completes within 500ms (p95)
- Uses same atomic write pattern as `setup claude` (temp + rename)

**Test Strategy**: Mock slow disk I/O, verify timeout behavior

### L5: Output is Human-Readable
**Property**: User understands what `init` did
- Each component status printed on separate line
- Clear indicators: checkmark, skip, already exists, error
- Not overwhelming (concise summary)
- Available within 100ms of command completion

**Example**:
```
[ok] Learning agent initialized
  Lessons directory: .claude/lessons
  AGENTS.md: Updated with Compound Agent section
  Git hooks: pre-commit hook installed
  Claude Code hooks: Installed to .claude/settings.json
```

**Test Strategy**: Human review of output, user testing

---

## Edge Cases

### E1: Empty Claude Settings File
**Scenario**: `.claude/settings.json` exists but is `{}` or `{"permissions":{}}`
**Expected**: Add `hooks.SessionStart` array, add our hook, preserve other fields

### E2: Claude Settings Directory Doesn't Exist
**Scenario**: `.claude/` directory doesn't exist
**Expected**: Create directory recursively, create settings.json with our hook

### E3: Claude Settings Has Non-Hook Content
**Scenario**: Settings file has `permissions`, `mcpServers`, etc.
**Expected**: Preserve all existing fields, only add/modify `hooks.SessionStart`

### E4: Multiple Existing Claude SessionStart Hooks
**Scenario**: Settings file already has 3 other SessionStart hooks
**Expected**: Append our hook as 4th entry, preserve all others

### E5: Claude Hook Already Installed via `setup claude`
**Scenario**: User previously ran `setup claude`, now runs `init`
**Expected**: Detect existing hook, output "Claude Code hooks: Already installed", set `claudeHooks: false`

### E6: Only Claude Hooks Fail
**Scenario**: AGENTS.md and git hooks succeed, Claude hooks fail (permissions error)
**Expected**: Output shows success for AGENTS.md/git, error for Claude. Exit code 0.

### E7: All Components Already Exist
**Scenario**: User runs `init` in already-initialized repo
**Expected**: All three components show "already exists", `claudeHooks: false`, exit code 0

### E8: Git Hooks Skipped, Claude Hooks Not Skipped
**Scenario**: `init --skip-hooks` (skips git hooks but NOT Claude hooks)
**Expected**: Claude hooks installed, git hooks skipped

### E9: Both Git and Claude Hooks Skipped
**Scenario**: `init --skip-hooks --skip-claude`
**Expected**: Only AGENTS.md and lessons directory created

### E10: JSON Output Mode
**Scenario**: `init --json`
**Expected**: Valid JSON output with all 5 fields, no human-readable text mixed in

### E11: Malformed Claude Settings JSON
**Scenario**: `.claude/settings.json` exists but contains syntax error
**Expected**: Log error, set `claudeHooks: false`, continue with other components. Do NOT attempt to fix or overwrite.

### E12: Symlinked .claude Directory
**Scenario**: `.claude/` is a symlink to another location
**Expected**: Follow symlink, write to target location. No errors.

---

## Integration with Existing Components

### Relationship to `setup claude`
**Invariant**: `init` is equivalent to running these commands:
```bash
# These three commands:
npx ca init --skip-claude
npx ca setup claude

# Are equivalent to:
npx ca init
```

**Verification**: Integration test comparing state after both sequences

### Relationship to `--skip-hooks`
**Clarification**: `--skip-hooks` refers to GIT hooks, NOT Claude hooks
- `--skip-hooks` → skips git pre-commit hook
- `--skip-claude` → skips Claude Code SessionStart hook
- These are independent flags

**Rationale**: Different hook types, different purposes, different skip flags

### Relationship to `--skip-agents`
**Clarification**: `--skip-agents` skips AGENTS.md, NOT Claude hooks
- Possible to skip AGENTS.md but install Claude hooks
- Claude hooks work without AGENTS.md (though less documented)

---

## Backward Compatibility

### Non-Breaking Change
This feature is additive and backward-compatible:
- Existing `init` command behavior: AGENTS.md + git hooks → still works
- New behavior: AGENTS.md + git hooks + Claude hooks → enhanced
- Users who want old behavior: Use `--skip-claude` flag
- No existing flags modified or removed

### Migration Path
Users upgrading from previous versions:
```bash
# Old workflow (two commands)
npx ca@0.2.0 init
npx ca@0.2.0 setup claude

# New workflow (single command)
npx ca@0.2.1 init

# Opt-out if desired
npx ca@0.2.1 init --skip-claude
```

### Documentation Updates Required
- README: Update `init` command description
- CHANGELOG: Document new default behavior
- AGENTS.md template: Mention `init` sets up hooks automatically

---

## Test Coverage Requirements

### Unit Tests
- [ ] init creates Claude hooks by default
- [ ] init --skip-claude skips Claude hooks
- [ ] init uses project-local scope (not global)
- [ ] init reuses functions from setup claude (no duplication)
- [ ] init output includes Claude hooks status line
- [ ] init JSON output includes claudeHooks field with correct type

### Integration Tests
- [ ] Single 'init' command sets up all three components
- [ ] init is idempotent (running twice doesn't duplicate hooks)
- [ ] init after 'setup claude' doesn't duplicate hooks
- [ ] 'setup claude' after init doesn't duplicate hooks
- [ ] Claude hooks failure doesn't prevent other components
- [ ] Malformed settings.json handled gracefully

### Edge Case Tests
- [ ] Empty settings file → hook added
- [ ] Settings file with other hooks → all preserved
- [ ] Settings file with malformed JSON → error, file unchanged
- [ ] --skip-hooks but not --skip-claude → only Claude hooks installed
- [ ] All three skip flags → only lessons directory created
- [ ] Symlinked .claude directory → follows symlink

### Property-Based Tests
- [ ] Settings file remains valid JSON after any operation
- [ ] Idempotency: N runs = same result as 1 run (for all components)
- [ ] Hook count in SessionStart array never decreases unintentionally
- [ ] Flags are independent: all 8 combinations (2^3) work correctly

---

## Acceptance Criteria

ALL of the following must be true for this feature to be complete:

1. [ ] `init` (no flags) installs Claude hooks to `.claude/settings.json`
2. [ ] `init --skip-claude` skips Claude hooks installation
3. [ ] Output shows Claude hooks status line (human-readable)
4. [ ] JSON output includes `claudeHooks: boolean` field
5. [ ] Running `init` twice doesn't create duplicate hooks
6. [ ] Malformed settings.json handled gracefully (error, no corruption)
7. [ ] All unit tests pass (100% coverage of new code)
8. [ ] All integration tests pass
9. [ ] All edge case tests pass
10. [ ] Property-based tests pass (idempotency, flag independence)
11. [ ] README updated with new `init` behavior
12. [ ] CHANGELOG documents new feature
13. [ ] `/implementation-reviewer` returns APPROVED

---

## References

- Feature issue: `compound_agent-gql`
- Related epic: `compound_agent-egt` (Release v0.2.1)
- Related invariants: `docs/invariants/setup-claude-defaults.md`
- Current init implementation: `src/cli.ts` lines 598-651
- Setup claude implementation: `src/cli.ts` lines 687-887
- Current tests: `src/cli.test.ts`

---

## Implementation Notes

### Code Reuse Strategy
To maintain DRY principle and ensure consistency:

1. Extract Claude hooks logic into shared functions (already exists):
   - `getClaudeSettingsPath(global: boolean)`
   - `readClaudeSettings(settingsPath: string)`
   - `hasClaudeHook(settings: Record<string, unknown>)`
   - `addCompoundAgentHook(settings: Record<string, unknown>)`
   - `writeClaudeSettings(settingsPath: string, settings: Record<string, unknown>)`

2. `init` command calls these functions with `global: false` (project-local)

3. No duplication of JSON parsing, hook detection, or atomic write logic

### Error Handling Strategy
Claude hooks installation should be resilient:

```typescript
let claudeHooksInstalled = false;
if (!options.skipClaude) {
  try {
    claudeHooksInstalled = await installClaudeHooks(repoRoot);
  } catch (err) {
    // Log error but continue
    if (!options.json) {
      out.error(`Failed to install Claude Code hooks: ${err.message}`);
    }
    // claudeHooksInstalled remains false
  }
}
```

Exit code is 0 if any component succeeds. Only exit code 1 if all components fail.

### Output Consistency
Match existing output format:

**Human-readable**:
```
[ok] Learning agent initialized
  Lessons directory: .claude/lessons
  AGENTS.md: Updated with Compound Agent section
  Git hooks: pre-commit hook installed
  Claude Code hooks: Installed to .claude/settings.json
```

**JSON**:
```json
{
  "initialized": true,
  "lessonsDir": ".claude/lessons",
  "agentsMd": true,
  "hooks": true,
  "claudeHooks": true
}
```

### Future Extensions
If `--global` flag is added to `init` command later:
- `init --global` → sets up global Claude hooks
- `init --global --skip-claude` → contradiction, should error
- This is future work, not in current scope
