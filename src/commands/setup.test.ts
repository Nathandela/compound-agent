/**
 * Tests for setup commands: init, setup claude, download-model
 */

import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { isModelAvailable } from '../embeddings/nomic.js';
import { appendLesson, LESSONS_PATH } from '../storage/jsonl.js';
import { closeDb, rebuildIndex } from '../storage/sqlite.js';
import { createQuickLesson } from '../test-utils.js';
import { setupCliTestContext } from './test-helpers.js';

describe('Setup Commands', () => {
  const { getTempDir, runCli } = setupCliTestContext();

  describe('init command', () => {
    it('creates .claude/lessons directory structure', async () => {
      runCli('init');

      const lessonsDir = join(getTempDir(), '.claude', 'lessons');
      const dirs = await readdir(join(getTempDir(), '.claude'));
      expect(dirs).toContain('lessons');
    });

    it('creates empty index.jsonl file', async () => {
      runCli('init');

      const indexPath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(indexPath, 'utf-8');
      // Should be empty or have minimal content
      expect(content.trim()).toBe('');
    });

    it('creates AGENTS.md with Learning Agent section', async () => {
      runCli('init');

      const agentsPath = join(getTempDir(), 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');
      expect(content).toContain('Learning Agent Integration');
      expect(content).toContain('load-session');
      expect(content).toContain('check-plan');
      expect(content).toContain('capture');
    });

    it('AGENTS.md template includes explicit plan-time instructions', async () => {
      runCli('init');

      const agentsPath = join(getTempDir(), 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');

      // Must include explicit instruction to run check-plan BEFORE implementing
      expect(content).toMatch(/before\s+(implementing|starting|coding)/i);
      // Must mention running check-plan command
      expect(content).toContain('npx learning-agent check-plan');
      // Must explain what to do with results
      expect(content).toMatch(/lessons?\s*check/i);
    });

    it('appends to existing AGENTS.md without duplicating', async () => {
      // Create existing AGENTS.md
      const agentsPath = join(getTempDir(), 'AGENTS.md');
      await writeFile(agentsPath, '# Existing Content\n\nSome existing instructions.\n');

      runCli('init');

      const content = await readFile(agentsPath, 'utf-8');
      // Should preserve existing content
      expect(content).toContain('Existing Content');
      // Should add Learning Agent section
      expect(content).toContain('Learning Agent Integration');
    });

    it('is idempotent - does not duplicate section on re-run', async () => {
      // Run init twice
      runCli('init');
      runCli('init');

      const agentsPath = join(getTempDir(), 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');

      // Count occurrences of the section header
      const matches = content.match(/## Learning Agent Integration/g);
      expect(matches?.length).toBe(1);
    });

    it('respects --skip-agents flag', async () => {
      runCli('init --skip-agents');

      // Should create lessons directory
      const lessonsDir = join(getTempDir(), '.claude', 'lessons');
      const dirs = await readdir(join(getTempDir(), '.claude'));
      expect(dirs).toContain('lessons');

      // Should NOT create AGENTS.md
      const agentsPath = join(getTempDir(), 'AGENTS.md');
      let agentsExists = true;
      try {
        await readFile(agentsPath, 'utf-8');
      } catch {
        agentsExists = false;
      }
      expect(agentsExists).toBe(false);
    });

    it('shows success message', () => {
      const { combined } = runCli('init');
      expect(combined).toMatch(/initialized|created|success/i);
    });

    it('respects --quiet flag', () => {
      const { combined } = runCli('init --quiet');
      // Should have minimal output
      expect(combined.length).toBeLessThan(100);
    });

    it('does not overwrite existing lessons', async () => {
      // Create some lessons first
      await appendLesson(getTempDir(), createQuickLesson('L001', 'existing lesson'));

      runCli('init');

      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('existing lesson');
    });

    it('outputs JSON with --json flag', () => {
      const { stdout } = runCli('init --json');
      const result = JSON.parse(stdout) as { initialized: boolean; lessonsDir: string; agentsMd: boolean };
      expect(result.initialized).toBe(true);
      expect(result.lessonsDir).toContain('.claude/lessons');
      expect(result.agentsMd).toBe(true);
    });

    it('installs pre-commit hook in .git/hooks', async () => {
      // Create .git directory first (simulating a git repo)
      const gitHooksDir = join(getTempDir(), '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      runCli('init');

      const hookPath = join(gitHooksDir, 'pre-commit');
      const hookExists = existsSync(hookPath);
      expect(hookExists).toBe(true);
    });

    it('creates executable pre-commit hook', async () => {
      const gitHooksDir = join(getTempDir(), '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      runCli('init');

      const hookPath = join(gitHooksDir, 'pre-commit');
      const stats = statSync(hookPath);
      // Check if executable (mode & 0o111 should be non-zero)
      expect(stats.mode & 0o111).toBeGreaterThan(0);
    });

    it('pre-commit hook calls learning-agent hooks run', async () => {
      const gitHooksDir = join(getTempDir(), '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      runCli('init');

      const hookPath = join(gitHooksDir, 'pre-commit');
      const content = await readFile(hookPath, 'utf-8');
      expect(content).toContain('learning-agent');
      expect(content).toContain('hooks run pre-commit');
    });

    it('does not duplicate pre-commit hook on re-run', async () => {
      const gitHooksDir = join(getTempDir(), '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      runCli('init');
      runCli('init');

      const hookPath = join(gitHooksDir, 'pre-commit');
      const content = await readFile(hookPath, 'utf-8');
      // Count occurrences of the shebang (should be exactly 1)
      const shebangs = content.match(/#!/g);
      expect(shebangs?.length).toBe(1);
    });

    it('skips hook installation if .git/hooks does not exist', async () => {
      // Don't create .git directory
      const { combined } = runCli('init');

      // Should still succeed (not a git repo)
      expect(combined).toMatch(/initialized|created|success/i);

      // Hook should not exist
      const hookPath = join(getTempDir(), '.git', 'hooks', 'pre-commit');
      expect(existsSync(hookPath)).toBe(false);
    });

    it('--skip-hooks flag skips hook installation', async () => {
      const gitHooksDir = join(getTempDir(), '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      runCli('init --skip-hooks');

      const hookPath = join(gitHooksDir, 'pre-commit');
      expect(existsSync(hookPath)).toBe(false);
    });

    it('JSON output includes hooks field', async () => {
      const gitHooksDir = join(getTempDir(), '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      const { stdout } = runCli('init --json');
      const result = JSON.parse(stdout) as { hooks: boolean };
      expect(result.hooks).toBe(true);
    });

    it('appends to existing hook without overwriting original content', async () => {
      const gitHooksDir = join(getTempDir(), '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      // Create existing hook
      const hookPath = join(gitHooksDir, 'pre-commit');
      const existingContent = '#!/bin/sh\necho "existing hook"\npnpm test\n';
      await writeFile(hookPath, existingContent);

      runCli('init');

      const newContent = await readFile(hookPath, 'utf-8');
      // Should preserve existing content
      expect(newContent).toContain('existing hook');
      expect(newContent).toContain('pnpm test');
      // Should also have our marker
      expect(newContent).toContain('Learning Agent');
      expect(newContent).toContain('learning-agent hooks run');
    });

    it('does not modify hook that already has Learning Agent marker', async () => {
      const gitHooksDir = join(getTempDir(), '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      // Create existing hook with our marker
      const hookPath = join(gitHooksDir, 'pre-commit');
      const contentWithMarker = '#!/bin/sh\n# Learning Agent pre-commit hook\nnpx learning-agent hooks run pre-commit\n';
      await writeFile(hookPath, contentWithMarker);

      runCli('init');

      const newContent = await readFile(hookPath, 'utf-8');
      // Should be unchanged
      expect(newContent).toBe(contentWithMarker);
    });

    it('respects core.hooksPath configuration', async () => {
      // Create custom hooks directory
      const customHooksDir = join(getTempDir(), 'custom-hooks');
      await mkdir(customHooksDir, { recursive: true });

      // Create minimal .git directory with config
      await mkdir(join(getTempDir(), '.git'), { recursive: true });
      await writeFile(join(getTempDir(), '.git', 'config'), `[core]\n\thooksPath = custom-hooks\n`);

      runCli('init');

      // Hook should be in custom directory, not .git/hooks
      const customHookPath = join(customHooksDir, 'pre-commit');
      const defaultHookPath = join(getTempDir(), '.git', 'hooks', 'pre-commit');

      expect(existsSync(customHookPath)).toBe(true);
      expect(existsSync(defaultHookPath)).toBe(false);
    });

    it('handles absolute core.hooksPath', async () => {
      // Create custom hooks directory with absolute path
      const customHooksDir = join(getTempDir(), 'absolute-hooks');
      await mkdir(customHooksDir, { recursive: true });

      // Create minimal .git directory with config
      await mkdir(join(getTempDir(), '.git'), { recursive: true });
      await writeFile(join(getTempDir(), '.git', 'config'), `[core]\n\thooksPath = ${customHooksDir}\n`);

      runCli('init');

      // Hook should be in custom directory
      const customHookPath = join(customHooksDir, 'pre-commit');
      expect(existsSync(customHookPath)).toBe(true);
    });

    describe('pre-commit hook insertion edge cases', () => {
      it('inserts hook BEFORE top-level exit 0 statement', async () => {
        const gitHooksDir = join(getTempDir(), '.git', 'hooks');
        await mkdir(gitHooksDir, { recursive: true });

        // Create existing hook with exit 0 at end
        const hookPath = join(gitHooksDir, 'pre-commit');
        const existingContent = '#!/bin/sh\necho "running tests"\npnpm test\nexit 0\n';
        await writeFile(hookPath, existingContent);

        runCli('init');

        const newContent = await readFile(hookPath, 'utf-8');
        const lines = newContent.split('\n');

        // Find line numbers
        const learningAgentLine = lines.findIndex((line) => line.includes('learning-agent hooks run'));
        const exitLine = lines.findIndex((line) => line.trim() === 'exit 0');

        // Learning Agent hook must appear BEFORE exit statement
        expect(learningAgentLine).toBeGreaterThan(-1);
        expect(exitLine).toBeGreaterThan(-1);
        expect(learningAgentLine).toBeLessThan(exitLine);
      });

      it('inserts hook BEFORE exit 1 statement', async () => {
        const gitHooksDir = join(getTempDir(), '.git', 'hooks');
        await mkdir(gitHooksDir, { recursive: true });

        const hookPath = join(gitHooksDir, 'pre-commit');
        const existingContent = '#!/bin/sh\nif ! pnpm test; then\n  echo "Tests failed"\n  exit 1\nfi\n';
        await writeFile(hookPath, existingContent);

        runCli('init');

        const newContent = await readFile(hookPath, 'utf-8');
        const lines = newContent.split('\n');

        const learningAgentLine = lines.findIndex((line) => line.includes('learning-agent hooks run'));
        const exitLine = lines.findIndex((line) => line.trim() === 'exit 1');

        expect(learningAgentLine).toBeGreaterThan(-1);
        expect(exitLine).toBeGreaterThan(-1);
        expect(learningAgentLine).toBeLessThan(exitLine);
      });

      it('inserts hook BEFORE exit with variable (exit $STATUS)', async () => {
        const gitHooksDir = join(getTempDir(), '.git', 'hooks');
        await mkdir(gitHooksDir, { recursive: true });

        const hookPath = join(gitHooksDir, 'pre-commit');
        const existingContent = '#!/bin/sh\nSTATUS=0\npnpm test || STATUS=1\nexit $STATUS\n';
        await writeFile(hookPath, existingContent);

        runCli('init');

        const newContent = await readFile(hookPath, 'utf-8');
        const lines = newContent.split('\n');

        const learningAgentLine = lines.findIndex((line) => line.includes('learning-agent hooks run'));
        const exitLine = lines.findIndex((line) => line.trim().startsWith('exit $'));

        expect(learningAgentLine).toBeGreaterThan(-1);
        expect(exitLine).toBeGreaterThan(-1);
        expect(learningAgentLine).toBeLessThan(exitLine);
      });

      it('inserts hook BEFORE first top-level exit when multiple exist', async () => {
        const gitHooksDir = join(getTempDir(), '.git', 'hooks');
        await mkdir(gitHooksDir, { recursive: true });

        const hookPath = join(gitHooksDir, 'pre-commit');
        const existingContent = '#!/bin/sh\npnpm lint\nif [ $? -eq 0 ]; then\n  exit 0\nfi\nexit 1\n';
        await writeFile(hookPath, existingContent);

        runCli('init');

        const newContent = await readFile(hookPath, 'utf-8');
        const lines = newContent.split('\n');

        const learningAgentLine = lines.findIndex((line) => line.includes('learning-agent hooks run'));
        const firstExitLine = lines.findIndex((line) => line.trim() === 'exit 0');

        expect(learningAgentLine).toBeGreaterThan(-1);
        expect(firstExitLine).toBeGreaterThan(-1);
        expect(learningAgentLine).toBeLessThan(firstExitLine);
      });

      it('appends hook at end when no exit statement exists', async () => {
        const gitHooksDir = join(getTempDir(), '.git', 'hooks');
        await mkdir(gitHooksDir, { recursive: true });

        const hookPath = join(gitHooksDir, 'pre-commit');
        const existingContent = '#!/bin/sh\necho "running tests"\npnpm test\n';
        await writeFile(hookPath, existingContent);

        runCli('init');

        const newContent = await readFile(hookPath, 'utf-8');
        const lines = newContent.split('\n');

        const learningAgentLine = lines.findIndex((line) => line.includes('learning-agent hooks run'));
        const lastContentLine = lines.findIndex((line) => line.includes('pnpm test'));

        // Should be appended after existing content
        expect(learningAgentLine).toBeGreaterThan(-1);
        expect(learningAgentLine).toBeGreaterThan(lastContentLine);
      });

      it('ignores exit inside function definition', async () => {
        const gitHooksDir = join(getTempDir(), '.git', 'hooks');
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

        runCli('init');

        const newContent = await readFile(hookPath, 'utf-8');
        const lines = newContent.split('\n');

        const learningAgentLine = lines.findIndex((line) => line.includes('learning-agent hooks run'));
        // Find the exit 1 inside function
        const functionExitLine = lines.findIndex((line) => line.trim() === 'exit 1');
        // Find the exit 0 at end (top-level)
        const topLevelExitLine = lines.findIndex((line) => line.trim() === 'exit 0');

        expect(learningAgentLine).toBeGreaterThan(-1);
        expect(topLevelExitLine).toBeGreaterThan(-1);
        // Should insert before top-level exit (exit 0), not function exit (exit 1)
        expect(learningAgentLine).toBeLessThan(topLevelExitLine);
        // Learning agent line should be AFTER the function exit
        expect(learningAgentLine).toBeGreaterThan(functionExitLine);
      });

      it('ignores exit in heredoc', async () => {
        const gitHooksDir = join(getTempDir(), '.git', 'hooks');
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

        runCli('init');

        const newContent = await readFile(hookPath, 'utf-8');
        const lines = newContent.split('\n');

        const learningAgentLine = lines.findIndex((line) => line.includes('learning-agent hooks run'));
        // Find the ACTUAL top-level exit (last exit 0)
        let topLevelExitLine = -1;
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i].trim() === 'exit 0') {
            topLevelExitLine = i;
            break;
          }
        }

        expect(learningAgentLine).toBeGreaterThan(-1);
        expect(topLevelExitLine).toBeGreaterThan(-1);
        // Should insert before the REAL exit, not the one in heredoc
        expect(learningAgentLine).toBeLessThan(topLevelExitLine);
      });

      it('remains idempotent when run twice with exit statements', async () => {
        const gitHooksDir = join(getTempDir(), '.git', 'hooks');
        await mkdir(gitHooksDir, { recursive: true });

        const hookPath = join(gitHooksDir, 'pre-commit');
        const existingContent = '#!/bin/sh\npnpm test\nexit 0\n';
        await writeFile(hookPath, existingContent);

        // Run init twice
        runCli('init');
        runCli('init');

        const newContent = await readFile(hookPath, 'utf-8');

        // Count occurrences of learning-agent hook
        const matches = newContent.match(/learning-agent hooks run pre-commit/g);
        expect(matches?.length).toBe(1);

        // Ensure hook is still before exit
        const lines = newContent.split('\n');
        const learningAgentLine = lines.findIndex((line) => line.includes('learning-agent hooks run'));
        const exitLine = lines.findIndex((line) => line.trim() === 'exit 0');
        expect(learningAgentLine).toBeLessThan(exitLine);
      });
    });
  });

  describe('setup claude command', () => {
    let mockHome: string;

    beforeEach(async () => {
      // Create a mock home directory for testing global settings
      mockHome = join(getTempDir(), 'mock-home');
      await mkdir(join(mockHome, '.claude'), { recursive: true });
    });

    const runSetupClaude = (args = ''): { stdout: string; stderr: string; combined: string } => {
      const cliPath = join(process.cwd(), 'dist', 'cli.js');
      try {
        const stdout = execSync(`node ${cliPath} setup claude ${args} 2>&1`, {
          cwd: getTempDir(),
          encoding: 'utf-8',
          env: { ...process.env, HOME: mockHome, LEARNING_AGENT_ROOT: getTempDir() },
        });
        return { stdout, stderr: '', combined: stdout };
      } catch (error) {
        const err = error as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
        const stdout = err.stdout?.toString() ?? '';
        const stderr = err.stderr?.toString() ?? '';
        const combined = stdout + stderr + (err.message ?? '');
        return { stdout, stderr, combined };
      }
    };

    it('installs hooks to project settings file by default (v0.2.1+)', async () => {
      // Create project .claude directory
      await mkdir(join(getTempDir(), '.claude'), { recursive: true });

      const { combined } = runSetupClaude();

      // Should indicate success
      expect(combined.toLowerCase()).toMatch(/installed|ok|success/i);

      // Verify settings file was created in PROJECT directory (new default)
      const settingsPath = join(getTempDir(), '.claude', 'settings.json');
      const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));

      // Should have SessionStart hook
      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.SessionStart).toBeDefined();
      expect(settings.hooks.SessionStart.length).toBeGreaterThan(0);

      // Hook should contain our command
      const hookEntry = settings.hooks.SessionStart[0];
      expect(hookEntry.hooks[0].command).toContain('learning-agent');
      expect(hookEntry.hooks[0].command).toContain('load-session');
    });

    it('preserves existing settings when adding hooks', async () => {
      // Create existing project settings (v0.2.1+: default is project)
      const settingsPath = join(getTempDir(), '.claude', 'settings.json');
      await mkdir(join(getTempDir(), '.claude'), { recursive: true });
      await writeFile(
        settingsPath,
        JSON.stringify(
          {
            permissions: { enabled: true },
            mcpServers: { test: { command: 'test' } },
          },
          null,
          2
        )
      );

      runSetupClaude();

      const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));
      // Should preserve existing fields
      expect(settings.permissions).toEqual({ enabled: true });
      expect(settings.mcpServers).toEqual({ test: { command: 'test' } });
      // Should add hooks
      expect(settings.hooks.SessionStart).toBeDefined();
    });

    it('preserves existing SessionStart hooks when adding our hook', async () => {
      // Create project settings with existing SessionStart hook (v0.2.1+: default is project)
      const settingsPath = join(getTempDir(), '.claude', 'settings.json');
      await mkdir(join(getTempDir(), '.claude'), { recursive: true });
      await writeFile(
        settingsPath,
        JSON.stringify(
          {
            hooks: {
              SessionStart: [
                {
                  matcher: 'startup',
                  hooks: [{ type: 'command', command: 'echo "existing hook"' }],
                },
              ],
            },
          },
          null,
          2
        )
      );

      runSetupClaude();

      const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));
      // Should have 2 hooks now
      expect(settings.hooks.SessionStart.length).toBe(2);
      // First should be existing
      expect(settings.hooks.SessionStart[0].hooks[0].command).toBe('echo "existing hook"');
      // Second should be ours
      expect(settings.hooks.SessionStart[1].hooks[0].command).toContain('learning-agent');
    });

    it('is idempotent - does not duplicate hook on re-run', async () => {
      // v0.2.1+: default is project
      await mkdir(join(getTempDir(), '.claude'), { recursive: true });

      runSetupClaude();
      runSetupClaude();

      const settingsPath = join(getTempDir(), '.claude', 'settings.json');
      const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));

      // Should still have only 1 hook
      expect(settings.hooks.SessionStart.length).toBe(1);
    });

    it('reports already installed when hook exists', async () => {
      // v0.2.1+: default is project
      await mkdir(join(getTempDir(), '.claude'), { recursive: true });

      runSetupClaude();
      const { combined } = runSetupClaude();

      expect(combined.toLowerCase()).toMatch(/already|unchanged/i);
    });

    it('--uninstall removes our hook', async () => {
      // v0.2.1+: default is project
      await mkdir(join(getTempDir(), '.claude'), { recursive: true });

      // First install
      runSetupClaude();

      // Then uninstall
      const { combined } = runSetupClaude('--uninstall');
      expect(combined.toLowerCase()).toMatch(/removed|uninstalled/i);

      const settingsPath = join(getTempDir(), '.claude', 'settings.json');
      const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));

      // Hook should be removed
      expect(settings.hooks.SessionStart).toHaveLength(0);
    });

    it('--uninstall preserves other hooks', async () => {
      // v0.2.1+: default is project - create project settings with existing and our hook
      const settingsPath = join(getTempDir(), '.claude', 'settings.json');
      await mkdir(join(getTempDir(), '.claude'), { recursive: true });
      await writeFile(
        settingsPath,
        JSON.stringify(
          {
            hooks: {
              SessionStart: [
                { matcher: 'startup', hooks: [{ type: 'command', command: 'echo "keep me"' }] },
                {
                  matcher: 'startup|resume|compact',
                  hooks: [{ type: 'command', command: 'npx learning-agent load-session 2>/dev/null || true' }],
                },
              ],
            },
          },
          null,
          2
        )
      );

      runSetupClaude('--uninstall');

      const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));
      // Should keep other hook
      expect(settings.hooks.SessionStart.length).toBe(1);
      expect(settings.hooks.SessionStart[0].hooks[0].command).toBe('echo "keep me"');
    });

    it('--dry-run shows changes without writing', async () => {
      const { combined } = runSetupClaude('--dry-run');

      expect(combined.toLowerCase()).toMatch(/would|dry.run/i);

      // v0.2.1+: default is project - project settings file should not exist
      const settingsPath = join(getTempDir(), '.claude', 'settings.json');
      expect(existsSync(settingsPath)).toBe(false);
    });

    it('--global installs to global ~/.claude directory', async () => {
      const { combined } = runSetupClaude('--global');
      expect(combined.toLowerCase()).toMatch(/global|installed/i);

      // Should be in global, not project
      const projectSettings = join(getTempDir(), '.claude', 'settings.json');
      const globalSettings = join(mockHome, '.claude', 'settings.json');

      expect(existsSync(globalSettings)).toBe(true);
      expect(existsSync(projectSettings)).toBe(false);
    });

    it('--json outputs machine-readable result', async () => {
      // v0.2.1+: default is project
      await mkdir(join(getTempDir(), '.claude'), { recursive: true });

      const { stdout } = runSetupClaude('--json');
      const result = JSON.parse(stdout) as {
        installed: boolean;
        location: string;
        hooks: string[];
        action: string;
      };

      expect(result.installed).toBe(true);
      expect(result.location).toContain('settings.json');
      expect(result.hooks).toContain('SessionStart');
      expect(['created', 'updated']).toContain(result.action);
    });

    it('--json with --dry-run shows what would happen', async () => {
      const { stdout } = runSetupClaude('--dry-run --json');
      const result = JSON.parse(stdout) as {
        dryRun: boolean;
        wouldInstall: boolean;
        location: string;
      };

      expect(result.dryRun).toBe(true);
      expect(result.wouldInstall).toBe(true);
    });
  });

  describe('download-model command', () => {
    it('command is registered and recognized', () => {
      const { combined } = runCli('download-model --help');
      // Command should be recognized and show help
      expect(combined).toContain('download-model');
      expect(combined).not.toMatch(/unknown command|not found/i);
    });

    it('shows success message when model downloads successfully', () => {
      const { combined } = runCli('download-model');
      // Should show download progress and success
      expect(combined).toMatch(/downloading|model|success/i);
    });

    it('shows model path and size after successful download', () => {
      const { combined } = runCli('download-model');
      // Should display the path to the downloaded model
      expect(combined).toMatch(/path/i);
      expect(combined).toMatch(/\.gguf/i);
      // Should show size in human-readable format (MB)
      expect(combined).toMatch(/\d+\s*MB/i);
    });

    it('is idempotent - skips download if model already exists', () => {
      // Run download twice
      runCli('download-model');
      const { combined } = runCli('download-model');

      // Second run should indicate model already exists
      expect(combined).toMatch(/already\s+(downloaded|exists|available)/i);
      expect(combined).not.toMatch(/downloading/i);
    });

    it('second download completes instantly (no re-download)', () => {
      // First download
      runCli('download-model');

      // Second run should be instant (no actual download)
      const start = Date.now();
      runCli('download-model');
      const duration = Date.now() - start;

      // Should complete in less than 5 seconds (way faster than 278MB download)
      // Using 5 seconds to account for CLI startup overhead under parallel load
      expect(duration).toBeLessThan(5000);
    });

    it('isModelAvailable returns true after successful download', () => {
      // Download model (may already exist)
      runCli('download-model');

      // After download, model should be available
      const afterAvailable = isModelAvailable();

      // Invariant: after running download-model, isModelAvailable() must be true
      expect(afterAvailable).toBe(true);
    });

    it('outputs valid JSON with --json flag', () => {
      const { stdout } = runCli('download-model --json');

      // Extract JSON from output (may have other output from node-llama-cpp)
      const jsonLine = stdout.split('\n').find((line) => line.trim().startsWith('{'));
      expect(jsonLine).toBeDefined();

      const result = JSON.parse(jsonLine!) as {
        success: boolean;
        path: string;
        size: number;
        alreadyExisted: boolean;
      };

      expect(result.success).toBe(true);
      expect(result.path).toMatch(/\.gguf$/);
      expect(result.size).toBeGreaterThan(0);
      expect(typeof result.alreadyExisted).toBe('boolean');
    });

    it('JSON output shows alreadyExisted field accurately reflects model state', () => {
      // First check if model exists
      const modelExistsBefore = isModelAvailable();

      const { stdout } = runCli('download-model --json');

      const jsonLine = stdout.split('\n').find((line) => line.trim().startsWith('{'));
      expect(jsonLine).toBeDefined();

      const result = JSON.parse(jsonLine!) as { alreadyExisted: boolean };
      // alreadyExisted should match whether model existed before this run
      expect(result.alreadyExisted).toBe(modelExistsBefore);
    });

    it('JSON output shows alreadyExisted: true on subsequent download', () => {
      // First download
      runCli('download-model');

      // Second download
      const { stdout } = runCli('download-model --json');

      const jsonLine = stdout.split('\n').find((line) => line.trim().startsWith('{'));
      expect(jsonLine).toBeDefined();

      const result = JSON.parse(jsonLine!) as { alreadyExisted: boolean };
      expect(result.alreadyExisted).toBe(true);
    });

    it('uses absolute path for model location', () => {
      const { stdout } = runCli('download-model --json');

      const jsonLine = stdout.split('\n').find((line) => line.trim().startsWith('{'));
      expect(jsonLine).toBeDefined();

      const result = JSON.parse(jsonLine!) as { path: string };

      // Path should be absolute (starts with /)
      expect(result.path).toMatch(/^\//);
      // Path should include home directory
      expect(result.path).toContain('.node-llama-cpp');
    });

    it('uses consistent model filename', () => {
      const { stdout } = runCli('download-model --json');

      const jsonLine = stdout.split('\n').find((line) => line.trim().startsWith('{'));
      expect(jsonLine).toBeDefined();

      const result = JSON.parse(jsonLine!) as { path: string };

      // Should use MODEL_FILENAME constant (hf_ggml-org_embeddinggemma-300M-qat-Q4_0.gguf)
      expect(result.path).toContain('hf_ggml-org_embeddinggemma-300M-qat-Q4_0.gguf');
    });

    it('downloaded model file has valid size (approximately 278MB)', () => {
      const { stdout } = runCli('download-model --json');

      const jsonLine = stdout.split('\n').find((line) => line.trim().startsWith('{'));
      expect(jsonLine).toBeDefined();

      const result = JSON.parse(jsonLine!) as { size: number };

      // Size should be approximately 278MB (277,852,359 bytes +-5%)
      const expectedSize = 277852359;
      const tolerance = expectedSize * 0.05; // 5% tolerance for model variations

      expect(result.size).toBeGreaterThan(expectedSize - tolerance);
      expect(result.size).toBeLessThan(expectedSize + tolerance);
    });

    it('command name matches error messages in check-plan', () => {
      // Create temp dir with no model
      const { combined } = runCli('check-plan --plan "test plan"');

      // Error message should reference the same command name
      if (combined.includes('download-model')) {
        expect(combined).toContain('npx learning-agent download-model');
      }
    });

    it('check-plan works immediately after download-model', async () => {
      // Create a test lesson
      await appendLesson(getTempDir(), createQuickLesson('L001', 'Test lesson for search'));
      await rebuildIndex(getTempDir());
      closeDb();

      // Download model
      runCli('download-model');

      // check-plan should work immediately (no race condition)
      const { combined } = runCli('check-plan --plan "test search"');

      // Should not show "model not available" error
      expect(combined).not.toMatch(/model not available|download.*model/i);
    });
  });
});
