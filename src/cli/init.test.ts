/**
 * CLI tests for the init command.
 */

import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appendLesson, LESSONS_PATH } from '../storage/jsonl.js';
import { createQuickLesson } from '../test-utils.js';
import { cleanupCliTestDir, runCli, setupCliTestDir } from './cli-test-utils.js';

describe('CLI', { tags: ['integration'] }, () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupCliTestDir();
  });

  afterEach(async () => {
    await cleanupCliTestDir(tempDir);
  });

  describe('init command', () => {
    it('creates .claude/lessons directory structure', async () => {
      runCli('init', tempDir);

      const lessonsDir = join(tempDir, '.claude', 'lessons');
      const dirs = await readdir(join(tempDir, '.claude'));
      expect(dirs).toContain('lessons');
    });

    it('creates empty index.jsonl file', async () => {
      runCli('init', tempDir);

      const indexPath = join(tempDir, LESSONS_PATH);
      const content = await readFile(indexPath, 'utf-8');
      expect(content.trim()).toBe('');
    });

    it('creates AGENTS.md with Learning Agent section', async () => {
      runCli('init', tempDir);

      const agentsPath = join(tempDir, 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');
      expect(content).toContain('Learning Agent Integration');
      // v0.2.4: uses MCP tools instead of CLI commands
      expect(content).toContain('lesson_search');
      expect(content).toContain('lesson_capture');
    });

    it('AGENTS.md template includes explicit plan-time instructions', async () => {
      runCli('init', tempDir);

      const agentsPath = join(tempDir, 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');

      // v0.2.4: uses Mandatory Recall section and MCP tools
      expect(content).toContain('Mandatory Recall');
      expect(content).toContain('lesson_search');
      expect(content).toMatch(/MUST\s+use/i);
    });

    it('appends to existing AGENTS.md without duplicating', async () => {
      const agentsPath = join(tempDir, 'AGENTS.md');
      await writeFile(agentsPath, '# Existing Content\n\nSome existing instructions.\n');

      runCli('init', tempDir);

      const content = await readFile(agentsPath, 'utf-8');
      expect(content).toContain('Existing Content');
      expect(content).toContain('Learning Agent Integration');
    });

    it('is idempotent - does not duplicate section on re-run', async () => {
      runCli('init', tempDir);
      runCli('init', tempDir);

      const agentsPath = join(tempDir, 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');

      const matches = content.match(/## Learning Agent Integration/g);
      expect(matches?.length).toBe(1);
    });

    it('respects --skip-agents flag', async () => {
      runCli('init --skip-agents', tempDir);

      const lessonsDir = join(tempDir, '.claude', 'lessons');
      const dirs = await readdir(join(tempDir, '.claude'));
      expect(dirs).toContain('lessons');

      const agentsPath = join(tempDir, 'AGENTS.md');
      let agentsExists = true;
      try {
        await readFile(agentsPath, 'utf-8');
      } catch {
        agentsExists = false;
      }
      expect(agentsExists).toBe(false);
    });

    it('shows success message', () => {
      const { combined } = runCli('init', tempDir);
      expect(combined).toMatch(/initialized|created|success/i);
    });

    it('respects --quiet flag', () => {
      const { combined } = runCli('init --quiet', tempDir);
      expect(combined.length).toBeLessThan(100);
    });

    it('does not overwrite existing lessons', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'existing lesson'));

      runCli('init', tempDir);

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('existing lesson');
    });

    it('outputs JSON with --json flag', () => {
      const { stdout } = runCli('init --json', tempDir);
      const result = JSON.parse(stdout) as { initialized: boolean; lessonsDir: string; agentsMd: boolean };
      expect(result.initialized).toBe(true);
      expect(result.lessonsDir).toContain('.claude/lessons');
      expect(result.agentsMd).toBe(true);
    });

    it('installs pre-commit hook in .git/hooks', async () => {
      const gitHooksDir = join(tempDir, '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      runCli('init', tempDir);

      const hookPath = join(gitHooksDir, 'pre-commit');
      const hookExists = existsSync(hookPath);
      expect(hookExists).toBe(true);
    });

    it('creates executable pre-commit hook', async () => {
      const gitHooksDir = join(tempDir, '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      runCli('init', tempDir);

      const hookPath = join(gitHooksDir, 'pre-commit');
      const stats = statSync(hookPath);
      expect(stats.mode & 0o111).toBeGreaterThan(0);
    });

    it('pre-commit hook calls lna hooks run', async () => {
      const gitHooksDir = join(tempDir, '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      runCli('init', tempDir);

      const hookPath = join(gitHooksDir, 'pre-commit');
      const content = await readFile(hookPath, 'utf-8');
      expect(content).toContain('lna');
      expect(content).toContain('hooks run pre-commit');
    });

    it('does not duplicate pre-commit hook on re-run', async () => {
      const gitHooksDir = join(tempDir, '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      runCli('init', tempDir);
      runCli('init', tempDir);

      const hookPath = join(gitHooksDir, 'pre-commit');
      const content = await readFile(hookPath, 'utf-8');
      const shebangs = content.match(/#!/g);
      expect(shebangs?.length).toBe(1);
    });

    it('skips hook installation if .git/hooks does not exist', async () => {
      const { combined } = runCli('init', tempDir);

      expect(combined).toMatch(/initialized|created|success/i);

      const hookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
      expect(existsSync(hookPath)).toBe(false);
    });

    it('--skip-hooks flag skips hook installation', async () => {
      const gitHooksDir = join(tempDir, '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      runCli('init --skip-hooks', tempDir);

      const hookPath = join(gitHooksDir, 'pre-commit');
      expect(existsSync(hookPath)).toBe(false);
    });

    it('JSON output includes hooks field', async () => {
      const gitHooksDir = join(tempDir, '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      const { stdout } = runCli('init --json', tempDir);
      const result = JSON.parse(stdout) as { hooks: boolean };
      expect(result.hooks).toBe(true);
    });

    it('appends to existing hook without overwriting original content', async () => {
      const gitHooksDir = join(tempDir, '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      const hookPath = join(gitHooksDir, 'pre-commit');
      const existingContent = '#!/bin/sh\necho "existing hook"\npnpm test\n';
      await writeFile(hookPath, existingContent);

      runCli('init', tempDir);

      const newContent = await readFile(hookPath, 'utf-8');
      expect(newContent).toContain('existing hook');
      expect(newContent).toContain('pnpm test');
      expect(newContent).toContain('Learning Agent');
      expect(newContent).toContain('lna hooks run');
    });

    it('does not modify hook that already has Learning Agent marker', async () => {
      const gitHooksDir = join(tempDir, '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      const hookPath = join(gitHooksDir, 'pre-commit');
      const contentWithMarker = '#!/bin/sh\n# Learning Agent pre-commit hook\nnpx lna hooks run pre-commit\n';
      await writeFile(hookPath, contentWithMarker);

      runCli('init', tempDir);

      const newContent = await readFile(hookPath, 'utf-8');
      expect(newContent).toBe(contentWithMarker);
    });

    it('respects core.hooksPath configuration', async () => {
      const customHooksDir = join(tempDir, 'custom-hooks');
      await mkdir(customHooksDir, { recursive: true });

      await mkdir(join(tempDir, '.git'), { recursive: true });
      await writeFile(join(tempDir, '.git', 'config'), `[core]\n\thooksPath = custom-hooks\n`);

      runCli('init', tempDir);

      const customHookPath = join(customHooksDir, 'pre-commit');
      const defaultHookPath = join(tempDir, '.git', 'hooks', 'pre-commit');

      expect(existsSync(customHookPath)).toBe(true);
      expect(existsSync(defaultHookPath)).toBe(false);
    });

    it('handles absolute core.hooksPath', async () => {
      const customHooksDir = join(tempDir, 'absolute-hooks');
      await mkdir(customHooksDir, { recursive: true });

      await mkdir(join(tempDir, '.git'), { recursive: true });
      await writeFile(join(tempDir, '.git', 'config'), `[core]\n\thooksPath = ${customHooksDir}\n`);

      runCli('init', tempDir);

      const customHookPath = join(customHooksDir, 'pre-commit');
      expect(existsSync(customHookPath)).toBe(true);
    });

    describe('pre-commit hook insertion edge cases', () => {
      it('inserts hook BEFORE top-level exit 0 statement', async () => {
        const gitHooksDir = join(tempDir, '.git', 'hooks');
        await mkdir(gitHooksDir, { recursive: true });

        const hookPath = join(gitHooksDir, 'pre-commit');
        const existingContent = '#!/bin/sh\necho "running tests"\npnpm test\nexit 0\n';
        await writeFile(hookPath, existingContent);

        runCli('init', tempDir);

        const newContent = await readFile(hookPath, 'utf-8');
        const lines = newContent.split('\n');

        const learningAgentLine = lines.findIndex((line) => line.includes('lna hooks run'));
        const exitLine = lines.findIndex((line) => line.trim() === 'exit 0');

        expect(learningAgentLine).toBeGreaterThan(-1);
        expect(exitLine).toBeGreaterThan(-1);
        expect(learningAgentLine).toBeLessThan(exitLine);
      });

      it('inserts hook BEFORE exit 1 statement', async () => {
        const gitHooksDir = join(tempDir, '.git', 'hooks');
        await mkdir(gitHooksDir, { recursive: true });

        const hookPath = join(gitHooksDir, 'pre-commit');
        const existingContent = '#!/bin/sh\nif ! pnpm test; then\n  echo "Tests failed"\n  exit 1\nfi\n';
        await writeFile(hookPath, existingContent);

        runCli('init', tempDir);

        const newContent = await readFile(hookPath, 'utf-8');
        const lines = newContent.split('\n');

        const learningAgentLine = lines.findIndex((line) => line.includes('lna hooks run'));
        const exitLine = lines.findIndex((line) => line.trim() === 'exit 1');

        expect(learningAgentLine).toBeGreaterThan(-1);
        expect(exitLine).toBeGreaterThan(-1);
        expect(learningAgentLine).toBeLessThan(exitLine);
      });

      it('inserts hook BEFORE exit with variable (exit $STATUS)', async () => {
        const gitHooksDir = join(tempDir, '.git', 'hooks');
        await mkdir(gitHooksDir, { recursive: true });

        const hookPath = join(gitHooksDir, 'pre-commit');
        const existingContent = '#!/bin/sh\nSTATUS=0\npnpm test || STATUS=1\nexit $STATUS\n';
        await writeFile(hookPath, existingContent);

        runCli('init', tempDir);

        const newContent = await readFile(hookPath, 'utf-8');
        const lines = newContent.split('\n');

        const learningAgentLine = lines.findIndex((line) => line.includes('lna hooks run'));
        const exitLine = lines.findIndex((line) => line.trim().startsWith('exit $'));

        expect(learningAgentLine).toBeGreaterThan(-1);
        expect(exitLine).toBeGreaterThan(-1);
        expect(learningAgentLine).toBeLessThan(exitLine);
      });

      it('inserts hook BEFORE first top-level exit when multiple exist', async () => {
        const gitHooksDir = join(tempDir, '.git', 'hooks');
        await mkdir(gitHooksDir, { recursive: true });

        const hookPath = join(gitHooksDir, 'pre-commit');
        const existingContent = '#!/bin/sh\npnpm lint\nif [ $? -eq 0 ]; then\n  exit 0\nfi\nexit 1\n';
        await writeFile(hookPath, existingContent);

        runCli('init', tempDir);

        const newContent = await readFile(hookPath, 'utf-8');
        const lines = newContent.split('\n');

        const learningAgentLine = lines.findIndex((line) => line.includes('lna hooks run'));
        const firstExitLine = lines.findIndex((line) => line.trim() === 'exit 0');

        expect(learningAgentLine).toBeGreaterThan(-1);
        expect(firstExitLine).toBeGreaterThan(-1);
        expect(learningAgentLine).toBeLessThan(firstExitLine);
      });

      it('appends hook at end when no exit statement exists', async () => {
        const gitHooksDir = join(tempDir, '.git', 'hooks');
        await mkdir(gitHooksDir, { recursive: true });

        const hookPath = join(gitHooksDir, 'pre-commit');
        const existingContent = '#!/bin/sh\necho "running tests"\npnpm test\n';
        await writeFile(hookPath, existingContent);

        runCli('init', tempDir);

        const newContent = await readFile(hookPath, 'utf-8');
        const lines = newContent.split('\n');

        const learningAgentLine = lines.findIndex((line) => line.includes('lna hooks run'));
        const lastContentLine = lines.findIndex((line) => line.includes('pnpm test'));

        expect(learningAgentLine).toBeGreaterThan(-1);
        expect(learningAgentLine).toBeGreaterThan(lastContentLine);
      });

      it('ignores exit inside function definition', async () => {
        const gitHooksDir = join(tempDir, '.git', 'hooks');
        await mkdir(gitHooksDir, { recursive: true });

        const hookPath = join(gitHooksDir, 'pre-commit');
        const existingContent = `#!/bin/sh
check_format() {
  if ! pnpm format:check; then
    exit 1
  fi
}
check_format
exit 0
`;
        await writeFile(hookPath, existingContent);

        runCli('init', tempDir);

        const newContent = await readFile(hookPath, 'utf-8');
        const lines = newContent.split('\n');

        const learningAgentLine = lines.findIndex((line) => line.includes('lna hooks run'));
        const functionExitLine = lines.findIndex((line) => line.trim() === 'exit 1');
        const topLevelExitLine = lines.findIndex((line) => line.trim() === 'exit 0');

        expect(learningAgentLine).toBeGreaterThan(-1);
        expect(topLevelExitLine).toBeGreaterThan(-1);
        expect(learningAgentLine).toBeLessThan(topLevelExitLine);
        expect(learningAgentLine).toBeGreaterThan(functionExitLine);
      });

      it('ignores exit in heredoc', async () => {
        const gitHooksDir = join(tempDir, '.git', 'hooks');
        await mkdir(gitHooksDir, { recursive: true });

        const hookPath = join(gitHooksDir, 'pre-commit');
        const existingContent = `#!/bin/sh
cat <<'EOF'
To exit, run: exit 0
EOF
pnpm test
exit 0
`;
        await writeFile(hookPath, existingContent);

        runCli('init', tempDir);

        const newContent = await readFile(hookPath, 'utf-8');
        const lines = newContent.split('\n');

        const learningAgentLine = lines.findIndex((line) => line.includes('lna hooks run'));
        let topLevelExitLine = -1;
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i].trim() === 'exit 0') {
            topLevelExitLine = i;
            break;
          }
        }

        expect(learningAgentLine).toBeGreaterThan(-1);
        expect(topLevelExitLine).toBeGreaterThan(-1);
        expect(learningAgentLine).toBeLessThan(topLevelExitLine);
      });

      it('remains idempotent when run twice with exit statements', async () => {
        const gitHooksDir = join(tempDir, '.git', 'hooks');
        await mkdir(gitHooksDir, { recursive: true });

        const hookPath = join(gitHooksDir, 'pre-commit');
        const existingContent = '#!/bin/sh\npnpm test\nexit 0\n';
        await writeFile(hookPath, existingContent);

        runCli('init', tempDir);
        runCli('init', tempDir);

        const newContent = await readFile(hookPath, 'utf-8');

        const matches = newContent.match(/lna hooks run pre-commit/g);
        expect(matches?.length).toBe(1);

        const lines = newContent.split('\n');
        const learningAgentLine = lines.findIndex((line) => line.includes('lna hooks run'));
        const exitLine = lines.findIndex((line) => line.trim() === 'exit 0');
        expect(learningAgentLine).toBeLessThan(exitLine);
      });
    });
  });

  describe('init command - Claude hooks integration (v0.2.1)', () => {
    describe('Claude hooks default behavior', () => {
      it('init creates Claude hooks by default in project settings', async () => {
        await mkdir(join(tempDir, '.claude'), { recursive: true });

        runCli('init', tempDir);

        const settingsPath = join(tempDir, '.claude', 'settings.json');
        expect(existsSync(settingsPath)).toBe(true);

        const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));
        expect(settings.hooks).toBeDefined();
        expect(settings.hooks.SessionStart).toBeDefined();
        expect(settings.hooks.SessionStart.length).toBeGreaterThan(0);

        const hookEntry = settings.hooks.SessionStart[0];
        expect(hookEntry.hooks[0].command).toContain('lna');
        // v0.2.4: uses prime instead of load-session
        expect(hookEntry.hooks[0].command).toContain('prime');
      });

      it('init creates Claude hooks even if .claude directory does not exist', async () => {
        runCli('init', tempDir);

        const claudeDir = join(tempDir, '.claude');
        expect(existsSync(claudeDir)).toBe(true);

        const settingsPath = join(claudeDir, 'settings.json');
        expect(existsSync(settingsPath)).toBe(true);

        const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));
        expect(settings.hooks.SessionStart).toBeDefined();
        expect(settings.hooks.SessionStart.length).toBeGreaterThan(0);
      });

      it('init uses project-local scope, not global', async () => {
        const mockHome = join(tempDir, 'mock-home');
        await mkdir(join(mockHome, '.claude'), { recursive: true });
        await mkdir(join(tempDir, '.claude'), { recursive: true });

        const cliPath = join(process.cwd(), 'dist', 'cli.js');
        execSync(`node ${cliPath} init 2>&1`, {
          cwd: tempDir,
          encoding: 'utf-8',
          env: { ...process.env, HOME: mockHome, LEARNING_AGENT_ROOT: tempDir },
        });

        const projectSettings = join(tempDir, '.claude', 'settings.json');
        expect(existsSync(projectSettings)).toBe(true);

        const globalSettings = join(mockHome, '.claude', 'settings.json');
        expect(existsSync(globalSettings)).toBe(false);
      });
    });

    describe('--skip-claude flag', () => {
      it('init --skip-claude does NOT create Claude hooks', async () => {
        await mkdir(join(tempDir, '.claude'), { recursive: true });

        runCli('init --skip-claude', tempDir);

        const settingsPath = join(tempDir, '.claude', 'settings.json');
        expect(existsSync(settingsPath)).toBe(false);
      });

      it('init --skip-claude still creates lessons directory and AGENTS.md', async () => {
        runCli('init --skip-claude', tempDir);

        const lessonsDir = join(tempDir, '.claude', 'lessons');
        expect(existsSync(lessonsDir)).toBe(true);

        const agentsPath = join(tempDir, 'AGENTS.md');
        expect(existsSync(agentsPath)).toBe(true);

        const settingsPath = join(tempDir, '.claude', 'settings.json');
        expect(existsSync(settingsPath)).toBe(false);
      });
    });

    describe('skip flags independence', () => {
      it('--skip-agents does not affect Claude hooks', async () => {
        await mkdir(join(tempDir, '.claude'), { recursive: true });

        runCli('init --skip-agents', tempDir);

        const agentsPath = join(tempDir, 'AGENTS.md');
        expect(existsSync(agentsPath)).toBe(false);

        const settingsPath = join(tempDir, '.claude', 'settings.json');
        expect(existsSync(settingsPath)).toBe(true);

        const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));
        expect(settings.hooks.SessionStart).toBeDefined();
      });

      it('--skip-hooks (git) does not affect Claude hooks', async () => {
        await mkdir(join(tempDir, '.git', 'hooks'), { recursive: true });
        await mkdir(join(tempDir, '.claude'), { recursive: true });

        runCli('init --skip-hooks', tempDir);

        const gitHookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
        expect(existsSync(gitHookPath)).toBe(false);

        const settingsPath = join(tempDir, '.claude', 'settings.json');
        expect(existsSync(settingsPath)).toBe(true);

        const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));
        expect(settings.hooks.SessionStart).toBeDefined();
      });

      it('--skip-hooks --skip-claude skips both git and Claude hooks', async () => {
        await mkdir(join(tempDir, '.git', 'hooks'), { recursive: true });
        await mkdir(join(tempDir, '.claude'), { recursive: true });

        runCli('init --skip-hooks --skip-claude', tempDir);

        const gitHookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
        expect(existsSync(gitHookPath)).toBe(false);

        const settingsPath = join(tempDir, '.claude', 'settings.json');
        expect(existsSync(settingsPath)).toBe(false);

        const lessonsDir = join(tempDir, '.claude', 'lessons');
        expect(existsSync(lessonsDir)).toBe(true);
      });

      it('all three skip flags can be combined', async () => {
        runCli('init --skip-agents --skip-hooks --skip-claude', tempDir);

        const lessonsDir = join(tempDir, '.claude', 'lessons');
        expect(existsSync(lessonsDir)).toBe(true);

        const agentsPath = join(tempDir, 'AGENTS.md');
        const gitHookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
        const settingsPath = join(tempDir, '.claude', 'settings.json');

        expect(existsSync(agentsPath)).toBe(false);
        expect(existsSync(gitHookPath)).toBe(false);
        expect(existsSync(settingsPath)).toBe(false);
      });
    });

    describe('output structure', () => {
      it('init output includes Claude hooks status line', async () => {
        await mkdir(join(tempDir, '.claude'), { recursive: true });

        const { combined } = runCli('init', tempDir);

        expect(combined.toLowerCase()).toMatch(/claude.*hooks?/i);
        expect(combined.toLowerCase()).toMatch(/installed|ok|success/i);
      });

      it('init --skip-claude output shows Claude hooks skipped', () => {
        const { combined } = runCli('init --skip-claude', tempDir);

        expect(combined.toLowerCase()).toMatch(/claude.*hooks?/i);
        expect(combined.toLowerCase()).toMatch(/skip|not.*installed/i);
      });

      it('init output shows Claude hooks status even on error', async () => {
        await mkdir(join(tempDir, '.claude'), { recursive: true });
        await writeFile(join(tempDir, '.claude', 'settings.json'), 'invalid json{');

        const { combined } = runCli('init', tempDir);

        expect(combined.toLowerCase()).toMatch(/claude.*hooks?/i);
        expect(combined.toLowerCase()).toMatch(/error|fail|corrupt/i);
      });
    });

    describe('JSON output', () => {
      it('init --json includes claudeHooks: true field', async () => {
        await mkdir(join(tempDir, '.claude'), { recursive: true });

        const { stdout } = runCli('init --json', tempDir);
        const result = JSON.parse(stdout) as {
          initialized: boolean;
          lessonsDir: string;
          agentsMd: boolean;
          hooks: boolean;
          claudeHooks: boolean;
        };

        expect(result.claudeHooks).toBe(true);
        expect(typeof result.claudeHooks).toBe('boolean');
      });

      it('init --skip-claude --json includes claudeHooks: false', () => {
        const { stdout } = runCli('init --skip-claude --json', tempDir);
        const result = JSON.parse(stdout) as { claudeHooks: boolean };

        expect(result.claudeHooks).toBe(false);
        expect(typeof result.claudeHooks).toBe('boolean');
      });

      it('JSON output has stable schema with all expected fields', async () => {
        await mkdir(join(tempDir, '.git', 'hooks'), { recursive: true });
        await mkdir(join(tempDir, '.claude'), { recursive: true });

        const { stdout } = runCli('init --json', tempDir);
        const result = JSON.parse(stdout) as Record<string, unknown>;

        expect(result).toHaveProperty('initialized');
        expect(result).toHaveProperty('lessonsDir');
        expect(result).toHaveProperty('agentsMd');
        expect(result).toHaveProperty('hooks');
        expect(result).toHaveProperty('claudeHooks');

        expect(typeof result.initialized).toBe('boolean');
        expect(typeof result.lessonsDir).toBe('string');
        expect(typeof result.agentsMd).toBe('boolean');
        expect(typeof result.hooks).toBe('boolean');
        expect(typeof result.claudeHooks).toBe('boolean');
      });
    });

    describe('idempotency', () => {
      it('running init twice does NOT create duplicate Claude hooks', async () => {
        await mkdir(join(tempDir, '.claude'), { recursive: true });

        runCli('init', tempDir);
        runCli('init', tempDir);

        const settingsPath = join(tempDir, '.claude', 'settings.json');
        const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));

        const learningAgentHooks = settings.hooks.SessionStart.filter((entry: { hooks: Array<{ command: string }> }) =>
          entry.hooks.some((hook: { command: string }) => hook.command.includes('lna'))
        );

        expect(learningAgentHooks).toHaveLength(1);
      });

      it('init after setup claude does NOT duplicate hooks', async () => {
        await mkdir(join(tempDir, '.claude'), { recursive: true });

        const cliPath = join(process.cwd(), 'dist', 'cli.js');
        execSync(`node ${cliPath} setup claude 2>&1`, {
          cwd: tempDir,
          encoding: 'utf-8',
          env: { ...process.env, LEARNING_AGENT_ROOT: tempDir },
        });

        runCli('init', tempDir);

        const settingsPath = join(tempDir, '.claude', 'settings.json');
        const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));

        const learningAgentHooks = settings.hooks.SessionStart.filter((entry: { hooks: Array<{ command: string }> }) =>
          entry.hooks.some((hook: { command: string }) => hook.command.includes('lna'))
        );

        expect(learningAgentHooks).toHaveLength(1);
      });

      it('setup claude after init does NOT duplicate hooks', async () => {
        await mkdir(join(tempDir, '.claude'), { recursive: true });

        runCli('init', tempDir);

        const cliPath = join(process.cwd(), 'dist', 'cli.js');
        execSync(`node ${cliPath} setup claude 2>&1`, {
          cwd: tempDir,
          encoding: 'utf-8',
          env: { ...process.env, LEARNING_AGENT_ROOT: tempDir },
        });

        const settingsPath = join(tempDir, '.claude', 'settings.json');
        const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));

        const learningAgentHooks = settings.hooks.SessionStart.filter((entry: { hooks: Array<{ command: string }> }) =>
          entry.hooks.some((hook: { command: string }) => hook.command.includes('lna'))
        );

        expect(learningAgentHooks).toHaveLength(1);
      });

      it('second init reports claudeHooks: false when already installed', async () => {
        await mkdir(join(tempDir, '.claude'), { recursive: true });

        runCli('init', tempDir);
        const { stdout } = runCli('init --json', tempDir);

        const result = JSON.parse(stdout) as { claudeHooks: boolean };

        expect(result.claudeHooks).toBe(false);
      });
    });

    describe('safety: no duplicate hooks', () => {
      it('preserves existing OTHER SessionStart hooks', async () => {
        await mkdir(join(tempDir, '.claude'), { recursive: true });

        const settingsPath = join(tempDir, '.claude', 'settings.json');
        await writeFile(
          settingsPath,
          JSON.stringify(
            {
              hooks: {
                SessionStart: [
                  {
                    matcher: 'existing',
                    hooks: [{ type: 'command', command: 'echo "existing hook"' }],
                  },
                ],
              },
            },
            null,
            2
          )
        );

        runCli('init', tempDir);

        const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));

        expect(settings.hooks.SessionStart).toHaveLength(2);

        const existingHook = settings.hooks.SessionStart.find(
          (entry: { matcher: string }) => entry.matcher === 'existing'
        );
        expect(existingHook).toBeDefined();
        expect(existingHook.hooks[0].command).toBe('echo "existing hook"');

        const learningAgentHook = settings.hooks.SessionStart.find((entry: { hooks: Array<{ command: string }> }) =>
          entry.hooks.some((hook: { command: string }) => hook.command.includes('lna'))
        );
        expect(learningAgentHook).toBeDefined();
      });
    });

    describe('safety: error handling', () => {
      it('Claude hooks error does not prevent other components', async () => {
        await mkdir(join(tempDir, '.claude'), { recursive: true });
        await writeFile(join(tempDir, '.claude', 'settings.json'), 'invalid json{');

        const { combined } = runCli('init', tempDir);

        const agentsPath = join(tempDir, 'AGENTS.md');
        expect(existsSync(agentsPath)).toBe(true);

        const lessonsDir = join(tempDir, '.claude', 'lessons');
        expect(existsSync(lessonsDir)).toBe(true);

        expect(combined.toLowerCase()).toMatch(/error|fail|corrupt/i);
      });

      it('Claude hooks error shows in JSON output as claudeHooks: false', async () => {
        await mkdir(join(tempDir, '.claude'), { recursive: true });
        await writeFile(join(tempDir, '.claude', 'settings.json'), 'invalid json{');

        const { stdout } = runCli('init --json', tempDir);
        const result = JSON.parse(stdout) as { claudeHooks: boolean };

        expect(result.claudeHooks).toBe(false);
      });
    });

    describe('safety: settings file integrity', () => {
      it('malformed settings.json is not modified on error', async () => {
        await mkdir(join(tempDir, '.claude'), { recursive: true });

        const settingsPath = join(tempDir, '.claude', 'settings.json');
        const malformedContent = 'invalid json{';
        await writeFile(settingsPath, malformedContent);

        runCli('init', tempDir);

        const content = await readFile(settingsPath, 'utf-8');
        expect(content).toBe(malformedContent);
      });

      it('preserves all existing settings fields', async () => {
        await mkdir(join(tempDir, '.claude'), { recursive: true });

        const settingsPath = join(tempDir, '.claude', 'settings.json');
        await writeFile(
          settingsPath,
          JSON.stringify(
            {
              permissions: { enabled: true },
              mcpServers: { test: { command: 'test' } },
              other: { custom: 'value' },
            },
            null,
            2
          )
        );

        runCli('init', tempDir);

        const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));

        expect(settings.permissions).toEqual({ enabled: true });
        expect(settings.mcpServers).toEqual({ test: { command: 'test' } });
        expect(settings.other).toEqual({ custom: 'value' });

        expect(settings.hooks.SessionStart).toBeDefined();
      });
    });

    describe('safety: no global side effects', () => {
      it('init NEVER modifies global Claude settings', async () => {
        const mockHome = join(tempDir, 'mock-home');
        await mkdir(join(mockHome, '.claude'), { recursive: true });

        const globalSettings = join(mockHome, '.claude', 'settings.json');
        const globalContent = JSON.stringify({ global: 'config' }, null, 2);
        await writeFile(globalSettings, globalContent);

        await mkdir(join(tempDir, '.claude'), { recursive: true });

        const cliPath = join(process.cwd(), 'dist', 'cli.js');
        execSync(`node ${cliPath} init 2>&1`, {
          cwd: tempDir,
          encoding: 'utf-8',
          env: { ...process.env, HOME: mockHome, LEARNING_AGENT_ROOT: tempDir },
        });

        const newGlobalContent = await readFile(globalSettings, 'utf-8');
        expect(newGlobalContent).toBe(globalContent);
      });
    });

    describe('edge cases', () => {
      it('empty Claude settings file gets hook added', async () => {
        await mkdir(join(tempDir, '.claude'), { recursive: true });
        await writeFile(join(tempDir, '.claude', 'settings.json'), '{}');

        runCli('init', tempDir);

        const settingsPath = join(tempDir, '.claude', 'settings.json');
        const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));

        expect(settings.hooks.SessionStart).toBeDefined();
        expect(settings.hooks.SessionStart.length).toBeGreaterThan(0);
      });

      it('settings file with only permissions gets hooks added', async () => {
        await mkdir(join(tempDir, '.claude'), { recursive: true });

        const settingsPath = join(tempDir, '.claude', 'settings.json');
        await writeFile(settingsPath, JSON.stringify({ permissions: { enabled: false } }));

        runCli('init', tempDir);

        const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));

        expect(settings.permissions).toEqual({ enabled: false });

        expect(settings.hooks.SessionStart).toBeDefined();
      });

      it('multiple existing SessionStart hooks are all preserved', async () => {
        await mkdir(join(tempDir, '.claude'), { recursive: true });

        const settingsPath = join(tempDir, '.claude', 'settings.json');
        await writeFile(
          settingsPath,
          JSON.stringify({
            hooks: {
              SessionStart: [
                { matcher: 'hook1', hooks: [{ type: 'command', command: 'echo 1' }] },
                { matcher: 'hook2', hooks: [{ type: 'command', command: 'echo 2' }] },
                { matcher: 'hook3', hooks: [{ type: 'command', command: 'echo 3' }] },
              ],
            },
          })
        );

        runCli('init', tempDir);

        const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));

        expect(settings.hooks.SessionStart).toHaveLength(4);
      });
    });

    describe('integration: equivalent to setup claude', () => {
      it('init produces same Claude settings as setup claude', async () => {
        const dir1 = await mkdtemp(join(tmpdir(), 'learning-agent-test1-'));
        const dir2 = await mkdtemp(join(tmpdir(), 'learning-agent-test2-'));

        try {
          await mkdir(join(dir1, '.claude'), { recursive: true });
          await mkdir(join(dir2, '.claude'), { recursive: true });

          const cliPath = join(process.cwd(), 'dist', 'cli.js');

          execSync(`node ${cliPath} init 2>&1`, {
            cwd: dir1,
            encoding: 'utf-8',
            env: { ...process.env, LEARNING_AGENT_ROOT: dir1 },
          });

          execSync(`node ${cliPath} setup claude 2>&1`, {
            cwd: dir2,
            encoding: 'utf-8',
            env: { ...process.env, LEARNING_AGENT_ROOT: dir2 },
          });

          const settings1 = JSON.parse(await readFile(join(dir1, '.claude', 'settings.json'), 'utf-8'));
          const settings2 = JSON.parse(await readFile(join(dir2, '.claude', 'settings.json'), 'utf-8'));

          expect(settings1.hooks.SessionStart).toEqual(settings2.hooks.SessionStart);
        } finally {
          await rm(dir1, { recursive: true, force: true });
          await rm(dir2, { recursive: true, force: true });
        }
      });
    });
  });
});
