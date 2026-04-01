---
name: compound:launch-loop
description: Configure and launch infinity/polish loop pipelines in a screen session
argument-hint: "<epic IDs or 'from architect'>"
---
$ARGUMENTS

# Launch Loop

**MANDATORY FIRST STEP -- NON-NEGOTIABLE**: Use the Read tool to open and read `.claude/skills/compound/loop-launcher/SKILL.md` NOW. Do NOT proceed until you have read the complete skill file. It contains the authorization gate, script generation commands, CLI flag reference, pipeline patterns, and critical gotchas you must follow.

After reading the skill, follow the workflow:
1. **Authorization check** -- confirm you have user consent to launch
2. **Gather parameters** -- model, reviewers, review cadence, polish cycles
3. **Generate scripts** -- `ca loop` for infinity, `ca polish` for polish
4. **Pre-flight** -- verify epic statuses, dry-run
5. **Launch in screen** -- always in a screen session, never foreground
6. **Report monitoring commands** to the user
