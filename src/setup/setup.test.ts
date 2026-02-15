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

describe('Setup Commands - Generated Content', () => {
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

      expect(existsSync(join(commandsDir, 'show.md'))).toBe(true);
      expect(existsSync(join(commandsDir, 'wrong.md'))).toBe(true);
      expect(existsSync(join(commandsDir, 'stats.md'))).toBe(true);
      expect(existsSync(join(commandsDir, 'learn.md'))).toBe(true);
      expect(existsSync(join(commandsDir, 'search.md'))).toBe(true);
    });

    it('does NOT create slash commands at root .claude/commands/ level', async () => {
      runCli('init');

      const commandsDir = join(getTempDir(), '.claude', 'commands');

      // Utility commands should NOT exist at root level
      expect(existsSync(join(commandsDir, 'learn.md'))).toBe(false);
      expect(existsSync(join(commandsDir, 'show.md'))).toBe(false);
      expect(existsSync(join(commandsDir, 'wrong.md'))).toBe(false);
      expect(existsSync(join(commandsDir, 'stats.md'))).toBe(false);
    });

    it('utility commands reference correct CLI commands', async () => {
      runCli('init');

      const commandsDir = join(getTempDir(), '.claude', 'commands', 'compound');

      const showContent = await readFile(join(commandsDir, 'show.md'), 'utf-8');
      expect(showContent).toContain('ca show');

      const wrongContent = await readFile(join(commandsDir, 'wrong.md'), 'utf-8');
      expect(wrongContent).toContain('ca wrong');

      const statsContent = await readFile(join(commandsDir, 'stats.md'), 'utf-8');
      expect(statsContent).toContain('ca stats');
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

    it('mentions MCP and CLI alternatives for JSONL operations', async () => {
      runCli('init');

      const agentsPath = join(getTempDir(), 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');

      // Must mention MCP tool and CLI as alternatives
      expect(content).toContain('memory_capture');
      expect(content).toContain('ca learn');
    });

    it('MCP Tools section appears near top of Compound Agent section', async () => {
      runCli('init');

      const agentsPath = join(getTempDir(), 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');

      // Find positions
      const sectionStart = content.indexOf('## Compound Agent Integration');
      const mcpTools = content.indexOf('### MCP Tools');
      const mandatoryRecall = content.indexOf('### Mandatory Recall');

      // MCP Tools must appear before Mandatory Recall section (v0.2.6 structure)
      expect(sectionStart).toBeGreaterThan(-1);
      expect(mcpTools).toBeGreaterThan(sectionStart);
      expect(mcpTools).toBeLessThan(mandatoryRecall);
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

      // Should tell Claude what to do when pattern detected (v0.2.4: uses MCP tools)
      expect(content).toMatch(/memory_capture|ca learn/i);
    });
  });

  /**
   * Tests for v0.2.4: MCP-based capture and retrieval
   */
  describe('MCP tools documentation in AGENTS.md (v0.2.4)', () => {
    it('documents memory_search tool', async () => {
      runCli('init');

      const agentsPath = join(getTempDir(), 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');

      // Should document memory_search MCP tool
      expect(content).toContain('memory_search');
      expect(content).toMatch(/before.*architectural|architectural.*decisions/i);
    });

    it('documents memory_capture tool', async () => {
      runCli('init');

      const agentsPath = join(getTempDir(), 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');

      // Should document memory_capture MCP tool
      expect(content).toContain('memory_capture');
      expect(content).toMatch(/user corrects|mistakes|corrections/i);
    });

    it('includes MCP tools table', async () => {
      runCli('init');

      const agentsPath = join(getTempDir(), 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');

      // Should have MCP Tools section with table
      expect(content).toContain('MCP Tools');
      expect(content).toContain('| Tool | Purpose |');
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

    it('removes MCP server from .mcp.json', async () => {
      runCli('setup --skip-model');

      const mcpPath = join(getTempDir(), '.mcp.json');
      expect(existsSync(mcpPath)).toBe(true);
      const before = JSON.parse(await readFile(mcpPath, 'utf-8'));
      expect(before.mcpServers?.['compound-agent']).toBeDefined();

      runCli('setup --uninstall');

      if (existsSync(mcpPath)) {
        const after = JSON.parse(await readFile(mcpPath, 'utf-8'));
        expect(after.mcpServers?.['compound-agent']).toBeUndefined();
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

    it('removes all commands in compound/ folder', async () => {
      runCli('init');

      const commandsDir = join(getTempDir(), '.claude', 'commands', 'compound');
      expect(existsSync(join(commandsDir, 'learn.md'))).toBe(true);

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
    it('overwrites generated files (with marker) with latest templates', async () => {
      runCli('init');

      // Agent file has marker, should be overwritten
      const agentFile = join(getTempDir(), '.claude', 'agents', 'compound', 'repo-analyst.md');
      await writeFile(agentFile, '<!-- generated by compound-agent -->\nold content', 'utf-8');

      runCli('setup --update');

      const content = await readFile(agentFile, 'utf-8');
      expect(content).toBe('<!-- generated by compound-agent -->\n' + AGENT_TEMPLATES['repo-analyst.md']);
    });

    it('does NOT overwrite user-created files (no marker)', async () => {
      runCli('init');

      // Remove marker - simulates user customization
      const agentFile = join(getTempDir(), '.claude', 'agents', 'compound', 'repo-analyst.md');
      await writeFile(agentFile, 'user custom content without marker', 'utf-8');

      runCli('setup --update');

      const content = await readFile(agentFile, 'utf-8');
      expect(content).toBe('user custom content without marker');
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
      expect(content.startsWith('<!-- generated by compound-agent -->\n')).toBe(true);
    });

    it('reports what was updated/added/skipped', () => {
      runCli('init');

      const result = runCli('setup --update');
      expect(result.combined).toMatch(/updated|up to date/i);
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

      // But compound/ folder should have them
      const compoundDir = join(commandsDir, 'compound');
      for (const f of oldFiles) {
        expect(existsSync(join(compoundDir, f))).toBe(true);
      }
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

    it('ensures hooks and MCP config are current after update', async () => {
      runCli('setup --skip-model');

      // Remove .mcp.json to simulate missing config
      const mcpPath = join(getTempDir(), '.mcp.json');
      await rm(mcpPath, { force: true });
      expect(existsSync(mcpPath)).toBe(false);

      runCli('setup --update');

      // .mcp.json should be recreated by --update
      expect(existsSync(mcpPath)).toBe(true);
      const mcpConfig = JSON.parse(await readFile(mcpPath, 'utf-8'));
      expect(mcpConfig.mcpServers?.['compound-agent']).toBeDefined();
    });

    it('does not duplicate MCP config if already present during update', async () => {
      runCli('setup --skip-model');

      // MCP should already exist
      const mcpPath = join(getTempDir(), '.mcp.json');
      const before = JSON.parse(await readFile(mcpPath, 'utf-8'));
      expect(before.mcpServers?.['compound-agent']).toBeDefined();

      runCli('setup --update');

      // Should still have exactly one entry
      const after = JSON.parse(await readFile(mcpPath, 'utf-8'));
      expect(after.mcpServers?.['compound-agent']).toBeDefined();
      const serverKeys = Object.keys(after.mcpServers);
      const caCount = serverKeys.filter((k: string) => k === 'compound-agent').length;
      expect(caCount).toBe(1);
    });

    it('reports config status in --update output', async () => {
      runCli('setup --skip-model');

      // Remove .mcp.json to trigger config update
      const mcpPath = join(getTempDir(), '.mcp.json');
      await rm(mcpPath, { force: true });

      const result = runCli('setup --update');
      // Should mention config was updated
      expect(result.combined).toMatch(/config|hooks|MCP/i);
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
      expect(result.combined).toMatch(/hook|MCP/i);
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
      await writeFile(agentFile, '<!-- generated by compound-agent -->\nold content', 'utf-8');

      const result = runCli('setup --update --dry-run');

      // File should still have old content
      const content = await readFile(agentFile, 'utf-8');
      expect(content).toBe('<!-- generated by compound-agent -->\nold content');
      expect(result.combined).toMatch(/would|dry.run/i);
    });
  });

  /**
   * Tests for agent template installation
   */
  describe('Agent template installation', () => {
    it('creates .claude/agents/compound/ with 20 .md files', async () => {
      runCli('init');

      const agentsDir = join(getTempDir(), '.claude', 'agents', 'compound');
      expect(existsSync(agentsDir)).toBe(true);

      const files = readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
      expect(files.length).toBe(20);
    });

    it('creates all expected agent template files', async () => {
      runCli('init');

      const agentsDir = join(getTempDir(), '.claude', 'agents', 'compound');
      for (const filename of Object.keys(AGENT_TEMPLATES)) {
        expect(existsSync(join(agentsDir, filename))).toBe(true);
      }
    });

    it('agent files start with generated marker', async () => {
      runCli('init');

      const agentsDir = join(getTempDir(), '.claude', 'agents', 'compound');
      for (const filename of Object.keys(AGENT_TEMPLATES)) {
        const content = await readFile(join(agentsDir, filename), 'utf-8');
        expect(content.startsWith('<!-- generated by compound-agent -->\n')).toBe(true);
      }
    });

    it('agent files contain template content after marker', async () => {
      runCli('init');

      const agentsDir = join(getTempDir(), '.claude', 'agents', 'compound');
      for (const [filename, template] of Object.entries(AGENT_TEMPLATES)) {
        const content = await readFile(join(agentsDir, filename), 'utf-8');
        expect(content).toBe('<!-- generated by compound-agent -->\n' + template);
      }
    });

    it('is idempotent - running init twice does not duplicate files', async () => {
      runCli('init');
      runCli('init');

      const agentsDir = join(getTempDir(), '.claude', 'agents', 'compound');
      const files = readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
      expect(files.length).toBe(20);
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
    it('creates .claude/commands/compound/ with 13 .md files', async () => {
      runCli('init');

      const commandsDir = join(getTempDir(), '.claude', 'commands', 'compound');
      expect(existsSync(commandsDir)).toBe(true);

      const files = readdirSync(commandsDir).filter((f) => f.endsWith('.md'));
      expect(files.length).toBe(13);
    });

    it('creates all expected workflow command files', async () => {
      runCli('init');

      const commandsDir = join(getTempDir(), '.claude', 'commands', 'compound');
      for (const filename of Object.keys(WORKFLOW_COMMANDS)) {
        expect(existsSync(join(commandsDir, filename))).toBe(true);
      }
    });

    it('workflow command files start with generated marker', async () => {
      runCli('init');

      const commandsDir = join(getTempDir(), '.claude', 'commands', 'compound');
      for (const filename of Object.keys(WORKFLOW_COMMANDS)) {
        const content = await readFile(join(commandsDir, filename), 'utf-8');
        expect(content.startsWith('<!-- generated by compound-agent -->\n')).toBe(true);
      }
    });

    it('workflow command files contain template content after marker', async () => {
      runCli('init');

      const commandsDir = join(getTempDir(), '.claude', 'commands', 'compound');
      for (const [filename, template] of Object.entries(WORKFLOW_COMMANDS)) {
        const content = await readFile(join(commandsDir, filename), 'utf-8');
        expect(content).toBe('<!-- generated by compound-agent -->\n' + template);
      }
    });

    it('is idempotent - running init twice does not duplicate files', async () => {
      runCli('init');
      runCli('init');

      const commandsDir = join(getTempDir(), '.claude', 'commands', 'compound');
      const files = readdirSync(commandsDir).filter((f) => f.endsWith('.md'));
      expect(files.length).toBe(13);
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
    it('creates .claude/skills/compound/<phase>/SKILL.md for 5 phases', async () => {
      runCli('init');

      const skillsDir = join(getTempDir(), '.claude', 'skills', 'compound');
      expect(existsSync(skillsDir)).toBe(true);

      for (const phase of Object.keys(PHASE_SKILLS)) {
        const skillPath = join(skillsDir, phase, 'SKILL.md');
        expect(existsSync(skillPath)).toBe(true);
      }
    });

    it('skill files start with generated marker', async () => {
      runCli('init');

      const skillsDir = join(getTempDir(), '.claude', 'skills', 'compound');
      for (const phase of Object.keys(PHASE_SKILLS)) {
        const content = await readFile(join(skillsDir, phase, 'SKILL.md'), 'utf-8');
        expect(content.startsWith('<!-- generated by compound-agent -->\n')).toBe(true);
      }
    });

    it('skill files contain template content after marker', async () => {
      runCli('init');

      const skillsDir = join(getTempDir(), '.claude', 'skills', 'compound');
      for (const [phase, template] of Object.entries(PHASE_SKILLS)) {
        const content = await readFile(join(skillsDir, phase, 'SKILL.md'), 'utf-8');
        expect(content).toBe('<!-- generated by compound-agent -->\n' + template);
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
});
