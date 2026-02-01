# Invariants for Pre-Commit Hook Insertion

## Module: installPreCommitHook (src/cli.ts)

### Problem Statement

When appending the Learning Agent hook to an existing git pre-commit hook, the code must be inserted BEFORE any exit statements that would terminate execution. Currently, the code blindly appends to the end of the file, causing the Learning Agent hook to be unreachable if the existing hook contains exit statements.

### Edge Cases Identified (from issue learning_agent-cfe)

1. Exit inside function definition (don't insert there)
2. Exit in heredoc/string (don't insert there)
3. Exit with variable: `exit $status`
4. Conditional exit: `if [ cond ]; then exit 1; fi`
5. Multiple exit statements at different levels
6. Early return pattern: `exit 0` at top-level (most common case)

---

## Data Invariants

### DI-1: Hook File Structure
- **Field**: Pre-commit hook file
- **Type**: Shell script (text file with shebang)
- **Constraints**:
  - Must start with shebang (`#!/bin/sh` or `#!/bin/bash`)
  - Must be executable (mode 0o755)
  - Must be valid UTF-8 text
- **Rationale**: Git requires hooks to be executable shell scripts

### DI-2: Learning Agent Hook Block
- **Field**: `LEARNING_AGENT_HOOK_BLOCK` constant
- **Type**: String containing shell script fragment
- **Constraints**:
  - Must include unique marker comment: `# Learning Agent pre-commit hook`
  - Must be valid shell syntax when appended to any valid shell script
  - Must not introduce syntax errors (balanced quotes, proper line endings)
- **Rationale**: Used for idempotency check and safe insertion

### DI-3: Insertion Position
- **Field**: Position in file where hook block is inserted
- **Type**: Line number (positive integer)
- **Constraints**:
  - Must be AFTER the shebang line
  - Must be BEFORE the first top-level exit statement (if any)
  - Must preserve all existing hook functionality
- **Rationale**: Hook must execute before script exits

### DI-4: Hook Content Preservation
- **Field**: Original hook content
- **Type**: String
- **Constraints**:
  - Original content must remain byte-for-byte identical
  - Only addition is Learning Agent block + preceding newline
  - Line order preserved (insertion, not replacement)
- **Rationale**: Non-destructive modification ensures existing hooks continue to work

### DI-5: Top-Level Exit Detection
- **Field**: Exit statement classification
- **Type**: Boolean (is top-level or not)
- **Constraints**:
  - Top-level exit = exit not inside function, heredoc, string, or subshell
  - Must distinguish `exit 0` at end of script vs `exit` in error handler
- **Rationale**: Only top-level exits terminate the script

---

## Safety Properties (Must NEVER Happen)

### S1: Unreachable Hook Code
**Property**: The Learning Agent hook code must NEVER be inserted after a top-level exit statement that would prevent it from executing.

**Why this matters**: If the hook is unreachable, users won't see lesson capture reminders, defeating the entire purpose of the hook.

**Test strategy**:
- Property-based test: Generate random shell scripts with exit statements at various positions
- Verify inserted hook is always reachable (appears before first top-level exit)
- Test cases:
  ```bash
  # Case 1: Exit at end (common pattern)
  #!/bin/sh
  pnpm test
  exit 0  # <-- Insert BEFORE this

  # Case 2: Early exit on error
  #!/bin/sh
  if [ $? -ne 0 ]; then exit 1; fi  # <-- Don't insert before this (conditional)
  pnpm test
  exit 0  # <-- Insert BEFORE this

  # Case 3: Exit in function (NOT top-level)
  #!/bin/sh
  check_format() {
    if ! pnpm format:check; then
      exit 1  # <-- Don't insert before this (inside function)
    fi
  }
  check_format
  exit 0  # <-- Insert BEFORE this
  ```

### S2: Syntax Corruption
**Property**: The modified hook file must NEVER have syntax errors introduced by the insertion.

**Why this matters**: A syntactically invalid hook will fail, breaking the git workflow and potentially blocking commits.

**Test strategy**:
- After insertion, run `sh -n <hook-file>` to validate syntax
- Test with existing hooks containing:
  - Heredocs (multi-line strings)
  - Quoted strings with special characters
  - Complex conditional logic
  - Subshells and command substitutions

### S3: Content Loss
**Property**: No part of the original hook content must EVER be deleted, modified, or reordered.

**Why this matters**: Destructive modification would break existing workflows.

**Test strategy**:
- Hash original content segments
- After insertion, verify all original segments present and in same order
- Test with:
  - Multi-line scripts
  - Scripts with trailing whitespace
  - Scripts with no trailing newline
  - Empty hooks

### S4: Duplicate Insertion
**Property**: Running the installation twice must NEVER result in duplicate Learning Agent blocks.

**Why this matters**: Duplicate blocks would cause redundant prompts and slower hook execution.

**Test strategy**:
- Run installation twice on same hook
- Verify marker appears exactly once
- Count occurrences of `npx learning-agent hooks run pre-commit`

### S5: Permission Loss
**Property**: The hook file must NEVER lose executable permissions after modification.

**Why this matters**: Non-executable hooks won't run, breaking the workflow.

**Test strategy**:
- Create hook with 0o755 permissions
- Run installation
- Verify permissions remain 0o755

---

## Liveness Properties (Must EVENTUALLY Happen)

### L1: Insertion Completes
**Property**: The installation process must EVENTUALLY complete and write the file.

**Timeline**: < 100ms for typical hook files (< 1000 lines)

**Monitoring strategy**:
- Track installation duration in tests
- Fail if exceeds 500ms (p99 threshold)

### L2: Atomic Write
**Property**: File writes must EVENTUALLY complete atomically (all-or-nothing).

**Timeline**: Immediate (single write operation)

**Monitoring strategy**:
- Use temp file + rename pattern for atomicity
- Test by killing process during write (file should be unchanged or fully updated)

### L3: Clear Error Messages
**Property**: When installation fails, user must EVENTUALLY receive actionable error message.

**Timeline**: Immediate (on failure)

**Error scenarios**:
- Hook file not writable (permissions)
- Invalid git repository structure
- Corrupted hook file (non-UTF8)

**Monitoring strategy**:
- Test error cases and verify message quality
- Message must include: what failed, why, how to fix

### L4: Idempotency Detection
**Property**: Re-running installation must EVENTUALLY detect existing installation and skip.

**Timeline**: < 50ms (simple string search)

**Monitoring strategy**:
- Verify second run returns `false` (already installed)
- Verify second run doesn't modify file

---

## Edge Cases

### EC1: Exit in Function Definition
**Scenario**: Hook contains function with exit statement
```bash
#!/bin/sh
my_function() {
  exit 1  # Inside function - NOT a termination point
}
pnpm test
exit 0  # This IS the termination point
```
**Expected behavior**: Insert BEFORE final `exit 0`, not before function's `exit 1`

### EC2: Exit in Heredoc
**Scenario**: Hook contains heredoc with word "exit"
```bash
#!/bin/sh
cat <<'EOF'
  exit 0
EOF
pnpm test
exit 0  # This IS the termination point
```
**Expected behavior**: Ignore "exit" inside heredoc, insert BEFORE final `exit 0`

### EC3: Exit in Quoted String
**Scenario**: Hook contains string literal with "exit"
```bash
#!/bin/sh
echo "To exit, run: exit 0"
pnpm test
exit 0  # This IS the termination point
```
**Expected behavior**: Ignore "exit" in string, insert BEFORE final `exit 0`

### EC4: Conditional Exit (Error Handling)
**Scenario**: Hook has conditional exits for error handling
```bash
#!/bin/sh
pnpm lint || exit 1
pnpm test || exit 1
exit 0  # Success case
```
**Expected behavior**: Insert BEFORE final `exit 0` (success termination)

### EC5: Exit with Variable
**Scenario**: Hook uses variable for exit code
```bash
#!/bin/sh
STATUS=0
pnpm test || STATUS=1
exit $STATUS
```
**Expected behavior**: Insert BEFORE `exit $STATUS`

### EC6: Multiple Top-Level Exits
**Scenario**: Hook has multiple unconditional exits (unusual but valid)
```bash
#!/bin/sh
pnpm lint
if [ $? -eq 0 ]; then
  exit 0  # First top-level exit
fi
exit 1  # Second top-level exit
```
**Expected behavior**: Insert BEFORE FIRST top-level exit

### EC7: No Exit Statement
**Scenario**: Hook has no explicit exit (relies on implicit exit)
```bash
#!/bin/sh
pnpm test
# Implicit exit 0 (or exit code of last command)
```
**Expected behavior**: Append to end (current behavior is correct for this case)

### EC8: Exit in Subshell
**Scenario**: Exit inside subshell/command substitution
```bash
#!/bin/sh
RESULT=$(if test -f config; then exit 0; fi)
pnpm test
exit 0
```
**Expected behavior**: Ignore exit in subshell, insert BEFORE final `exit 0`

### EC9: Shebang Variations
**Scenario**: Different shebang formats
```bash
#!/usr/bin/env bash
# or
#!/bin/bash
# or
#!/bin/sh -e
```
**Expected behavior**: Detect shebang line regardless of variant, insert AFTER it

### EC10: Hook with Only Exit
**Scenario**: Minimal hook that just exits
```bash
#!/bin/sh
exit 0
```
**Expected behavior**: Insert BEFORE `exit 0` (between shebang and exit)

---

## Implementation Strategy

### Recommended Approach: Simple Heuristic

Given the complexity of parsing shell scripts correctly (requires full shell parser), recommend a **pragmatic heuristic approach**:

1. **Find the shebang line** (line 1, starts with `#!`)
2. **Find the last top-level exit** using simple regex:
   - Pattern: `^\s*exit\s+(\d+|\$\w+)\s*$` (start of line, exit, code, end of line)
   - Search from end of file backwards
   - Stop at first match (last exit statement)
3. **Insert BEFORE that line** if found, otherwise append to end

**Trade-off**:
- ✅ Handles 90% of cases (simple hooks with final `exit 0`)
- ✅ Simple to implement and test
- ✅ Fails safe (appends if uncertain)
- ❌ May incorrectly handle edge cases (exit in heredoc, etc.)

**Future Enhancement**: Full shell parser if needed (using `shellcheck` or similar)

### Invariant Validation

Every test must verify:
1. **Syntax validity**: `sh -n <file>` passes
2. **Reachability**: Learning Agent line appears before first `exit` (line number check)
3. **Idempotency**: Second run doesn't modify file
4. **Preservation**: Original lines unchanged (diff check)
5. **Executability**: File has 0o755 permissions

---

## Test Requirements

### Property-Based Tests (using fast-check)

```typescript
// Generate random shell scripts with exit statements
fc.property(
  fc.array(shellCommandGen),  // Random shell commands
  fc.boolean(),                // Has final exit?
  fc.nat(10),                  // Number of function definitions
  (commands, hasFinalExit, numFunctions) => {
    const hook = generateHook(commands, hasFinalExit, numFunctions);
    const modified = installPreCommitHook(hook);

    // Invariant checks
    assert(isSyntacticallyValid(modified));
    assert(learningAgentHookIsReachable(modified));
    assert(preservesOriginalContent(hook, modified));
    assert(hasExactlyOneMarker(modified));
  }
);
```

### Unit Tests (Edge Cases)

One test per edge case (EC1-EC10) listed above.

### Integration Tests

1. Create real git repo with various hook configurations
2. Run `npx learning-agent init`
3. Manually trigger pre-commit hook
4. Verify Learning Agent prompt appears

---

## Acceptance Criteria

Implementation is COMPLETE when:

- [ ] All 10 edge cases (EC1-EC10) have passing tests
- [ ] Property-based tests pass with 1000+ random inputs
- [ ] All 5 safety properties (S1-S5) verified in tests
- [ ] All 4 liveness properties (L1-L4) verified in tests
- [ ] No regressions in existing hook installation tests
- [ ] Documentation updated with insertion algorithm

---

## References

- **Issue**: learning_agent-cfe
- **Current Implementation**: `src/cli.ts:470-502` (installPreCommitHook)
- **Test File**: `src/cli.test.ts:1674-1944` (init command tests)
