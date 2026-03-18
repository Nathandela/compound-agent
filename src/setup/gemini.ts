/**
 * Setup Gemini command - Configure Gemini CLI compatibility hooks.
 *
 * Adapts compound-agent's Claude Code hooks to Gemini CLI's hook format.
 * Uses Gemini's @{path} file injection for commands, and inlines skill
 * content (since @{path} only works in TOML prompt fields, not SKILL.md).
 */

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Command } from 'commander';

import { formatError } from '../cli-error-format.js';
import { out } from '../commands/index.js';
import { getRepoRoot } from '../cli-utils.js';
import { enableGemini, disableGemini } from '../config/index.js';
import { WORKFLOW_COMMANDS, PHASE_SKILLS, AGENT_ROLE_SKILLS } from './templates/index.js';

// ============================================================================
// Hook script templates
// ============================================================================

const HOOKS: Record<string, string> = {
  'ca-prime.sh': `#!/usr/bin/env bash
input=$(cat)
echo "$input" | npx ca prime > /dev/null 2>&1
echo '{"decision": "allow"}'
`,
  'ca-user-prompt.sh': `#!/usr/bin/env bash
input=$(cat)
echo "$input" | npx ca hooks run user-prompt > /dev/null 2>&1
echo '{"decision": "allow"}'
`,
  'ca-post-tool.sh': `#!/usr/bin/env bash
input=$(cat)
echo "$input" | npx ca hooks run post-tool-success > /dev/null 2>&1
echo '{"decision": "allow"}'
`,
  'ca-phase-guard.sh': `#!/usr/bin/env bash
input=$(cat)
echo "$input" | npx ca hooks run phase-guard > /dev/null 2>&1
rc=$?
if [ $rc -ne 0 ]; then
  echo '{"decision": "deny", "reason": "Phase guard: read the phase skill before editing"}'
  exit 0
fi
echo '{"decision": "allow"}'
`,
};

const SETTINGS_JSON = {
  hooks: {
    SessionStart: [
      {
        matcher: ".*",
        hooks: [{ name: "ca-prime", type: "command", command: "bash .gemini/hooks/ca-prime.sh" }],
      },
    ],
    BeforeAgent: [
      {
        matcher: ".*",
        hooks: [{ name: "ca-user-prompt", type: "command", command: "bash .gemini/hooks/ca-user-prompt.sh" }],
      },
    ],
    BeforeTool: [
      {
        matcher: "replace|write_file|create_file",
        hooks: [{ name: "ca-phase-guard", type: "command", command: "bash .gemini/hooks/ca-phase-guard.sh" }],
      },
    ],
    AfterTool: [
      {
        matcher: "run_shell_command|replace|write_file|create_file",
        hooks: [{ name: "ca-post-tool", type: "command", command: "bash .gemini/hooks/ca-post-tool.sh" }],
      },
    ],
  },
};

/** Derive compound hook names from SETTINGS_JSON to keep cleanup in sync. */
const COMPOUND_SETTINGS_HOOK_NAMES = new Set(
  Object.values(SETTINGS_JSON.hooks).flatMap(entries =>
    entries.flatMap(entry => entry.hooks.map(h => h.name))
  )
);

// ============================================================================
// Helpers
// ============================================================================

/** Write settings object to file, or remove the file if settings is empty. */
async function writeOrRemoveSettings(settingsPath: string, settings: Record<string, unknown>): Promise<void> {
  if (Object.keys(settings).length > 0) {
    await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  } else {
    await rm(settingsPath);
  }
}

/** Return true if a hook entry belongs to compound-agent. */
function isCompoundHookEntry(entry: unknown): boolean {
  const e = entry as Record<string, unknown>;
  const innerHooks = e.hooks as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(innerHooks)) return false;
  return innerHooks.some(h => COMPOUND_SETTINGS_HOOK_NAMES.has(h.name as string));
}

/**
 * Merge compound entries for one hook type into the merged hooks map,
 * replacing any previously installed compound entries.
 */
function mergeHookType(
  mergedHooks: Record<string, unknown[]>,
  hookType: string,
  compoundEntries: unknown[],
): void {
  const existing = mergedHooks[hookType];
  if (Array.isArray(existing)) {
    const userEntries = existing.filter((entry: unknown) => !isCompoundHookEntry(entry));
    mergedHooks[hookType] = [...userEntries, ...compoundEntries];
  } else {
    mergedHooks[hookType] = compoundEntries;
  }
}

/**
 * Filter compound entries out of one hook type and update the hooks map in place.
 * Returns true if any entries were removed.
 */
