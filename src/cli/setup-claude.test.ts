/**
 * CLI tests for the setup claude command.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cleanupCliTestDir, setupCliTestDir } from '../test-utils.js';

describe('CLI', { tags: ['integration'] }, () => {
  let tempDir: string;
  let mockHome: string;

  beforeEach(async () => {
    tempDir = await setupCliTestDir();
    mockHome = join(tempDir, 'mock-home');
    await mkdir(join(mockHome, '.claude'), { recursive: true });
  });

  afterEach(async () => {
    await cleanupCliTestDir(tempDir);
  });

  const runSetupClaude = (args = ''): { stdout: string; stderr: string; combined: string } => {
    const cliPath = join(process.cwd(), 'dist', 'cli.js');
    const argArray = args ? args.split(/\s+/).filter(Boolean) : [];
    try {
      const result = execFileSync('node', [cliPath, 'setup', 'claude', ...argArray], {
        cwd: tempDir,
        encoding: 'utf-8',
        env: { ...process.env, HOME: mockHome, COMPOUND_AGENT_ROOT: tempDir },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const stdout = typeof result === 'string' ? result : result.toString();
      return { stdout, stderr: '', combined: stdout };
    } catch (error) {
      const err = error as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
      const stdout = err.stdout?.toString() ?? '';
      const stderr = err.stderr?.toString() ?? '';
      const combined = stdout + stderr + (err.message ?? '');
      return { stdout, stderr, combined };
    }
  };

  describe('setup claude command', () => {
    it('installs hooks to project settings file by default (v0.2.1+)', async () => {
      await mkdir(join(tempDir, '.claude'), { recursive: true });

      const { combined } = runSetupClaude();

      expect(combined.toLowerCase()).toMatch(/installed|ok|success/i);

      const settingsPath = join(tempDir, '.claude', 'settings.json');
      const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));

      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.SessionStart).toBeDefined();
      expect(settings.hooks.SessionStart.length).toBeGreaterThan(0);

      const hookEntry = settings.hooks.SessionStart[0];
      expect(hookEntry.hooks[0].command).toContain('ca');
      // v0.2.4: uses prime instead of load-session
      expect(hookEntry.hooks[0].command).toContain('prime');
    });

    it('preserves existing settings when adding hooks', async () => {
      const settingsPath = join(tempDir, '.claude', 'settings.json');
      await mkdir(join(tempDir, '.claude'), { recursive: true });
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
      expect(settings.permissions).toEqual({ enabled: true });
      expect(settings.mcpServers).toEqual({ test: { command: 'test' } });
      expect(settings.hooks.SessionStart).toBeDefined();
    });

    it('preserves existing SessionStart hooks when adding our hook', async () => {
      const settingsPath = join(tempDir, '.claude', 'settings.json');
      await mkdir(join(tempDir, '.claude'), { recursive: true });
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
      expect(settings.hooks.SessionStart.length).toBe(2);
      expect(settings.hooks.SessionStart[0].hooks[0].command).toBe('echo "existing hook"');
      expect(settings.hooks.SessionStart[1].hooks[0].command).toContain('ca');
    });

    it('installs all 5 hook types', async () => {
      await mkdir(join(tempDir, '.claude'), { recursive: true });

      runSetupClaude();

      const settingsPath = join(tempDir, '.claude', 'settings.json');
      const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));

      const expectedHookTypes = ['SessionStart', 'PreCompact', 'UserPromptSubmit', 'PostToolUseFailure', 'PostToolUse'];
      for (const hookType of expectedHookTypes) {
        expect(settings.hooks[hookType], `missing hook type: ${hookType}`).toBeDefined();
        expect(settings.hooks[hookType].length, `empty hook array for: ${hookType}`).toBeGreaterThan(0);
      }
    });

    it('--uninstall removes all 5 hook types', async () => {
      await mkdir(join(tempDir, '.claude'), { recursive: true });

      runSetupClaude();
      runSetupClaude('--uninstall');

      const settingsPath = join(tempDir, '.claude', 'settings.json');
      const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));

      const hookTypes = ['SessionStart', 'PreCompact', 'UserPromptSubmit', 'PostToolUseFailure', 'PostToolUse'];
      for (const hookType of hookTypes) {
        const hookArray = settings.hooks?.[hookType] ?? [];
        expect(hookArray, `hook type ${hookType} should be empty after uninstall`).toHaveLength(0);
      }
    });

    it('is idempotent - does not duplicate hook on re-run', async () => {
      await mkdir(join(tempDir, '.claude'), { recursive: true });

      runSetupClaude();
      runSetupClaude();

      const settingsPath = join(tempDir, '.claude', 'settings.json');
      const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));

      expect(settings.hooks.SessionStart.length).toBe(1);
    });

    it('reports already installed when hook exists', async () => {
      await mkdir(join(tempDir, '.claude'), { recursive: true });

      runSetupClaude();
      const { combined } = runSetupClaude();

      expect(combined.toLowerCase()).toMatch(/already|unchanged/i);
    });

    it('--uninstall removes our hook', async () => {
      await mkdir(join(tempDir, '.claude'), { recursive: true });

      runSetupClaude();

      const { combined } = runSetupClaude('--uninstall');
      expect(combined.toLowerCase()).toMatch(/removed|uninstalled/i);

      const settingsPath = join(tempDir, '.claude', 'settings.json');
      const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));

      expect(settings.hooks.SessionStart).toHaveLength(0);
    });

    it('--uninstall preserves other hooks', async () => {
      const settingsPath = join(tempDir, '.claude', 'settings.json');
      await mkdir(join(tempDir, '.claude'), { recursive: true });
      await writeFile(
        settingsPath,
        JSON.stringify(
          {
            hooks: {
              SessionStart: [
                { matcher: 'startup', hooks: [{ type: 'command', command: 'echo "keep me"' }] },
                {
                  matcher: 'startup|resume|compact',
                  hooks: [{ type: 'command', command: 'npx compound-agent load-session 2>/dev/null || true' }],
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
      expect(settings.hooks.SessionStart.length).toBe(1);
      expect(settings.hooks.SessionStart[0].hooks[0].command).toBe('echo "keep me"');
    });

    it('--dry-run shows changes without writing', async () => {
      const { combined } = runSetupClaude('--dry-run');

      expect(combined.toLowerCase()).toMatch(/would|dry.run/i);

      const settingsPath = join(tempDir, '.claude', 'settings.json');
      expect(existsSync(settingsPath)).toBe(false);
    });

    it('--global installs to global ~/.claude directory', async () => {
      const { combined } = runSetupClaude('--global');
      expect(combined.toLowerCase()).toMatch(/global|installed/i);

      const projectSettings = join(tempDir, '.claude', 'settings.json');
      const globalSettings = join(mockHome, '.claude', 'settings.json');

      expect(existsSync(globalSettings)).toBe(true);
      expect(existsSync(projectSettings)).toBe(false);
    });

    it('--json outputs machine-readable result', async () => {
      await mkdir(join(tempDir, '.claude'), { recursive: true });

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

  describe('setup claude - default behavior change (v0.2.1)', () => {
    beforeEach(async () => {
      await mkdir(join(tempDir, '.claude'), { recursive: true });
    });

    describe('flag semantics (breaking change from v0.2.0)', () => {
      it('default (no flags) installs to project-local .claude/settings.json', async () => {
        const { combined } = runSetupClaude();

        expect(combined.toLowerCase()).toMatch(/installed|ok|success/i);

        const projectSettings = join(tempDir, '.claude', 'settings.json');
        const globalSettings = join(mockHome, '.claude', 'settings.json');

        expect(existsSync(projectSettings)).toBe(true);
        expect(existsSync(globalSettings)).toBe(false);

        const settings = JSON.parse(await readFile(projectSettings, 'utf-8'));
        expect(settings.hooks.SessionStart).toBeDefined();
        expect(settings.hooks.SessionStart.length).toBeGreaterThan(0);
      });

      it('--global flag installs to ~/.claude/settings.json', async () => {
        const { combined } = runSetupClaude('--global');

        expect(combined.toLowerCase()).toMatch(/installed|ok|success/i);

        const projectSettings = join(tempDir, '.claude', 'settings.json');
        const globalSettings = join(mockHome, '.claude', 'settings.json');

        expect(existsSync(globalSettings)).toBe(true);
        expect(existsSync(projectSettings)).toBe(false);

        const settings = JSON.parse(await readFile(globalSettings, 'utf-8'));
        expect(settings.hooks.SessionStart).toBeDefined();
        expect(settings.hooks.SessionStart.length).toBeGreaterThan(0);
      });

      it('--project flag is no longer recognized (removed in v0.2.1)', () => {
        const { combined } = runSetupClaude('--project');

        expect(combined.toLowerCase()).toMatch(/unknown|invalid|option|flag|error/i);
      });
    });

    describe('scope consistency across operations', () => {
      it('uninstall without --global removes from project settings', async () => {
        runSetupClaude();

        const projectSettings = join(tempDir, '.claude', 'settings.json');
        expect(existsSync(projectSettings)).toBe(true);

        const { combined } = runSetupClaude('--uninstall');
        expect(combined.toLowerCase()).toMatch(/removed|uninstalled/i);

        const settings = JSON.parse(await readFile(projectSettings, 'utf-8'));
        expect(settings.hooks.SessionStart).toHaveLength(0);
      });

      it('uninstall with --global removes from global settings', async () => {
        runSetupClaude('--global');

        const globalSettings = join(mockHome, '.claude', 'settings.json');
        expect(existsSync(globalSettings)).toBe(true);

        const { combined } = runSetupClaude('--global --uninstall');
        expect(combined.toLowerCase()).toMatch(/removed|uninstalled/i);

        const settings = JSON.parse(await readFile(globalSettings, 'utf-8'));
        expect(settings.hooks.SessionStart).toHaveLength(0);
      });
    });

    describe('output messages show correct paths', () => {
      it('default install shows project path in output', () => {
        const { combined } = runSetupClaude();

        expect(combined).toContain('.claude/settings.json');
        expect(combined).not.toMatch(/~\/.claude|home/i);
      });

      it('--global install shows global path in output', () => {
        const { combined } = runSetupClaude('--global');

        expect(combined).toContain('~/.claude/settings.json');
      });

      it('JSON output location field matches actual file written (project)', async () => {
        const { stdout } = runSetupClaude('--json');
        const result = JSON.parse(stdout) as { location: string };

        expect(result.location).toBe('.claude/settings.json');

        const projectSettings = join(tempDir, '.claude', 'settings.json');
        expect(existsSync(projectSettings)).toBe(true);
      });

      it('JSON output location field matches actual file written (global)', async () => {
        const { stdout } = runSetupClaude('--global --json');
        const result = JSON.parse(stdout) as { location: string };

        expect(result.location).toBe('~/.claude/settings.json');

        const globalSettings = join(mockHome, '.claude', 'settings.json');
        expect(existsSync(globalSettings)).toBe(true);
      });
    });

    describe('safety: no cross-scope pollution', () => {
      it('project install does not modify global settings', async () => {
        const globalSettings = join(mockHome, '.claude', 'settings.json');
        await writeFile(
          globalSettings,
          JSON.stringify({ permissions: { enabled: true } }, null, 2)
        );
        const globalBefore = await readFile(globalSettings, 'utf-8');

        runSetupClaude();

        const globalAfter = await readFile(globalSettings, 'utf-8');
        expect(globalAfter).toBe(globalBefore);
      });

      it('global install does not modify project settings', async () => {
        const projectSettings = join(tempDir, '.claude', 'settings.json');
        await writeFile(
          projectSettings,
          JSON.stringify({ permissions: { enabled: false } }, null, 2)
        );
        const projectBefore = await readFile(projectSettings, 'utf-8');

        runSetupClaude('--global');

        const projectAfter = await readFile(projectSettings, 'utf-8');
        expect(projectAfter).toBe(projectBefore);
      });
    });

    describe('safety: wrong-scope uninstall does not affect correct scope', () => {
      it('uninstall from project (default) does not affect global hook', async () => {
        runSetupClaude('--global');

        const globalSettings = join(mockHome, '.claude', 'settings.json');
        const globalBefore = await readFile(globalSettings, 'utf-8');

        const { combined } = runSetupClaude('--uninstall');

        expect(combined.toLowerCase()).toMatch(/no.*hook|not found|no.*compound/i);

        const globalAfter = await readFile(globalSettings, 'utf-8');
        expect(globalAfter).toBe(globalBefore);

        const settings = JSON.parse(globalAfter);
        expect(settings.hooks.SessionStart.length).toBeGreaterThan(0);
      });

      it('uninstall from global does not affect project hook', async () => {
        runSetupClaude();

        const projectSettings = join(tempDir, '.claude', 'settings.json');
        const projectBefore = await readFile(projectSettings, 'utf-8');

        const { combined } = runSetupClaude('--global --uninstall');

        expect(combined.toLowerCase()).toMatch(/no.*hook|not found|no.*compound/i);

        const projectAfter = await readFile(projectSettings, 'utf-8');
        expect(projectAfter).toBe(projectBefore);

        const settings = JSON.parse(projectAfter);
        expect(settings.hooks.SessionStart.length).toBeGreaterThan(0);
      });

      it('wrong-scope uninstall suggests correct flag', () => {
        runSetupClaude('--global');

        const { combined } = runSetupClaude('--uninstall');

        expect(combined.toLowerCase()).toMatch(/--global|global.*flag/i);
      });
    });

    describe('safety: idempotency prevents duplicate hooks', () => {
      it('running default install twice does not duplicate project hook', async () => {
        runSetupClaude();
        runSetupClaude();

        const projectSettings = join(tempDir, '.claude', 'settings.json');
        const settings = JSON.parse(await readFile(projectSettings, 'utf-8'));

        expect(settings.hooks.SessionStart.length).toBe(1);
      });

      it('running global install twice does not duplicate global hook', async () => {
        runSetupClaude('--global');
        runSetupClaude('--global');

        const globalSettings = join(mockHome, '.claude', 'settings.json');
        const settings = JSON.parse(await readFile(globalSettings, 'utf-8'));

        expect(settings.hooks.SessionStart.length).toBe(1);
      });

      it('second install shows already installed message', () => {
        runSetupClaude();
        const { combined } = runSetupClaude();

        expect(combined.toLowerCase()).toMatch(/already|unchanged/i);
      });
    });

    describe('edge case: settings directory does not exist', () => {
      it('creates project .claude directory if it does not exist', async () => {
        await rm(join(tempDir, '.claude'), { recursive: true, force: true });

        runSetupClaude();

        const projectSettings = join(tempDir, '.claude', 'settings.json');
        expect(existsSync(projectSettings)).toBe(true);
      });

      it('creates global .claude directory if it does not exist', async () => {
        await rm(join(mockHome, '.claude'), { recursive: true, force: true });

        runSetupClaude('--global');

        const globalSettings = join(mockHome, '.claude', 'settings.json');
        expect(existsSync(globalSettings)).toBe(true);
      });
    });

    describe('dry-run respects scope flag', () => {
      it('--dry-run without --global reports project location', () => {
        const { combined } = runSetupClaude('--dry-run');

        expect(combined).toContain('.claude/settings.json');
        expect(combined.toLowerCase()).toMatch(/would|dry.run/i);

        const projectSettings = join(tempDir, '.claude', 'settings.json');
        const globalSettings = join(mockHome, '.claude', 'settings.json');
        expect(existsSync(projectSettings)).toBe(false);
        expect(existsSync(globalSettings)).toBe(false);
      });

      it('--dry-run with --global reports global location', () => {
        const { combined } = runSetupClaude('--dry-run --global');

        expect(combined).toContain('~/.claude/settings.json');
        expect(combined.toLowerCase()).toMatch(/would|dry.run/i);

        const projectSettings = join(tempDir, '.claude', 'settings.json');
        const globalSettings = join(mockHome, '.claude', 'settings.json');
        expect(existsSync(projectSettings)).toBe(false);
        expect(existsSync(globalSettings)).toBe(false);
      });
    });
  });
});
