# Invariants for remind-capture Command

## Module Overview

**Purpose**: Lightweight PreCommit hook reminder that prompts Claude to capture lessons before committing.

**Location**: `src/commands/setup/remind-capture.ts`

**Inputs**:
- Repository root path (from environment or cwd)
- Git repository state (via `git diff --cached`)

**Outputs**:
- Short reminder message (< 200 tokens)
- Exit code 0 (always, non-blocking)

**State Managed**: None (stateless, read-only)

---

## Data Invariants

### Repository Detection
- `repoRoot`: string, absolute path
  - Constraint: Must be valid filesystem path
  - Rationale: Required to check for `.git` directory

### Git State
- `.git` directory existence: boolean
  - Constraint: Either exists or doesn't exist
  - Rationale: Determines if repository is valid

### Staged Changes
- `stagedFiles`: string[], list of file paths
  - Constraint: Empty array OR array of non-empty strings
  - Rationale: Result of `git diff --cached --name-only`
  - Edge case: Empty when no files staged

### Output Length
- `outputTokens`: number
  - Constraint: < 200 tokens (approximately < 800 characters)
  - Rationale: Must be brief to avoid context pollution
  - Measurement: Count via template string length

---

## Safety Properties (Must NEVER Happen)

### 1. Never Block Commits
**Property**: Exit code is ALWAYS 0, regardless of internal errors

**Why**: This is a reminder, not a gate. Blocking commits violates the design spec and would frustrate users.

**Test Strategy**:
- Property-based test: For any repository state (git repo, not git repo, staged, unstaged, error states), exit code is 0
- Integration test: Run command in various error states (missing .git, git command fails, etc.) and verify exit 0

**Implementation Constraint**:
```typescript
// MUST wrap all logic in try-catch
try {
  // Detection logic
} catch (error) {
  // Silent failure or minimal log
}
process.exit(0); // ALWAYS exit 0
```

### 2. Never Modify Repository State
**Property**: Command is read-only (no writes to filesystem or git state)

**Why**: Hook is observational only. State mutation would violate user expectations and could corrupt repositories.

**Test Strategy**:
- Filesystem snapshot test: Capture filesystem state before/after, verify identical
- Git snapshot test: Capture `git status --porcelain` before/after, verify identical

**Implementation Constraint**:
- No `fs.writeFile`, `fs.appendFile`, `fs.mkdir`, etc.
- No `git add`, `git commit`, `git reset`, etc.
- Only read operations: `fs.existsSync`, `git diff`, `git rev-parse`

### 3. Never Produce Unbounded Output
**Property**: Output length < 800 characters (conservative token estimate)

**Why**: Prevents context pollution in PreCommit hook output stream.

**Test Strategy**:
- Unit test: Assert template length < 800 chars
- Property test: For all valid input combinations, output.length < 800

**Implementation Constraint**:
```typescript
const OUTPUT_MAX_CHARS = 800;
if (message.length > OUTPUT_MAX_CHARS) {
  throw new Error('Output too long'); // Fail during tests
}
```

### 4. Never Hard-Fail on Git Errors
**Property**: Missing git binary, corrupted git repo, or git command errors NEVER throw unhandled exceptions

**Why**: Hook should gracefully degrade in broken environments.

**Test Strategy**:
- Mock `execSync` to throw errors, verify silent exit 0
- Test in directory without git binary (PATH manipulation), verify exit 0
- Test in corrupted git repo (.git is file not directory), verify exit 0

**Implementation Constraint**:
- Wrap all git commands in try-catch
- Return early on errors, always exit 0

---

## Liveness Properties (Must EVENTUALLY Happen)

### 1. Staged Changes Detection Completes Quickly
**Property**: `git diff --cached --name-only` completes in < 100ms for typical repositories (< 10K files)

**Timeline**: p95 < 100ms, p99 < 500ms

**Why**: PreCommit hooks run synchronously and delay commits. Slow hooks frustrate developers.

**Monitoring Strategy**:
- Performance test: Measure execution time for repos with 0, 10, 100, 1000, 10000 staged files
- Warn if p95 > 100ms in test suite