function filterHookType(
  hooks: Record<string, unknown[]>,
  hookType: string,
  entries: unknown[],
): boolean {
  const filtered = entries.filter((entry: unknown) => !isCompoundHookEntry(entry));
  const removed = filtered.length !== entries.length;
  hooks[hookType] = filtered;
  if (filtered.length === 0) delete hooks[hookType];
  return removed;
}

/**
 * Strip compound hook entries from a parsed settings object.
 * Returns true if any entries were removed.
 */
function stripCompoundHooksFromSettings(settings: Record<string, unknown>): boolean {
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks) return false;
  let removedAny = false;
  for (const [hookType, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue;
    if (filterHookType(hooks, hookType, entries)) removedAny = true;
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks;
  return removedAny;
}

function parseDescription(content: string, fallback: string): string {
  const raw = content.match(/description:\s*(.*)/)?.[1] ?? fallback;
  return raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Strip YAML frontmatter (---...---) from content if present. */
function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n*/, '');
}

/**
 * Write settings.json, merging compound hooks into existing per-type arrays
 * without overwriting user-defined hooks in the same category.
 */
async function writeSettings(geminiDir: string): Promise<void> {
  const settingsPath = join(geminiDir, 'settings.json');
  let settings: Record<string, unknown> = { hooks: { ...SETTINGS_JSON.hooks } };

  if (existsSync(settingsPath)) {
    try {
      const existing = JSON.parse(await readFile(settingsPath, 'utf8')) as Record<string, unknown>;
      const existingHooks = existing.hooks as Record<string, unknown[]> | undefined;

      if (existingHooks) {
        // Merge at the per-type array level: remove old compound entries, then append new ones
        const mergedHooks: Record<string, unknown[]> = { ...existingHooks };
        for (const [hookType, compoundEntries] of Object.entries(SETTINGS_JSON.hooks)) {
          mergeHookType(mergedHooks, hookType, compoundEntries);
        }
        settings = { ...existing, hooks: mergedHooks };
      } else {
        settings = { ...existing, hooks: { ...SETTINGS_JSON.hooks } };
      }
    } catch {
      // Can't parse existing - overwrite
    }
  }
  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

async function writeTomlCommands(geminiDir: string): Promise<void> {
  for (const [filename, content] of Object.entries(WORKFLOW_COMMANDS)) {
    const cmdName = filename.replace('.md', '');
    const description = parseDescription(content, `Compound ${cmdName} command`);
    const toml = `description = "${description}"
prompt = """
@{.claude/commands/compound/${filename}}

{{args}}
"""
`;
    await writeFile(join(geminiDir, 'commands', 'compound', `${cmdName}.toml`), toml, 'utf8');
  }
}

async function writeSkills(geminiDir: string): Promise<void> {
  for (const [phase, content] of Object.entries(PHASE_SKILLS)) {
    const skillDir = join(geminiDir, 'skills', `compound-${phase}`);
    await mkdir(skillDir, { recursive: true });
    const description = parseDescription(content, `Compound ${phase} skill`);
    const body = stripFrontmatter(content);
    await writeFile(join(skillDir, 'SKILL.md'), `---\nname: compound-${phase}\ndescription: ${description}\n---\n\n${body}\n`, 'utf8');
  }

  for (const [name, content] of Object.entries(AGENT_ROLE_SKILLS)) {
    const skillDir = join(geminiDir, 'skills', `compound-agent-${name}`);
    await mkdir(skillDir, { recursive: true });
    const description = parseDescription(content, `Compound agent ${name} skill`);
    const body = stripFrontmatter(content);
    await writeFile(join(skillDir, 'SKILL.md'), `---\nname: compound-agent-${name}\ndescription: ${description}\n---\n\n${body}\n`, 'utf8');
  }
}

// ============================================================================
// Cleanup (remove compound-managed files only)
// ============================================================================

/** Hook filenames managed by compound-agent. */
const COMPOUND_HOOK_NAMES = Object.keys(HOOKS);

/**
 * Remove compound-managed files from .gemini/ while preserving user content.
 * Cleans: hooks/ca-*.sh, commands/compound/, skills/compound-*, compound entries in settings.json.
 */
export async function cleanGeminiCompoundFiles(repoRoot: string): Promise<string[]> {
  const gemDir = join(repoRoot, '.gemini');
  if (!existsSync(gemDir)) return [];

  const actions: string[] = [];

  // Remove hook scripts
  for (const hookFile of COMPOUND_HOOK_NAMES) {
    const hookPath = join(gemDir, 'hooks', hookFile);
    if (existsSync(hookPath)) {
      await rm(hookPath);
      actions.push(`Removed .gemini/hooks/${hookFile}`);
    }
  }

  // Remove commands/compound/ directory
  const compoundCmdsDir = join(gemDir, 'commands', 'compound');
  if (existsSync(compoundCmdsDir)) {
    await rm(compoundCmdsDir, { recursive: true, force: true });
    actions.push('Removed .gemini/commands/compound/');
  }

  // Remove skills/compound-* directories
  const skillsDir = join(gemDir, 'skills');
  if (existsSync(skillsDir)) {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('compound-')) {
        await rm(join(skillsDir, entry.name), { recursive: true, force: true });
        actions.push(`Removed .gemini/skills/${entry.name}/`);
      }
    }
  }

  // Remove compound hook entries from settings.json (preserve other keys)
  const settingsPath = join(gemDir, 'settings.json');
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(await readFile(settingsPath, 'utf8')) as Record<string, unknown>;
      if (stripCompoundHooksFromSettings(settings)) {
        await writeOrRemoveSettings(settingsPath, settings);
        actions.push('Cleaned compound hooks from .gemini/settings.json');
      }
    } catch {
      // Malformed JSON — skip
    }
  }

  return actions;
}

