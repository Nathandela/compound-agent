/**
 * CLI tests for lna CLI alias (v0.2.1) and documentation requirements.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { cleanupCliTestDir, runCli, setupCliTestDir } from './cli-test-utils.js';

describe('CLI', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupCliTestDir();
  });

  afterEach(async () => {
    await cleanupCliTestDir(tempDir);
  });

  describe('lna CLI alias (v0.2.1)', () => {
    describe('package.json bin configuration', () => {
      it('has both learning-agent and lna bin entries', async () => {
        const pkgPath = join(process.cwd(), 'package.json');
        const pkgContent = await readFile(pkgPath, 'utf8');
        const pkg = JSON.parse(pkgContent) as { bin?: Record<string, string> };

        expect(pkg.bin).toBeDefined();
        expect(pkg.bin!['learning-agent']).toBe('./dist/cli.js');
        expect(pkg.bin!['lna']).toBe('./dist/cli.js');
      });

      it('both bin entries point to identical path', async () => {
        const pkgPath = join(process.cwd(), 'package.json');
        const pkgContent = await readFile(pkgPath, 'utf8');
        const pkg = JSON.parse(pkgContent) as { bin?: Record<string, string> };

        expect(pkg.bin!['lna']).toBe(pkg.bin!['learning-agent']);
      });

      it('has exactly 2 bin entries (lna and learning-agent)', async () => {
        const pkgPath = join(process.cwd(), 'package.json');
        const pkgContent = await readFile(pkgPath, 'utf8');
        const pkg = JSON.parse(pkgContent) as { bin?: Record<string, string> };

        const binKeys = Object.keys(pkg.bin ?? {});
        expect(binKeys).toHaveLength(2);
        expect(binKeys).toContain('lna');
        expect(binKeys).toContain('learning-agent');
      });
    });

    describe('Claude-facing strings use npx lna', () => {
      it('AGENTS_MD_TEMPLATE uses npx lna (not npx learning-agent)', async () => {
        const cliPath = join(process.cwd(), 'src', 'cli.ts');
        const cliContent = await readFile(cliPath, 'utf8');

        const templateMatch = cliContent.match(/const AGENTS_MD_TEMPLATE = `([\s\S]*?)`;\n\n/);
        expect(templateMatch).toBeTruthy();

        const templateContent = templateMatch![1];

        expect(templateContent).toContain('npx lna check-plan');

        expect(templateContent).not.toContain('npx learning-agent');
      });

      it('PRE_COMMIT_MESSAGE uses npx lna capture', async () => {
        const cliPath = join(process.cwd(), 'src', 'cli.ts');
        const cliContent = await readFile(cliPath, 'utf8');

        const messageMatch = cliContent.match(/const PRE_COMMIT_MESSAGE = `([\s\S]*?)`;/);
        expect(messageMatch).toBeTruthy();

        const messageContent = messageMatch![1];

        expect(messageContent).toContain('npx lna capture');

        expect(messageContent).not.toContain('npx learning-agent');
      });

      it('CLAUDE_HOOK_CONFIG uses npx lna load-session', async () => {
        const cliPath = join(process.cwd(), 'src', 'cli.ts');
        const cliContent = await readFile(cliPath, 'utf8');

        const hookMatch = cliContent.match(/const CLAUDE_HOOK_CONFIG = \{([\s\S]*?)\};/);
        expect(hookMatch).toBeTruthy();

        const hookContent = hookMatch![1];

        expect(hookContent).toContain('npx lna load-session');

        expect(hookContent).not.toContain('npx learning-agent');
      });

      it('check-plan error message suggests npx lna download-model', async () => {
        const cliPath = join(process.cwd(), 'src', 'cli.ts');
        const cliContent = await readFile(cliPath, 'utf8');

        const errorMatches = cliContent.match(/Run: npx [\w-]+ download-model/g);
        expect(errorMatches).toBeTruthy();
        expect(errorMatches!.length).toBeGreaterThan(0);

        errorMatches!.forEach((match) => {
          expect(match).toBe('Run: npx lna download-model');
        });
      });
    });

    describe('backwards compatibility', () => {
      it('learning-agent command still works for basic commands', () => {
        const { combined } = runCli('--version', tempDir);
        expect(combined).toMatch(/\d+\.\d+\.\d+/);
      });
    });

    describe('documentation consistency', () => {
      it('no random mixing of lna and learning-agent in templates', async () => {
        const cliPath = join(process.cwd(), 'src', 'cli.ts');
        const cliContent = await readFile(cliPath, 'utf8');

        const agentsTemplate = cliContent.match(/const AGENTS_MD_TEMPLATE = `([\s\S]*?)`;\n\n/)?.[1] ?? '';
        const preCommitMsg = cliContent.match(/const PRE_COMMIT_MESSAGE = `([\s\S]*?)`;/)?.[1] ?? '';
        const claudeHook = cliContent.match(/const CLAUDE_HOOK_CONFIG = \{([\s\S]*?)\};/)?.[1] ?? '';

        const combinedTemplates = agentsTemplate + preCommitMsg + claudeHook;

        const lnaCount = (combinedTemplates.match(/npx lna/g) || []).length;
        const learningAgentCount = (combinedTemplates.match(/npx learning-agent/g) || []).length;

        expect(lnaCount).toBeGreaterThan(0);
        expect(learningAgentCount).toBe(0);
      });
    });
  });

  describe('AGENTS_MD_TEMPLATE - no manual editing warning (v0.2.1)', () => {
    let agentsTemplate: string;

    beforeAll(async () => {
      const cliPath = join(process.cwd(), 'src', 'cli.ts');
      const cliContent = await readFile(cliPath, 'utf8');
      agentsTemplate = cliContent.match(/const AGENTS_MD_TEMPLATE = `([\s\S]*?)`;\n\n/)?.[1] ?? '';
    });

    it('contains "Never Edit JSONL Directly" section header', () => {
      expect(agentsTemplate).toContain('Never Edit JSONL Directly');
    });

    it('warns about manual editing consequences', () => {
      expect(agentsTemplate).toMatch(/manual.*edit|directly.*edit/i);
      expect(agentsTemplate).toMatch(/break|corrupt|bypass/i);
    });

    it('lists CLI commands as the correct way to modify lessons', () => {
      expect(agentsTemplate).toContain('npx lna learn');
      expect(agentsTemplate).toContain('npx lna update');
      expect(agentsTemplate).toContain('npx lna delete');
    });

    it('mentions SQLite sync issues from manual edits', () => {
      expect(agentsTemplate).toMatch(/sqlite.*sync|sync.*sqlite/i);
    });

    it('warning section is prominent (uses emoji or strong marker)', () => {
      expect(agentsTemplate).toMatch(/WARNING|IMPORTANT|DO NOT/i);
    });
  });

  describe('README - lesson format documentation (v0.2.1)', () => {
    let readmeContent: string;

    beforeAll(async () => {
      const readmePath = join(process.cwd(), 'README.md');
      readmeContent = await readFile(readmePath, 'utf8');
    });

    it('documents required fields for lessons', () => {
      expect(readmeContent).toMatch(/required.*field|field.*required/i);
    });

    it('explains difference between type=quick and type=full', () => {
      expect(readmeContent).toContain('type');
      expect(readmeContent).toContain('quick');
      expect(readmeContent).toContain('full');
    });

    it('documents that severity is a SEPARATE field from type', () => {
      expect(readmeContent).toContain('severity');
      expect(readmeContent).toMatch(/severity.*field|high.*medium.*low/i);
    });

    it('documents session-start loading requirements', () => {
      expect(readmeContent).toMatch(/session.*start|high.*severity.*load/i);
      expect(readmeContent).toContain('confirmed');
    });

    it('shows complete JSON example with all required fields', () => {
      expect(readmeContent).toContain('"id"');
      expect(readmeContent).toContain('"type"');
      expect(readmeContent).toContain('"trigger"');
      expect(readmeContent).toContain('"insight"');
      expect(readmeContent).toContain('"tags"');
      expect(readmeContent).toContain('"source"');
      expect(readmeContent).toContain('"confirmed"');
    });

    it('has a dedicated Lesson Schema section', () => {
      expect(readmeContent).toMatch(/##.*lesson.*schema|##.*lesson.*format/i);
    });
  });
});