**Implementation Note**:
- `git diff --cached` is typically fast (< 50ms for normal repos)
- If timeout needed, use 1000ms as absolute max

### 2. Output Appears Immediately
**Property**: Message is written to stdout within 100ms of invocation

**Timeline**: Synchronous output, no buffering delays

**Why**: User expects instant feedback in PreCommit hook context.

**Monitoring Strategy**:
- Integration test: Spawn process, measure time to first stdout line
- Assert: time < 100ms

**Implementation Constraint**:
- Use `console.log` (unbuffered for most terminals)
- Avoid async operations before output

### 3. Command Terminates Reliably
**Property**: Process terminates within 500ms under all conditions (success, error, timeout)

**Timeline**: Absolute max 500ms

**Why**: Hanging PreCommit hooks block git operations and require Ctrl+C.

**Monitoring Strategy**:
- Integration test: Spawn process with 1000ms timeout, verify it exits before timeout
- Test error paths (missing git, corrupted repo) to ensure they terminate

**Implementation Constraint**:
- Set explicit timeout on git commands (e.g., 200ms)
- Use `process.exit(0)` to ensure termination, not implicit exit

---

## Edge Cases

### Empty Repository (No Staged Changes)
**Scenario**: `git diff --cached` returns empty string

**Expected Behavior**:
- Silent exit 0 (no output)
- Rationale: No commit in progress, reminder not relevant

**Test**:
```typescript
test('silent exit when no staged changes', () => {
  // Mock: git diff --cached returns ""
  const output = captureStdout(() => remindCapture(repoRoot));
  expect(output).toBe('');
  expect(process.exitCode).toBe(0);
});
```

### Not a Git Repository
**Scenario**: `.git` directory does not exist

**Expected Behavior**:
- Silent exit 0 (no output)
- Rationale: Hook may run in non-git environments, should not error

**Test**:
```typescript
test('silent exit when not a git repo', () => {
  const nonGitDir = '/tmp/not-a-repo';
  const output = captureStdout(() => remindCapture(nonGitDir));
  expect(output).toBe('');
  expect(process.exitCode).toBe(0);
});
```

### Git Command Fails
**Scenario**: `git diff --cached` throws (missing git binary, corrupted repo)

**Expected Behavior**:
- Silent exit 0 (no output)
- Rationale: Graceful degradation, never block commits

**Test**:
```typescript
test('silent exit when git command fails', () => {
  // Mock: execSync throws Error
  vi.mocked(execSync).mockImplementation(() => {
    throw new Error('git not found');
  });
  const output = captureStdout(() => remindCapture(repoRoot));
  expect(output).toBe('');
  expect(process.exitCode).toBe(0);
});
```

### Staged Changes Present
**Scenario**: `git diff --cached` returns non-empty list (e.g., "src/foo.ts\nsrc/bar.ts")

**Expected Behavior**:
- Output reminder template (< 800 chars)
- Exit 0

**Test**:
```typescript
test('output reminder when staged changes present', () => {
  // Mock: git diff --cached returns "src/foo.ts\n"
  const output = captureStdout(() => remindCapture(repoRoot));
  expect(output).toContain('Lesson Capture Reminder');
  expect(output).toContain('ca learn');
  expect(output.length).toBeLessThan(800);
  expect(process.exitCode).toBe(0);
});
```

### Large Changesets (> 100 Staged Files)
**Scenario**: `git diff --cached` returns 1000 file paths

**Expected Behavior**:
- Same reminder template (file count irrelevant)
- Completes in < 500ms
- Exit 0

**Test**:
```typescript
test('performance with large changesets', () => {
  // Mock: git diff returns 1000 files
  const files = Array(1000).fill('src/file.ts').join('\n');
  const start = Date.now();
  remindCapture(repoRoot);
  const duration = Date.now() - start;
  expect(duration).toBeLessThan(500);
});
```

### Concurrent Git Operations
**Scenario**: Another git command is running (e.g., `git status` in IDE)

