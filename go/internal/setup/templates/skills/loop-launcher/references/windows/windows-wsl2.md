# Windows: WSL2 + tmux Setup

> Reference for running infinity loops and polish loops on Windows via WSL2.
> All commands in this file are run from a WSL2 terminal unless marked `[PowerShell]`.

## Prerequisites

1. **WSL2 with a Linux distro** (Ubuntu recommended):
   ```powershell
   # [PowerShell] Install WSL2 + Ubuntu
   wsl --install -d Ubuntu
   ```

2. **tmux** inside WSL2:
   ```bash
   sudo apt update && sudo apt install -y tmux screen
   ```

3. **Claude Code CLI** installed inside WSL2:
   ```bash
   curl -fsSL https://claude.ai/install.sh | bash
   ```

   Verify and authenticate:
   ```bash
   claude --version    # Verify installation
   claude              # First run triggers interactive login
   # Or set API key: export ANTHROPIC_API_KEY="sk-ant-..."
   ```

4. **Other tools** inside WSL2:
   ```bash
   # Node.js (for npx, bd)
   curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
   sudo apt install -y nodejs
   # jq (optional, python3 fallback works)
   sudo apt install -y jq
   # beads (bd) -- required for epic tracking
   npm install -g beads
   # compound-agent
   npm install -g compound-agent
   ```

5. **Git** configured inside WSL2 (not Git for Windows):
   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "you@example.com"
   ```
   **SSH keys**: Generate a new key inside WSL2 (`ssh-keygen`) or copy your Windows keys:
   ```bash
   cp /mnt/c/Users/<you>/.ssh/id_* ~/.ssh/ && chmod 600 ~/.ssh/id_*
   ```
   For HTTPS, configure the Git credential helper to share with Windows:
   ```bash
   git config --global credential.helper "/mnt/c/Program Files/Git/bin/git-credential-manager.exe"
   ```

## Filesystem Layout

**Critical**: Keep the repository inside the WSL2 filesystem, NOT under `/mnt/c/`.

```
# Good -- native Linux filesystem, full speed
~/projects/my-app/

# Bad -- crosses 9P protocol boundary, 3-10x slower for trace log writes
/mnt/c/Users/You/projects/my-app/
```

Access from Windows Explorer: `\\wsl$\Ubuntu\home\<user>\projects\my-app\`

VS Code: use the "WSL" remote extension to open the repo directly inside WSL2.

## Launching

### Single Infinity Loop

```bash
# Generate the script (inside WSL2)
ca loop --epics "E1,E2,E3" --reviewers "claude-sonnet,gemini" --force

# Dry-run
LOOP_DRY_RUN=1 bash .compound-agent/infinity-loop.sh

# Launch in a detached tmux session
LOOP_SESSION="compound-loop-$(basename "$PWD")"
tmux new-session -d -s "$LOOP_SESSION" 'bash .compound-agent/infinity-loop.sh'
mkdir -p .beads && echo "$LOOP_SESSION" > .beads/loop-session-name
```

### Chained Pipeline (Infinity + Polish)

```bash
cat > pipeline.sh << 'SCRIPT'
#!/bin/bash
set -e
trap 'echo "[pipeline] FAILED at line $LINENO" >&2' ERR
cd "$(dirname "$0")"
bash .compound-agent/infinity-loop.sh
bash .compound-agent/polish-loop.sh
SCRIPT

LOOP_SESSION="compound-loop-$(basename "$PWD")"
tmux new-session -d -s "$LOOP_SESSION" 'bash pipeline.sh'
mkdir -p .beads && echo "$LOOP_SESSION" > .beads/loop-session-name
```

### Launching from PowerShell (without entering WSL2 first)

```powershell
# [PowerShell] Launch directly from Windows
wsl -d Ubuntu -- bash -c 'cd ~/projects/my-app && tmux new-session -d -s compound-loop "bash .compound-agent/infinity-loop.sh"'
```

Note: this shortcut does not save the session name to `.beads/loop-session-name`. To enable the monitoring commands below, run from WSL2:
```bash
echo "compound-loop" > .beads/loop-session-name
```

## Session Management

tmux provides the same attach/detach semantics as GNU screen.

| Action | Command |
|--------|---------|
| Attach to running loop | `tmux attach -t compound-loop` |
| Detach (from inside) | `Ctrl-B D` |
| List sessions | `tmux ls` |
| Kill the loop | `tmux kill-session -t compound-loop` |
| Attach from PowerShell | `wsl -d Ubuntu -- tmux attach -t compound-loop` |
| Check alive from PowerShell | `wsl -d Ubuntu -- tmux has-session -t compound-loop 2>$null; echo $LASTEXITCODE` |

## Monitoring

All monitoring commands from the main SKILL.md work identically inside WSL2:

```bash
ca watch                                          # Live trace tail
cat .compound-agent/agent_logs/.loop-status.json                  # Current status
cat .compound-agent/agent_logs/loop-execution.jsonl               # Completed epics
tmux attach -t "$(cat .beads/loop-session-name)"  # Attach to session
```

### Monitoring from PowerShell (without entering WSL2)

```powershell
# [PowerShell] Quick status check
wsl -d Ubuntu -- bash -c 'cd ~/projects/my-app && cat .compound-agent/agent_logs/.loop-status.json'

# [PowerShell] Check if session is alive
wsl -d Ubuntu -- tmux has-session -t compound-loop 2>$null
```

### Stall Detection

Same as Unix. The only difference is `stat` syntax -- WSL2 uses the Linux variant:

```bash
# File modification time (seconds since epoch)
stat -c '%Y' .compound-agent/agent_logs/.loop-status.json
```

## Polish Loop

The polish loop works identically inside WSL2. Generate and run as documented in the main SKILL.md:

```bash
ca polish --spec-file "docs/specs/my-spec.md" \
  --meta-epic "meta-epic-id" \
  --reviewers "claude-sonnet,claude-opus,gemini,codex" \
  --cycles 2 --force

# Dry-run
POLISH_DRY_RUN=1 bash .compound-agent/polish-loop.sh

# Launch (after infinity loop, or as part of pipeline.sh above)
tmux new-session -d -s polish-loop 'bash .compound-agent/polish-loop.sh'
```

Reviewer CLIs (`gemini`, `codex`) must also be installed inside WSL2 for the polish audit fleet to work.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| tmux session dies on terminal close | WSL2 background tasks not enabled | Update Windows to 22H2+; enable systemd in `/etc/wsl.conf` |
| Slow trace file writes | Repo on `/mnt/c/` | Move repo inside WSL2 filesystem (`~/projects/`) |
| `claude` not found | Installed on Windows, not WSL2 | Install Claude Code inside WSL2 separately |
| `screen` not found | Not installed | `sudo apt install screen` (or use tmux) |
| `ca` resolves to stale npm binary | Global npm install outdated | Use `go/dist/ca` or `npm install compound-agent@latest` inside WSL2 |
| tmux: `no server running` | No active sessions | Session finished or crashed; check `.compound-agent/agent_logs/.loop-status.json` |

## WSL2 Configuration Tips

Enable systemd for persistent background tasks (in `/etc/wsl.conf`):

```ini
[boot]
systemd=true
```

Then restart WSL2:
```powershell
# [PowerShell]
wsl --shutdown
wsl -d Ubuntu
```
