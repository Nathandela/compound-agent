/**
 * Setup Gemini command - Configure Gemini CLI compatibility hooks.
 *
 * Adapts compound-agent's Claude Code hooks to Gemini CLI's hook format.
 * Uses Gemini's @{path} file injection for commands, and inlines skill
 * content (since @{path} only works in TOML prompt fields, not SKILL.md).
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Command } from 'commander';

import { formatError } from '../cli-error-format.js';
import { out } from '../commands/index.js';
import { getRepoRoot } from '../cli-utils.js';
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

// ============================================================================
// Helpers
// ============================================================================

function parseDescription(content: string, fallback: string): string {
  const raw = content.match(/description:\s*(.*)/)?.[1] ?? fallback;
  return raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function writeSettings(geminiDir: string): Promise<void> {
  const settingsPath = join(geminiDir, 'settings.json');
  let settings = SETTINGS_JSON as Record<string, unknown>;
  if (existsSync(settingsPath)) {
    try {
      const existing = JSON.parse(await readFile(settingsPath, 'utf8')) as Record<string, unknown>;
      settings = {
        ...existing,
        hooks: {
          ...(existing.hooks as Record<string, unknown> | undefined),
          ...SETTINGS_JSON.hooks,
        },
      };
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
    await writeFile(join(skillDir, 'SKILL.md'), `---\nname: compound-${phase}\ndescription: ${description}\n---\n\n${content}\n`, 'utf8');
  }

  for (const [name, content] of Object.entries(AGENT_ROLE_SKILLS)) {
    const skillDir = join(geminiDir, 'skills', `compound-agent-${name}`);
    await mkdir(skillDir, { recursive: true });
    const description = parseDescription(content, `Compound agent ${name} skill`);
    await writeFile(join(skillDir, 'SKILL.md'), `---\nname: compound-agent-${name}\ndescription: ${description}\n---\n\n${content}\n`, 'utf8');
  }
}

// ============================================================================
// Installer
// ============================================================================

export async function installGeminiAdapter(
  options: { dryRun?: boolean; json?: boolean }
): Promise<void> {
  const repoRoot = getRepoRoot();
  const geminiDir = join(repoRoot, '.gemini');

  if (options.dryRun) {
    if (options.json) {
      console.log(JSON.stringify({ dryRun: true, wouldInstall: true, location: geminiDir }));
    } else {
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

  if (options.json) {
    console.log(JSON.stringify({ installed: true, location: geminiDir, action: 'created' }));
  } else {
    out.success('Gemini CLI compatibility hooks installed');
    console.log(`  Location: ${geminiDir}`);
    console.log('  Hooks: SessionStart, BeforeAgent, BeforeTool, AfterTool');
    console.log('  Commands: /compound:* aliases generated');
  }
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register the gemini subcommand on an existing setup command.
 */
export function registerGeminiSubcommand(setupCommand: Command): void {
  setupCommand
    .command('gemini')
    .description('Install Gemini CLI compatibility hooks (Adapter Pattern)')
    .option('--dry-run', 'Show what would change without writing')
    .option('--json', 'Output as JSON')
    .action(async (options: { dryRun?: boolean; json?: boolean }) => {
      try {
        await installGeminiAdapter(options);
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