**Expected Behavior**:
- `git diff --cached` succeeds (read-only, no lock contention)
- If lock error occurs, silent exit 0

**Test**:
- Manual test: Run `git diff --cached` while `git rebase -i` is active
- Expectation: Either succeeds or fails gracefully

### Binary Files Staged
**Scenario**: Staged files include large binaries (images, PDFs)

**Expected Behavior**:
- `git diff --cached --name-only` lists filenames only (no diff content)
- No performance impact (< 100ms)

**Test**:
```typescript
test('handles binary files in staged changes', () => {
  // Mock: git diff returns binary file paths
  const files = 'image.png\ndata.pdf';
  const output = captureStdout(() => remindCapture(repoRoot));
  expect(output).toContain('Lesson Capture Reminder');
});
```

---

## Integration with Existing System

### Relationship to `hooks run pre-commit`
- `remind-capture` will likely be invoked BY `hooks run pre-commit`
- Current `PRE_COMMIT_MESSAGE` is static, could be replaced by dynamic `remind-capture` output
- Must maintain same contract: non-blocking, exit 0

### Template Consistency
- Output format must align with `PRE_COMMIT_MESSAGE` style
- Keep markdown formatting compatible with terminal display

### Git Hooks Directory
- Command assumes it runs in repository root (where `.git` exists)
- Must respect `core.hooksPath` if set (already handled by hooks installer)

---

## Verification Checklist

Before marking this module complete, ALL must pass:

### Tests
- [ ] Unit test: Silent exit when no staged changes
- [ ] Unit test: Silent exit when not a git repo
- [ ] Unit test: Silent exit when git command fails
- [ ] Unit test: Output reminder when staged changes present
- [ ] Unit test: Output length < 800 characters
- [ ] Property test: Exit code is always 0
- [ ] Property test: No filesystem modifications
- [ ] Integration test: Completes in < 500ms
- [ ] Integration test: Works with large changesets (1000 files)

### Code Quality
- [ ] No write operations (fs or git)
- [ ] All git commands wrapped in try-catch
- [ ] Explicit `process.exit(0)` at end
- [ ] Template string length validated (< 800 chars)
- [ ] TypeScript strict mode enabled, no `any` types

### Documentation
- [ ] JSDoc on public function
- [ ] Inline comments explaining error handling strategy
- [ ] README section documenting command behavior

### Professional Standards
- [ ] Command registered in `src/commands/setup/index.ts`
- [ ] Test file `src/commands/setup/remind-capture.test.ts` exists
- [ ] Follows existing command patterns (see `hooks.ts`)
- [ ] No hardcoded paths or magic strings

---

## Open Design Questions

### Should output be JSON-compatible?
**Question**: Should `--json` flag be supported for machine-readable output?

**Current Decision**: Not required by spec, but could add for consistency with other commands.

**Recommendation**: Start without `--json`, add if requested.

### Should reminder be customizable?
**Question**: Should users be able to customize the reminder template?

**Current Decision**: No, keep simple. Template is fixed.

**Recommendation**: Wait for user feedback before adding complexity.

### Should reminder check for existing lessons?
**Question**: Should command query SQLite to see if lessons were already captured this session?

**Current Decision**: No, too complex. Keep stateless.

**Recommendation**: Reminder is cheap, duplication is fine.

---

## Related Modules

| Module | Relationship |
|--------|--------------|
| `src/commands/setup/hooks.ts` | Parent module that installs PreCommit hook |
| `src/commands/setup/templates.ts` | Contains `PRE_COMMIT_MESSAGE` (may be replaced by this command) |
| `src/cli-utils.ts` | Provides `getRepoRoot()` utility |
| `src/commands/shared.ts` | Provides `out` utility for consistent CLI output |

---

## Success Metrics

### Context Efficiency
- Output < 200 tokens (conservative: < 800 chars)
- No buffering or delays

### User Experience
- Zero commit blocking incidents
- Zero reports of slow PreCommit hooks

### Reliability
- Works in 100% of git repositories (including corrupted, empty, or unusual configs)
- Zero unhandled exceptions in production
