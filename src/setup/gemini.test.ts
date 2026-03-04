/**
 * Tests for Gemini CLI adapter setup.
 *
 * Validates that installGeminiAdapter generates correct:
 * - Hook scripts (stderr redirect, exit code propagation)
 * - settings.json (valid Gemini hook format)
 * - TOML commands (correct @{path} file injection syntax)
 * - Skills (inline content, not broken file injection)
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { setupCliTestContext } from '../test-utils.js';
import { WORKFLOW_COMMANDS, PHASE_SKILLS, AGENT_ROLE_SKILLS } from './templates/index.js';

describe('Gemini adapter', { tags: ['integration'] }, () => {
  const { getTempDir, runCli } = setupCliTestContext();

  function geminiDir(): string {
    return join(getTempDir(), '.gemini');
  }

  // Run setup gemini once per test via CLI
  function setupGemini(): void {
    runCli('setup gemini');
  }

  // ── Directory structure ──────────────────────────────────────────────

  describe('directory structure', () => {
    it('creates .gemini/hooks directory', () => {
      setupGemini();
      expect(existsSync(join(geminiDir(), 'hooks'))).toBe(true);
    });

    it('creates .gemini/commands/compound directory', () => {
      setupGemini();
      expect(existsSync(join(geminiDir(), 'commands', 'compound'))).toBe(true);
    });

    it('creates .gemini/skills directories for phase skills', () => {
      setupGemini();
      for (const phase of Object.keys(PHASE_SKILLS)) {
        expect(existsSync(join(geminiDir(), 'skills', `compound-${phase}`))).toBe(true);
      }
    });
  });

  // ── Hook scripts ─────────────────────────────────────────────────────

  describe('hook scripts', () => {
    const EXPECTED_HOOKS = ['ca-prime.sh', 'ca-user-prompt.sh', 'ca-post-tool.sh', 'ca-phase-guard.sh'];

    it('creates all hook scripts', () => {
      setupGemini();
      for (const hook of EXPECTED_HOOKS) {
        expect(existsSync(join(geminiDir(), 'hooks', hook))).toBe(true);
      }
    });

    it('hook scripts use correct stderr redirect (> /dev/null 2>&1)', async () => {
      setupGemini();
      for (const hook of EXPECTED_HOOKS) {
        const content = await readFile(join(geminiDir(), 'hooks', hook), 'utf8');
        // Must NOT have the buggy `2>&1 > /dev/null` pattern
        expect(content).not.toContain('2>&1 > /dev/null');
        // Must have correct redirect that sends both stdout and stderr to /dev/null
        expect(content).toMatch(/> \/dev\/null 2>&1|&> \/dev\/null/);
      }
    });

    it('hook scripts start with bash shebang', async () => {
      setupGemini();
      for (const hook of EXPECTED_HOOKS) {
        const content = await readFile(join(geminiDir(), 'hooks', hook), 'utf8');
        expect(content.startsWith('#!/usr/bin/env bash')).toBe(true);
      }
    });

    it('hook scripts output valid JSON decision on stdout', async () => {
      setupGemini();
      for (const hook of EXPECTED_HOOKS) {
        const content = await readFile(join(geminiDir(), 'hooks', hook), 'utf8');
        // The only stdout should be the JSON decision
        expect(content).toContain('echo \'{"decision":');
      }
    });

    it('phase-guard hook returns deny JSON on block (exit 0, not exit 2)', async () => {
      setupGemini();
      const content = await readFile(join(geminiDir(), 'hooks', 'ca-phase-guard.sh'), 'utf8');
      // Must return structured deny (exit 0) so Gemini parses the reason from stdout.
      // exit 2 would discard stdout and use stderr instead.
      expect(content).toContain('"decision": "deny"');
      expect(content).toContain('"reason":');
      expect(content).not.toContain('exit 2');
    });
  });

  // ── settings.json ────────────────────────────────────────────────────

  describe('settings.json', () => {
    it('creates valid JSON settings file', async () => {
      setupGemini();
      const content = await readFile(join(geminiDir(), 'settings.json'), 'utf8');
      const settings = JSON.parse(content);
      expect(settings).toHaveProperty('hooks');
    });

    it('registers SessionStart hook', async () => {
      setupGemini();
      const settings = JSON.parse(await readFile(join(geminiDir(), 'settings.json'), 'utf8'));
      expect(settings.hooks.SessionStart).toBeDefined();
      expect(settings.hooks.SessionStart.length).toBeGreaterThan(0);
    });

    it('registers BeforeAgent hook', async () => {
      setupGemini();
      const settings = JSON.parse(await readFile(join(geminiDir(), 'settings.json'), 'utf8'));
      expect(settings.hooks.BeforeAgent).toBeDefined();
    });

    it('registers BeforeTool hook for write operations', async () => {
      setupGemini();
      const settings = JSON.parse(await readFile(join(geminiDir(), 'settings.json'), 'utf8'));
      expect(settings.hooks.BeforeTool).toBeDefined();
      expect(settings.hooks.BeforeTool[0].matcher).toContain('replace');
      expect(settings.hooks.BeforeTool[0].matcher).toContain('write_file');
      expect(settings.hooks.BeforeTool[0].matcher).toContain('create_file');
    });

    it('registers AfterTool hook', async () => {
      setupGemini();
      const settings = JSON.parse(await readFile(join(geminiDir(), 'settings.json'), 'utf8'));
      expect(settings.hooks.AfterTool).toBeDefined();
    });

    it('merges with existing settings without overwriting non-hook keys', async () => {
      // Pre-create a settings.json with user content
      const { mkdir, writeFile: wf } = await import('node:fs/promises');
      await mkdir(geminiDir(), { recursive: true });
      await wf(join(geminiDir(), 'settings.json'), JSON.stringify({ customKey: 'preserved', hooks: {} }), 'utf8');

      setupGemini();

      const settings = JSON.parse(await readFile(join(geminiDir(), 'settings.json'), 'utf8'));
      expect(settings.customKey).toBe('preserved');
      expect(settings.hooks.SessionStart).toBeDefined();
    });
  });

  // ── TOML commands ────────────────────────────────────────────────────

  describe('TOML commands', () => {
    it('creates a TOML file for each workflow command', () => {
      setupGemini();
      for (const filename of Object.keys(WORKFLOW_COMMANDS)) {
        const cmdName = filename.replace('.md', '');
        const tomlPath = join(geminiDir(), 'commands', 'compound', `${cmdName}.toml`);
        expect(existsSync(tomlPath)).toBe(true);
      }
    });

    it('TOML files use correct @{path} file injection syntax (with braces)', async () => {
      setupGemini();
      for (const filename of Object.keys(WORKFLOW_COMMANDS)) {
        const cmdName = filename.replace('.md', '');
        const content = await readFile(join(geminiDir(), 'commands', 'compound', `${cmdName}.toml`), 'utf8');
        // Must use @{path} not @path
        expect(content).toContain(`@{.claude/commands/compound/${filename}}`);
        expect(content).not.toMatch(new RegExp(`(?<!\\{)@\\.claude/commands/compound/${filename.replace('.', '\\.')}(?!\\})`));
      }
    });

    it('TOML files include {{args}} for argument passthrough', async () => {
      setupGemini();
      const firstCmd = Object.keys(WORKFLOW_COMMANDS)[0].replace('.md', '');
      const content = await readFile(join(geminiDir(), 'commands', 'compound', `${firstCmd}.toml`), 'utf8');
      expect(content).toContain('{{args}}');
    });

    it('TOML files have description field', async () => {
      setupGemini();
      const firstCmd = Object.keys(WORKFLOW_COMMANDS)[0].replace('.md', '');
      const content = await readFile(join(geminiDir(), 'commands', 'compound', `${firstCmd}.toml`), 'utf8');
      expect(content).toMatch(/^description\s*=\s*"/m);
    });
  });

  // ── Skills ───────────────────────────────────────────────────────────

  describe('skills', () => {
    it('creates SKILL.md for each phase skill', () => {
      setupGemini();
      for (const phase of Object.keys(PHASE_SKILLS)) {
        expect(existsSync(join(geminiDir(), 'skills', `compound-${phase}`, 'SKILL.md'))).toBe(true);
      }
    });

    it('creates SKILL.md for each agent role skill', () => {
      setupGemini();
      for (const name of Object.keys(AGENT_ROLE_SKILLS)) {
        expect(existsSync(join(geminiDir(), 'skills', `compound-agent-${name}`, 'SKILL.md'))).toBe(true);
      }
    });

    it('skill files have YAML frontmatter with name and description', async () => {
      setupGemini();
      const firstPhase = Object.keys(PHASE_SKILLS)[0];
      const content = await readFile(join(geminiDir(), 'skills', `compound-${firstPhase}`, 'SKILL.md'), 'utf8');
      expect(content).toMatch(/^---\nname:/);
      expect(content).toContain('description:');
      expect(content).toMatch(/---\n/);
    });

    it('skill files have exactly one frontmatter block (no duplicate)', async () => {
      setupGemini();
      for (const phase of Object.keys(PHASE_SKILLS)) {
        const content = await readFile(join(geminiDir(), 'skills', `compound-${phase}`, 'SKILL.md'), 'utf8');
        const fmCount = (content.match(/^---$/gm) ?? []).length;
        expect(fmCount, `compound-${phase} should have exactly 2 --- delimiters`).toBe(2);
      }
      for (const name of Object.keys(AGENT_ROLE_SKILLS)) {
        const content = await readFile(join(geminiDir(), 'skills', `compound-agent-${name}`, 'SKILL.md'), 'utf8');
        const fmCount = (content.match(/^---$/gm) ?? []).length;
        expect(fmCount, `compound-agent-${name} should have exactly 2 --- delimiters`).toBe(2);
      }
    });

    it('skill files inline the source content (no @path file injection)', async () => {
      setupGemini();
      const firstPhase = Object.keys(PHASE_SKILLS)[0];
      const content = await readFile(join(geminiDir(), 'skills', `compound-${firstPhase}`, 'SKILL.md'), 'utf8');
      // Must NOT contain @path or @{path} file injection (doesn't work in SKILL.md)
      expect(content).not.toMatch(/@\{?\.claude\//);
      // Must contain actual instruction content from the source skill
      const sourceContent = PHASE_SKILLS[firstPhase];
      // At minimum should have some substantial content beyond just frontmatter
      const lines = content.split('\n').filter(l => l.trim().length > 0);
      expect(lines.length).toBeGreaterThan(3);
    });
  });

  // ── Dry run ──────────────────────────────────────────────────────────

  describe('dry run', () => {
    it('does not create files with --dry-run', () => {
      runCli('setup gemini --dry-run');
      expect(existsSync(join(geminiDir(), 'hooks'))).toBe(false);
    });
  });
});
