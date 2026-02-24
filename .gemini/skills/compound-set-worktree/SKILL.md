---
name: compound-set-worktree
description: Configure an isolated git worktree for parallel epic execution
---

---
name: Set Worktree
description: Configure an isolated git worktree for parallel epic execution
---

# Set Worktree Skill

## Overview
Set up a git worktree to isolate epic work from the main branch. This creates a separate working directory, installs dependencies, and creates a Merge beads task that orchestrates the merge lifecycle.

## Methodology
1. Validate the epic exists: run `bd show <epic-id>` to confirm the epic is open
2. Search memory with `npx ca search "worktree"` for past worktree lessons
3. Run the worktree creation command: `npx ca worktree create <epic-id>`
4. Verify output: confirm worktree path, branch name, and Merge task ID are reported
5. Note the Merge task ID -- it will surface via `bd ready` after all work tasks complete
6. Confirm the worktree is ready: check that `.claude/` directory exists in the worktree
7. Inform the user: the worktree is set up, they can now run `/compound:lfg` to start work

## What Happens Under the Hood
- A git worktree is created at `../<repo>-wt-<epic-id>` on branch `epic/<epic-id>`
- Dependencies are installed via `pnpm install --frozen-lockfile`
- Lessons JSONL is copied (not symlinked) to the worktree
- A Merge beads task is created with the epic as its dependent
- When all work completes, the Merge task surfaces via `bd ready`

## Memory Integration
- Run `npx ca search "worktree"` before creating to check for known issues
- Run `npx ca learn` if you discover worktree-specific knowledge

## Common Pitfalls
- Creating a worktree for an epic that already has one (the command checks for this)
- Forgetting to run `/compound:lfg` after setup (the worktree alone does nothing)
- Not noting the Merge task ID (needed for later reference)
- Running from inside an existing worktree (must run from main repo)

## Quality Criteria
- Worktree was created successfully (path exists)
- `pnpm install` completed without errors
- Merge beads task exists and is linked to the epic
- User was informed of next steps (`/compound:lfg`)

