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

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { setupCliTestContext } from '../test-utils.js';

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

    it('creates additional slash commands (show, wrong, stats)', async () => {
      runCli('init');

      const commandsDir = join(getTempDir(), '.claude', 'commands');

      // Check for additional commands
      expect(existsSync(join(commandsDir, 'show.md'))).toBe(true);
      expect(existsSync(join(commandsDir, 'wrong.md'))).toBe(true);
      expect(existsSync(join(commandsDir, 'stats.md'))).toBe(true);
    });

    it('slash commands reference correct CLI commands', async () => {
      runCli('init');

      const commandsDir = join(getTempDir(), '.claude', 'commands');

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
});