/**
 * Check if compound-managed Gemini files exist (for migration detection).
 */
export function hasGeminiCompoundFiles(repoRoot: string): boolean {
  return existsSync(join(repoRoot, '.gemini', 'hooks', 'ca-prime.sh'));
}

// ============================================================================
// Installer
// ============================================================================

export async function installGeminiAdapter(
  repoRoot: string,
  options: { dryRun?: boolean; silent?: boolean }
): Promise<void> {
  const geminiDir = join(repoRoot, '.gemini');

  if (options.dryRun) {
    if (!options.silent) {
      console.log(`Would install gemini hooks and commands to ${geminiDir}`);
    }
    return;
  }

  await mkdir(join(geminiDir, 'hooks'), { recursive: true });
  await mkdir(join(geminiDir, 'commands', 'compound'), { recursive: true });

  for (const [filename, content] of Object.entries(HOOKS)) {
    await writeFile(join(geminiDir, 'hooks', filename), content, { mode: 0o755 });
  }

  await writeSettings(geminiDir);
  await writeTomlCommands(geminiDir);
  await writeSkills(geminiDir);

  if (!options.silent) {
    out.success('Gemini CLI compatibility hooks installed');
    console.log(`  Location: ${geminiDir}`);
    console.log('  Hooks: SessionStart, BeforeAgent, BeforeTool, AfterTool');
    console.log('  Commands: /compound:* aliases generated');
  }
}

// ============================================================================
// Command Registration
// ============================================================================

/** Handle the --disable flag: disable Gemini adapter and clean compound files. */
async function handleDisable(repoRoot: string, options: { dryRun?: boolean; json?: boolean }): Promise<void> {
  if (options.dryRun) {
    console.log(options.json
      ? JSON.stringify({ dryRun: true, wouldDisable: true })
      : 'Would disable Gemini adapter and clean compound files');
    return;
  }
  await disableGemini(repoRoot);
  const actions = await cleanGeminiCompoundFiles(repoRoot);
  if (options.json) {
    console.log(JSON.stringify({ disabled: true, cleaned: actions }));
  } else {
    out.success('Gemini adapter disabled');
    for (const action of actions) console.log(`  ${action}`);
  }
}

/**
 * Register the gemini subcommand on an existing setup command.
 */
export function registerGeminiSubcommand(setupCommand: Command): void {
  setupCommand
    .command('gemini')
    .description('Install Gemini CLI compatibility hooks (Adapter Pattern)')
    .option('--dry-run', 'Show what would change without writing')
    .option('--json', 'Output as JSON')
    .option('--disable', 'Disable Gemini adapter and clean compound files')
    .action(async (options: { dryRun?: boolean; json?: boolean; disable?: boolean }) => {
      try {
        const repoRoot = getRepoRoot();

        if (options.disable) {
          await handleDisable(repoRoot, options);
          return;
        }

        if (!options.dryRun) await enableGemini(repoRoot);
        await installGeminiAdapter(repoRoot, { dryRun: options.dryRun });
      } catch (err) {
        if (options.json) {
          console.log(JSON.stringify({ error: String(err) }));
        } else {
          console.error(formatError('setup', 'GEMINI_INSTALL_ERROR', String(err), 'Check .gemini/ directory permissions'));
        }
        process.exitCode = 1;
      }
    });
}
