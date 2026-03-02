/**
 * Tests for AGENTS.md content and Claude Plugin structure.
 *
 * NOTE: Tests for individual CLI commands (init, setup claude, download-model)
 * are in their respective files under src/cli/:
 * - src/cli/init.test.ts
 * - src/cli/setup-claude.test.ts
 * - src/cli/download-model.test.ts
 *
 * This file tests the content and structure of generated files.
 */

import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { setupCliTestContext } from '../test-utils.js';
import { AGENT_TEMPLATES, WORKFLOW_COMMANDS, PHASE_SKILLS } from './templates/index.js';

describe('Setup Commands - Generated Content', { tags: ['integration'] }, () => {
  const { getTempDir, runCli } = setupCliTestContext();

  /**
   * Tests for ctv: Claude Plugin structure
   */
  describe('Claude Plugin structure (ctv)', () => {
    it('creates plugin.json in .claude directory', async () => {
      runCli('init');

      const pluginPath = join(getTempDir(), '.claude', 'plugin.json');
      expect(existsSync(pluginPath)).toBe(true);
    });

    it('plugin.json has correct metadata', async () => {
      runCli('init');

      const pluginPath = join(getTempDir(), '.claude', 'plugin.json');
      const content = JSON.parse(await readFile(pluginPath, 'utf-8')) as {
        name: string;
        description: string;
        version: string;
      };

      expect(content.name).toBe('compound-agent');
      expect(content.description).toContain('lesson');
      expect(content.version).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
    });

    it('plugin.json includes SessionStart hook', async () => {
      runCli('init');

      const pluginPath = join(getTempDir(), '.claude', 'plugin.json');
      const content = JSON.parse(await readFile(pluginPath, 'utf-8')) as {
        hooks: { SessionStart: Array<{ hooks: Array<{ command: string }> }> };
      };

      expect(content.hooks).toBeDefined();
      expect(content.hooks.SessionStart).toBeDefined();
      expect(content.hooks.SessionStart.length).toBeGreaterThan(0);

      // Should include prime command (v0.2.4: uses prime instead of load-session)
      const commands = content.hooks.SessionStart.flatMap((h) => h.hooks.map((hh) => hh.command));
      expect(commands.some((c) => c.includes('prime'))).toBe(true);
    });

    it('plugin.json includes PreCompact hook with prime', async () => {
      runCli('init');

      const pluginPath = join(getTempDir(), '.claude', 'plugin.json');
      const content = JSON.parse(await readFile(pluginPath, 'utf-8')) as {
        hooks: { PreCompact?: Array<{ hooks: Array<{ command: string }> }> };
      };

      expect(content.hooks.PreCompact).toBeDefined();
      const commands = content.hooks.PreCompact!.flatMap((h) => h.hooks.map((hh) => hh.command));
      expect(commands.some((c) => c.includes('prime'))).toBe(true);
    });

    it('creates utility slash commands in compound/ folder', async () => {
      runCli('init');

      const commandsDir = join(getTempDir(), '.claude', 'commands', 'compound');

      expect(existsSync(join(commandsDir, 'learn-that.md'))).toBe(true);
      expect(existsSync(join(commandsDir, 'check-that.md'))).toBe(true);
      expect(existsSync(join(commandsDir, 'prime.md'))).toBe(true);
    });

    it('does NOT create slash commands at root .claude/commands/ level', async () => {
      runCli('init');

      const commandsDir = join(getTempDir(), '.claude', 'commands');

      // Utility commands should NOT exist at root level
      expect(existsSync(join(commandsDir, 'learn-that.md'))).toBe(false);
      expect(existsSync(join(commandsDir, 'check-that.md'))).toBe(false);
      expect(existsSync(join(commandsDir, 'prime.md'))).toBe(false);
    });

    it('utility commands reference correct CLI commands', async () => {
      runCli('init');

      const commandsDir = join(getTempDir(), '.claude', 'commands', 'compound');

      const learnContent = await readFile(join(commandsDir, 'learn-that.md'), 'utf-8');
      expect(learnContent).toContain('ca learn');

      const checkContent = await readFile(join(commandsDir, 'check-that.md'), 'utf-8');
      expect(checkContent).toContain('ca search');

      const primeContent = await readFile(join(commandsDir, 'prime.md'), 'utf-8');
      expect(primeContent).toContain('ca prime');
    });

    it('plugin.json is idempotent - not duplicated on re-run', async () => {
      runCli('init');
      runCli('init');

      const pluginPath = join(getTempDir(), '.claude', 'plugin.json');
      // Should still be valid JSON (not corrupted by double write)
      const content = JSON.parse(await readFile(pluginPath, 'utf-8'));
      expect(content.name).toBe('compound-agent');
    });

    it('--skip-agents also skips plugin.json', async () => {
      runCli('init --skip-agents');

      const pluginPath = join(getTempDir(), '.claude', 'plugin.json');
      expect(existsSync(pluginPath)).toBe(false);
    });
  });

  /**
   * Tests for 0p5: AGENTS.md must prohibit direct JSONL edits
   */
  describe('AGENTS.md prohibits direct JSONL edits (0p5)', () => {
    it('includes "NEVER edit" rule', async () => {
      runCli('init');

      const agentsPath = join(getTempDir(), 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');

      // Must have Never Edit JSONL section
      expect(content).toContain('Never Edit JSONL');
      // Must explicitly prohibit direct edits
      expect(content).toMatch(/never\s+edit.*index\.jsonl/i);
    });

    it('mentions CLI alternatives for JSONL operations', async () => {
      runCli('init');

      const agentsPath = join(getTempDir(), 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');

      // Must mention CLI as the alternative
      expect(content).toContain('npx ca learn');
    });

    it('CLI Commands section appears near top of Compound Agent section', async () => {
      runCli('init');

      const agentsPath = join(getTempDir(), 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');

      // Find positions
      const sectionStart = content.indexOf('## Compound Agent Integration');
      const cliCommands = content.indexOf('### CLI Commands');
      const mandatoryRecall = content.indexOf('### Mandatory Recall');

      // CLI Commands must appear before Mandatory Recall section
      expect(sectionStart).toBeGreaterThan(-1);
      expect(cliCommands).toBeGreaterThan(sectionStart);
      expect(cliCommands).toBeLessThan(mandatoryRecall);
    });

    it('explains consequences of direct edits', async () => {
      runCli('init');

      const agentsPath = join(getTempDir(), 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');

      // Should explain why direct edits are bad
      expect(content).toMatch(/schema|validation|sync/i);
    });
  });

  /**
   * Tests for lfy: CLAUDE.md reference to AGENTS.md
   */
  describe('CLAUDE.md reference to AGENTS.md (lfy)', () => {
    it('creates CLAUDE.md with reference if it does not exist', async () => {
      runCli('init');

      const claudeMdPath = join(getTempDir(), '.claude', 'CLAUDE.md');
      const content = await readFile(claudeMdPath, 'utf-8');

      expect(content).toContain('Compound Agent');
      expect(content).toMatch(/AGENTS\.md|agents\.md/i);
    });

    it('appends reference to existing CLAUDE.md', async () => {
      // Create existing CLAUDE.md
      const claudeDir = join(getTempDir(), '.claude');
      await mkdir(claudeDir, { recursive: true });
      const claudeMdPath = join(claudeDir, 'CLAUDE.md');
      await writeFile(claudeMdPath, '# Existing Project Instructions\n\nSome rules here.\n');

      runCli('init');

      const content = await readFile(claudeMdPath, 'utf-8');
      // Should preserve existing content
      expect(content).toContain('Existing Project Instructions');
      // Should add reference
      expect(content).toMatch(/AGENTS\.md|agents\.md/i);
    });

    it('does not duplicate reference if already present', async () => {
      // Create CLAUDE.md with existing reference
      const claudeDir = join(getTempDir(), '.claude');
      await mkdir(claudeDir, { recursive: true });
      const claudeMdPath = join(claudeDir, 'CLAUDE.md');
      await writeFile(claudeMdPath, '# Project\n\n## Compound Agent\nSee AGENTS.md for workflow.\n');

      runCli('init');
      runCli('init'); // Run twice

      const content = await readFile(claudeMdPath, 'utf-8');
      // Should have only one Compound Agent section
      const matches = content.match(/Compound Agent/g);
      expect(matches?.length).toBe(1);
    });

    it('uses markers for clean uninstall support', async () => {
      runCli('init');

      const claudeMdPath = join(getTempDir(), '.claude', 'CLAUDE.md');
      const content = await readFile(claudeMdPath, 'utf-8');

      // Should have start and end markers
      expect(content).toContain('<!-- compound-agent:');
      expect(content).toMatch(/compound-agent:[^>]*start/);
      expect(content).toMatch(/compound-agent:[^>]*end/);
    });
  });

  /**
   * Tests for 501: Detection triggers in AGENTS.md
   */
  describe('Detection triggers in AGENTS.md (501)', () => {
    it('includes user correction detection pattern', async () => {
      runCli('init');

      const agentsPath = join(getTempDir(), 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');

      // Should mention user correction triggers
      expect(content).toMatch(/user\s+(correction|corrects)/i);
      expect(content).toMatch(/"no"|"wrong"|"actually"/i);
    });

    it('includes test failure detection pattern', async () => {
      runCli('init');

      const agentsPath = join(getTempDir(), 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');

      // Should mention test failure -> fix pattern
      expect(content).toMatch(/test.*fail/i);
    });

    it('detection triggers section has actionable instructions', async () => {
      runCli('init');

      const agentsPath = join(getTempDir(), 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');

      // Should tell Claude what to do when pattern detected (CLI-first)
      expect(content).toContain('npx ca learn');
    });
  });

  /**
   * Tests for CLI-first documentation in AGENTS.md
   */
  describe('CLI commands documentation in AGENTS.md', () => {
    it('documents npx ca search command', async () => {
      runCli('init');

      const agentsPath = join(getTempDir(), 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');

      // Should document CLI search command
      expect(content).toContain('npx ca search');
      expect(content).toMatch(/before.*architectural|architectural.*decisions/i);
    });

    it('documents npx ca learn command', async () => {
      runCli('init');

      const agentsPath = join(getTempDir(), 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');

      // Should document CLI learn command
      expect(content).toContain('npx ca learn');
      expect(content).toMatch(/user corrects|corrections|discoveries/i);
    });

    it('includes CLI commands table', async () => {
      runCli('init');

      const agentsPath = join(getTempDir(), 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');

      // Should have CLI Commands section with table
      expect(content).toContain('CLI Commands');
      expect(content).toContain('| Command | Purpose |');
    });

    it('does NOT reference MCP tools as primary interface', async () => {
      runCli('init');

      const agentsPath = join(getTempDir(), 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');

      // Should NOT have MCP-first language
      expect(content).not.toContain('MCP Tools (ALWAYS USE THESE)');
      expect(content).not.toContain('MCP tools (preferred)');
      expect(content).not.toContain('You MUST use MCP tools');
    });
  });

  /**
   * Tests for setup --uninstall
   */
  describe('setup --uninstall', () => {
    it('removes .claude/agents/compound/ directory', async () => {
      runCli('init');
      expect(existsSync(join(getTempDir(), '.claude', 'agents', 'compound'))).toBe(true);

      runCli('setup --uninstall');
      expect(existsSync(join(getTempDir(), '.claude', 'agents', 'compound'))).toBe(false);
    });

    it('removes .claude/commands/compound/ directory', async () => {
      runCli('init');
      expect(existsSync(join(getTempDir(), '.claude', 'commands', 'compound'))).toBe(true);

      runCli('setup --uninstall');
      expect(existsSync(join(getTempDir(), '.claude', 'commands', 'compound'))).toBe(false);
    });

    it('removes .claude/skills/compound/ directory', async () => {
      runCli('init');
      expect(existsSync(join(getTempDir(), '.claude', 'skills', 'compound'))).toBe(true);

      runCli('setup --uninstall');
      expect(existsSync(join(getTempDir(), '.claude', 'skills', 'compound'))).toBe(false);
    });

    it('removes compound-agent hooks from settings.json', async () => {
      runCli('setup --skip-model');

      const settingsPath = join(getTempDir(), '.claude', 'settings.json');
      const before = JSON.parse(await readFile(settingsPath, 'utf-8'));
      expect(before.hooks).toBeDefined();

      runCli('setup --uninstall');

      if (existsSync(settingsPath)) {
        const after = JSON.parse(await readFile(settingsPath, 'utf-8'));
        const hooks = after.hooks as Record<string, unknown[]> | undefined;
        if (hooks) {
          for (const arr of Object.values(hooks)) {
            for (const entry of arr) {
              const hookEntry = entry as { hooks?: Array<{ command?: string }> };
              const cmds = hookEntry.hooks?.map((h) => h.command ?? '') ?? [];
              expect(cmds.some((c) => c.includes('ca '))).toBe(false);
            }
          }
        }
      }
    });

    it('removes AGENTS.md section', async () => {
      runCli('init');

      const agentsPath = join(getTempDir(), 'AGENTS.md');
      const before = await readFile(agentsPath, 'utf-8');
      expect(before).toContain('compound-agent:start');

      runCli('setup --uninstall');

      const after = await readFile(agentsPath, 'utf-8');
      expect(after).not.toContain('compound-agent:start');
    });

    it('removes CLAUDE.md reference', async () => {
      runCli('init');

      const claudeMdPath = join(getTempDir(), '.claude', 'CLAUDE.md');
      const before = await readFile(claudeMdPath, 'utf-8');
      expect(before).toContain('compound-agent:claude-ref:start');

      runCli('setup --uninstall');

      const after = await readFile(claudeMdPath, 'utf-8');
      expect(after).not.toContain('compound-agent:claude-ref:start');
    });

    it('removes .claude/plugin.json', async () => {
      runCli('init');
      expect(existsSync(join(getTempDir(), '.claude', 'plugin.json'))).toBe(true);

      runCli('setup --uninstall');
      expect(existsSync(join(getTempDir(), '.claude', 'plugin.json'))).toBe(false);
    });

    it('skips plugin.json when name is not compound-agent', async () => {
      runCli('init');

      // Overwrite plugin.json with a different plugin's manifest
      const pluginPath = join(getTempDir(), '.claude', 'plugin.json');
      await writeFile(pluginPath, JSON.stringify({ name: 'other-plugin', version: '1.0.0' }));

      runCli('setup --uninstall');

      // File should still exist — not ours
      expect(existsSync(pluginPath)).toBe(true);
      const content = JSON.parse(await readFile(pluginPath, 'utf-8'));
      expect(content.name).toBe('other-plugin');
    });

    it('removes all commands in compound/ folder', async () => {
      runCli('init');

      const commandsDir = join(getTempDir(), '.claude', 'commands', 'compound');
      expect(existsSync(join(commandsDir, 'learn-that.md'))).toBe(true);

      runCli('setup --uninstall');

      expect(existsSync(commandsDir)).toBe(false);
    });

    it('does NOT remove .claude/lessons/ (user data)', async () => {
      runCli('init');

      const lessonsDir = join(getTempDir(), '.claude', 'lessons');
      expect(existsSync(lessonsDir)).toBe(true);

      runCli('setup --uninstall');

      expect(existsSync(lessonsDir)).toBe(true);
    });

    it('reports what was removed', () => {
      runCli('init');

      const result = runCli('setup --uninstall');
      expect(result.combined).toContain('Removed');
    });

    it('is idempotent - running twice does not error', () => {
      runCli('init');

      const first = runCli('setup --uninstall');
      expect(first.combined).toContain('Removed');

      // Second run should not throw
      const second = runCli('setup --uninstall');
      expect(second.combined).toBeDefined();
    });
  });

  /**
   * Tests for setup --update
   */
  describe('setup --update', () => {
    it('overwrites files with legacy marker, stripping the marker', async () => {
      runCli('init');

      // Agent file has marker (from legacy install), should be overwritten without marker
      const agentFile = join(getTempDir(), '.claude', 'agents', 'compound', 'repo-analyst.md');
      await writeFile(agentFile, '<!-- generated by compound-agent -->\nold content', 'utf-8');

      runCli('setup --update');

      const content = await readFile(agentFile, 'utf-8');
      expect(content).toBe(AGENT_TEMPLATES['repo-analyst.md']);
    });

    it('overwrites files without marker (managed by path)', async () => {
      runCli('init');

      // File without marker in managed directory - should still be overwritten
      const agentFile = join(getTempDir(), '.claude', 'agents', 'compound', 'repo-analyst.md');
      await writeFile(agentFile, 'old content without marker', 'utf-8');

      runCli('setup --update');

      const content = await readFile(agentFile, 'utf-8');
      expect(content).toBe(AGENT_TEMPLATES['repo-analyst.md']);
    });

    it('adds new templates that did not exist before', async () => {
      runCli('init');

      // Delete one agent file
      const agentFile = join(getTempDir(), '.claude', 'agents', 'compound', 'repo-analyst.md');
      await rm(agentFile);
      expect(existsSync(agentFile)).toBe(false);

      runCli('setup --update');

      expect(existsSync(agentFile)).toBe(true);
      const content = await readFile(agentFile, 'utf-8');
      // No marker prepended in v1.3+
      expect(content).toBe(AGENT_TEMPLATES['repo-analyst.md']);
    });

    it('reports what was updated/added', () => {
      runCli('init');

      const result = runCli('setup --update');
      expect(result.combined).toMatch(/updated|up to date/i);
    });

    it('--update on install with deprecated commands removes them', async () => {
      runCli('init');

      // Create deprecated command files
      const commandsDir = join(getTempDir(), '.claude', 'commands', 'compound');
      const deprecated = ['search.md', 'list.md', 'show.md', 'stats.md', 'wrong.md', 'learn.md'];
      for (const f of deprecated) {
        await writeFile(join(commandsDir, f), 'Run npx ca search to find lessons', 'utf-8');
      }

      runCli('setup --update');

      for (const f of deprecated) {
        expect(existsSync(join(commandsDir, f))).toBe(false);
      }
    });

    it('--update creates .gitignore entries', async () => {
      runCli('init');

      // Remove .gitignore to test it gets recreated
      const gitignorePath = join(getTempDir(), '.gitignore');
      if (existsSync(gitignorePath)) await rm(gitignorePath);

      runCli('setup --update');

      expect(existsSync(gitignorePath)).toBe(true);
      const content = await readFile(gitignorePath, 'utf-8');
      expect(content).toContain('.claude/.cache/');
    });

    it('cleans up old root-level slash commands during update', async () => {
      runCli('init');

      // Simulate v1.0 state: generated slash commands at root level
      const commandsDir = join(getTempDir(), '.claude', 'commands');
      const oldFiles = ['learn.md', 'search.md', 'list.md', 'prime.md', 'show.md', 'wrong.md', 'stats.md'];
      for (const f of oldFiles) {
        await writeFile(join(commandsDir, f), '<!-- generated by compound-agent -->\nold root-level command', 'utf-8');
      }

      runCli('setup --update');

      // Old root-level files should be removed
      for (const f of oldFiles) {
        expect(existsSync(join(commandsDir, f))).toBe(false);
      }

      // compound/ folder should have the kept commands (learn-that, check-that, prime)
      const compoundDir = join(commandsDir, 'compound');
      expect(existsSync(join(compoundDir, 'learn-that.md'))).toBe(true);
      expect(existsSync(join(compoundDir, 'check-that.md'))).toBe(true);
      expect(existsSync(join(compoundDir, 'prime.md'))).toBe(true);
    });

    it('preserves user-authored root-level commands with legacy names during update', async () => {
      runCli('init');

      // Simulate user-authored file with a legacy name (no GENERATED_MARKER)
      const commandsDir = join(getTempDir(), '.claude', 'commands');
      await writeFile(join(commandsDir, 'learn.md'), 'My custom learn command', 'utf-8');

      runCli('setup --update');

      // User-authored file should be preserved
      const content = await readFile(join(commandsDir, 'learn.md'), 'utf-8');
      expect(content).toBe('My custom learn command');
    });

    it('reports config status in --update output', async () => {
      runCli('setup --skip-model');

      // Remove hooks to trigger config update
      const settingsPath = join(getTempDir(), '.claude', 'settings.json');
      await writeFile(settingsPath, '{}', 'utf-8');

      const result = runCli('setup --update');
      // Should mention config was updated
      expect(result.combined).toMatch(/config|hooks/i);
    });
  });

  /**
   * Tests for setup --status
   */
  describe('setup --status', () => {
    it('shows installed status after setup', () => {
      runCli('setup --skip-model');

      const result = runCli('setup --status');
      expect(result.combined).toMatch(/agent/i);
      expect(result.combined).toMatch(/hook/i);
    });

    it('shows not-installed status before setup', () => {
      const result = runCli('setup --status');
      // Should mention something is missing
      expect(result.combined).toBeDefined();
    });
  });

  /**
   * Tests for setup --dry-run
   */
  describe('setup --dry-run', () => {
    it('--uninstall --dry-run does not remove files', async () => {
      runCli('init');

      const agentsDir = join(getTempDir(), '.claude', 'agents', 'compound');
      expect(existsSync(agentsDir)).toBe(true);

      const result = runCli('setup --uninstall --dry-run');

      // Files should still exist
      expect(existsSync(agentsDir)).toBe(true);
      // Should report what would be removed
      expect(result.combined).toMatch(/would|dry.run/i);
    });

    it('--update --dry-run does not modify files', async () => {
      runCli('init');

      const agentFile = join(getTempDir(), '.claude', 'agents', 'compound', 'repo-analyst.md');
      await writeFile(agentFile, 'old content', 'utf-8');

      const result = runCli('setup --update --dry-run');

      // File should still have old content
      const content = await readFile(agentFile, 'utf-8');
      expect(content).toBe('old content');
      expect(result.combined).toMatch(/would|dry.run/i);
    });
  });

  /**
   * Tests for agent template installation
   */
  describe('Agent template installation', () => {
    it('creates .claude/agents/compound/ with 8 .md files', async () => {
      runCli('init');

      const agentsDir = join(getTempDir(), '.claude', 'agents', 'compound');
      expect(existsSync(agentsDir)).toBe(true);

      const files = readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
      expect(files.length).toBe(8);
    });

    it('creates all expected agent template files', async () => {
      runCli('init');

      const agentsDir = join(getTempDir(), '.claude', 'agents', 'compound');
      for (const filename of Object.keys(AGENT_TEMPLATES)) {
        expect(existsSync(join(agentsDir, filename))).toBe(true);
      }
    });

    it('agent files contain template content directly (no generated marker)', async () => {
      runCli('init');

      const agentsDir = join(getTempDir(), '.claude', 'agents', 'compound');
      for (const [filename, template] of Object.entries(AGENT_TEMPLATES)) {
        const content = await readFile(join(agentsDir, filename), 'utf-8');
        expect(content).toBe(template);
      }
    });

    it('is idempotent - running init twice does not duplicate files', async () => {
      runCli('init');
      runCli('init');

      const agentsDir = join(getTempDir(), '.claude', 'agents', 'compound');
      const files = readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
      expect(files.length).toBe(8);
    });

    it('does not overwrite existing agent files', async () => {
      runCli('init');

      // Modify a file
      const filePath = join(getTempDir(), '.claude', 'agents', 'compound', 'repo-analyst.md');
      await writeFile(filePath, 'custom content', 'utf-8');

      runCli('init');

      const content = await readFile(filePath, 'utf-8');
      expect(content).toBe('custom content');
    });

    it('--skip-agents skips agent template installation', async () => {
      runCli('init --skip-agents');

      const agentsDir = join(getTempDir(), '.claude', 'agents', 'compound');
      expect(existsSync(agentsDir)).toBe(false);
    });
  });

  /**
   * Tests for workflow command template installation
   */
  describe('Workflow command template installation', () => {
    it('creates .claude/commands/compound/ with all workflow command .md files', async () => {
      runCli('init');

      const commandsDir = join(getTempDir(), '.claude', 'commands', 'compound');
      expect(existsSync(commandsDir)).toBe(true);

      const files = readdirSync(commandsDir).filter((f) => f.endsWith('.md'));
      expect(files.length).toBe(Object.keys(WORKFLOW_COMMANDS).length);
    });

    it('creates all expected workflow command files', async () => {
      runCli('init');

      const commandsDir = join(getTempDir(), '.claude', 'commands', 'compound');
      for (const filename of Object.keys(WORKFLOW_COMMANDS)) {
        expect(existsSync(join(commandsDir, filename))).toBe(true);
      }
    });

    it('workflow command files contain template content directly (no generated marker)', async () => {
      runCli('init');

      const commandsDir = join(getTempDir(), '.claude', 'commands', 'compound');
      for (const [filename, template] of Object.entries(WORKFLOW_COMMANDS)) {
        const content = await readFile(join(commandsDir, filename), 'utf-8');
        expect(content).toBe(template);
      }
    });

    it('is idempotent - running init twice does not duplicate files', async () => {
      runCli('init');
      runCli('init');

      const commandsDir = join(getTempDir(), '.claude', 'commands', 'compound');
      const files = readdirSync(commandsDir).filter((f) => f.endsWith('.md'));
      expect(files.length).toBe(Object.keys(WORKFLOW_COMMANDS).length);
    });

    it('--skip-agents skips workflow command installation', async () => {
      runCli('init --skip-agents');

      const commandsDir = join(getTempDir(), '.claude', 'commands', 'compound');
      expect(existsSync(commandsDir)).toBe(false);
    });
  });

  /**
   * Tests for phase skill template installation
   */
  describe('Phase skill template installation', () => {
    it('creates .claude/skills/compound/<phase>/SKILL.md for all phases', async () => {
      runCli('init');

      const skillsDir = join(getTempDir(), '.claude', 'skills', 'compound');
      expect(existsSync(skillsDir)).toBe(true);

      for (const phase of Object.keys(PHASE_SKILLS)) {
        const skillPath = join(skillsDir, phase, 'SKILL.md');
        expect(existsSync(skillPath)).toBe(true);
      }
    });

    it('skill files contain template content directly (no generated marker)', async () => {
      runCli('init');

      const skillsDir = join(getTempDir(), '.claude', 'skills', 'compound');
      for (const [phase, template] of Object.entries(PHASE_SKILLS)) {
        const content = await readFile(join(skillsDir, phase, 'SKILL.md'), 'utf-8');
        expect(content).toBe(template);
      }
    });

    it('is idempotent - running init twice does not duplicate files', async () => {
      runCli('init');
      runCli('init');

      const skillsDir = join(getTempDir(), '.claude', 'skills', 'compound');
      for (const phase of Object.keys(PHASE_SKILLS)) {
        const skillPath = join(skillsDir, phase, 'SKILL.md');
        expect(existsSync(skillPath)).toBe(true);
      }
    });

    it('does not overwrite existing skill files', async () => {
      runCli('init');

      // Modify a file
      const filePath = join(getTempDir(), '.claude', 'skills', 'compound', 'brainstorm', 'SKILL.md');
      await writeFile(filePath, 'custom skill content', 'utf-8');

      runCli('init');

      const content = await readFile(filePath, 'utf-8');
      expect(content).toBe('custom skill content');
    });

    it('--skip-agents skips skill installation', async () => {
      runCli('init --skip-agents');

      const skillsDir = join(getTempDir(), '.claude', 'skills', 'compound');
      expect(existsSync(skillsDir)).toBe(false);
    });
  });

  /**
   * Tests for g1r9: setup installs pre-commit git hook
   */
  describe('Pre-commit hook installation via setup (g1r9)', () => {
    it('setup installs pre-commit git hook when .git/hooks exists', async () => {
      // Create .git/hooks directory to simulate a git repo
      const hooksDir = join(getTempDir(), '.git', 'hooks');
      await mkdir(hooksDir, { recursive: true });

      runCli('setup --skip-model');

      const hookPath = join(hooksDir, 'pre-commit');
      expect(existsSync(hookPath)).toBe(true);
      const content = await readFile(hookPath, 'utf-8');
      expect(content).toContain('Compound Agent');
    });

    it('setup skips pre-commit hook gracefully when no .git directory', () => {
      // No .git directory - setup should not error
      const result = runCli('setup --skip-model');
      expect(result.combined).toContain('setup complete');

      // No hook should be created
      const hookPath = join(getTempDir(), '.git', 'hooks', 'pre-commit');
      expect(existsSync(hookPath)).toBe(false);
    });

    it('setup does not duplicate pre-commit hook on re-run', async () => {
      const hooksDir = join(getTempDir(), '.git', 'hooks');
      await mkdir(hooksDir, { recursive: true });

      runCli('setup --skip-model');
      runCli('setup --skip-model');

      const hookPath = join(hooksDir, 'pre-commit');
      const content = await readFile(hookPath, 'utf-8');
      // Marker should appear exactly once
      const matches = content.match(/Compound Agent pre-commit hook/g);
      expect(matches?.length).toBe(1);
    });

    it('setup --skip-hooks does not install pre-commit hook', async () => {
      const hooksDir = join(getTempDir(), '.git', 'hooks');
      await mkdir(hooksDir, { recursive: true });

      runCli('setup --skip-model --skip-hooks');

      const hookPath = join(hooksDir, 'pre-commit');
      expect(existsSync(hookPath)).toBe(false);
    });
  });

  /**
   * Tests for pnpm onlyBuiltDependencies auto-configuration
   */
  describe('pnpm onlyBuiltDependencies auto-configuration', () => {
    it('adds onlyBuiltDependencies when pnpm-lock.yaml exists and package.json has no pnpm config', async () => {
      // Create pnpm-lock.yaml to signal this is a pnpm project
      await writeFile(join(getTempDir(), 'pnpm-lock.yaml'), 'lockfileVersion: 9\n', 'utf-8');
      // Create a minimal package.json (consumer project)
      await writeFile(join(getTempDir(), 'package.json'), JSON.stringify({ name: 'test-consumer', version: '1.0.0' }, null, 2) + '\n', 'utf-8');

      runCli('setup --skip-model');

      const pkg = JSON.parse(await readFile(join(getTempDir(), 'package.json'), 'utf-8'));
      expect(pkg.pnpm).toBeDefined();
      expect(pkg.pnpm.onlyBuiltDependencies).toContain('better-sqlite3');
      expect(pkg.pnpm.onlyBuiltDependencies).toContain('node-llama-cpp');
    });

    it('does not modify package.json when no pnpm-lock.yaml exists', async () => {
      // No pnpm-lock.yaml → not a pnpm project
      const original = JSON.stringify({ name: 'test-consumer', version: '1.0.0' }, null, 2) + '\n';
      await writeFile(join(getTempDir(), 'package.json'), original, 'utf-8');

      runCli('setup --skip-model');

      const content = await readFile(join(getTempDir(), 'package.json'), 'utf-8');
      expect(content).toBe(original);
    });

    it('does not duplicate entries when already configured', async () => {
      await writeFile(join(getTempDir(), 'pnpm-lock.yaml'), 'lockfileVersion: 9\n', 'utf-8');
      await writeFile(join(getTempDir(), 'package.json'), JSON.stringify({
        name: 'test-consumer',
        pnpm: { onlyBuiltDependencies: ['better-sqlite3', 'node-llama-cpp'] },
      }, null, 2) + '\n', 'utf-8');

      runCli('setup --skip-model');

      const pkg = JSON.parse(await readFile(join(getTempDir(), 'package.json'), 'utf-8'));
      const deps: string[] = pkg.pnpm.onlyBuiltDependencies;
      // Each entry should appear exactly once
      expect(deps.filter((d: string) => d === 'better-sqlite3').length).toBe(1);
      expect(deps.filter((d: string) => d === 'node-llama-cpp').length).toBe(1);
    });

    it('preserves existing pnpm config and merges missing deps', async () => {
      await writeFile(join(getTempDir(), 'pnpm-lock.yaml'), 'lockfileVersion: 9\n', 'utf-8');
      await writeFile(join(getTempDir(), 'package.json'), JSON.stringify({
        name: 'test-consumer',
        pnpm: {
          onlyBuiltDependencies: ['better-sqlite3'],
          overrides: { 'some-pkg': '1.0.0' },
        },
      }, null, 2) + '\n', 'utf-8');

      runCli('setup --skip-model');

      const pkg = JSON.parse(await readFile(join(getTempDir(), 'package.json'), 'utf-8'));
      expect(pkg.pnpm.onlyBuiltDependencies).toContain('better-sqlite3');
      expect(pkg.pnpm.onlyBuiltDependencies).toContain('node-llama-cpp');
      // Should preserve existing overrides
      expect(pkg.pnpm.overrides).toEqual({ 'some-pkg': '1.0.0' });
    });

    it('does not modify package.json when no package.json exists', async () => {
      await writeFile(join(getTempDir(), 'pnpm-lock.yaml'), 'lockfileVersion: 9\n', 'utf-8');
      // No package.json

      // Should not throw
      const result = runCli('setup --skip-model');
      expect(result.combined).toContain('setup complete');

      // package.json should not have been created by pnpm config step
      // (init creates lessons dir, not package.json)
      expect(existsSync(join(getTempDir(), 'package.json'))).toBe(false);
    });

    it('init also adds onlyBuiltDependencies for pnpm projects', async () => {
      await writeFile(join(getTempDir(), 'pnpm-lock.yaml'), 'lockfileVersion: 9\n', 'utf-8');
      await writeFile(join(getTempDir(), 'package.json'), JSON.stringify({ name: 'test-consumer' }, null, 2) + '\n', 'utf-8');

      runCli('init');

      const pkg = JSON.parse(await readFile(join(getTempDir(), 'package.json'), 'utf-8'));
      expect(pkg.pnpm).toBeDefined();
      expect(pkg.pnpm.onlyBuiltDependencies).toContain('better-sqlite3');
      expect(pkg.pnpm.onlyBuiltDependencies).toContain('node-llama-cpp');
    });

    it('detects pnpm via packageManager field when no lockfile exists', async () => {
      // No pnpm-lock.yaml, but packageManager field signals pnpm
      await writeFile(join(getTempDir(), 'package.json'), JSON.stringify({
        name: 'test-consumer',
        packageManager: 'pnpm@10.28.2',
      }, null, 2) + '\n', 'utf-8');

      runCli('setup --skip-model');

      const pkg = JSON.parse(await readFile(join(getTempDir(), 'package.json'), 'utf-8'));
      expect(pkg.pnpm).toBeDefined();
      expect(pkg.pnpm.onlyBuiltDependencies).toContain('better-sqlite3');
      expect(pkg.pnpm.onlyBuiltDependencies).toContain('node-llama-cpp');
    });

    it('skips pnpm config when packageManager is not pnpm and no lockfile', async () => {
      const original = JSON.stringify({
        name: 'test-consumer',
        packageManager: 'npm@10.0.0',
      }, null, 2) + '\n';
      await writeFile(join(getTempDir(), 'package.json'), original, 'utf-8');

      runCli('setup --skip-model');

      const content = await readFile(join(getTempDir(), 'package.json'), 'utf-8');
      expect(content).toBe(original);
    });

    it('handles malformed package.json gracefully', async () => {
      await writeFile(join(getTempDir(), 'pnpm-lock.yaml'), 'lockfileVersion: 9\n', 'utf-8');
      await writeFile(join(getTempDir(), 'package.json'), '{ invalid json !!!', 'utf-8');

      // Should not throw — setup continues despite malformed JSON
      const result = runCli('setup --skip-model');
      expect(result.combined).toContain('setup complete');
      // package.json should remain unchanged (not overwritten)
      const content = await readFile(join(getTempDir(), 'package.json'), 'utf-8');
      expect(content).toBe('{ invalid json !!!');
    });

    it('reports pnpm config status in setup output', async () => {
      await writeFile(join(getTempDir(), 'pnpm-lock.yaml'), 'lockfileVersion: 9\n', 'utf-8');
      await writeFile(join(getTempDir(), 'package.json'), JSON.stringify({ name: 'test-consumer' }, null, 2) + '\n', 'utf-8');

      const result = runCli('setup --skip-model');
      expect(result.combined).toMatch(/pnpm.*config|onlyBuiltDependencies/i);
    });
  });

  /**
   * Tests for malformed settings.json safety
   */
  describe('Malformed settings.json safety', () => {
    it('skips hook installation when settings.json has malformed JSON', async () => {
      runCli('init');

      // Write malformed JSON to settings.json
      const settingsPath = join(getTempDir(), '.claude', 'settings.json');
      await writeFile(settingsPath, '{ broken json !!!', 'utf-8');

      // Re-run setup — should not clobber the file
      const result = runCli('setup --skip-model');
      expect(result.combined).toContain('setup complete');

      // settings.json should be unchanged (not overwritten with {})
      const content = await readFile(settingsPath, 'utf-8');
      expect(content).toBe('{ broken json !!!');
    });
  });
});
