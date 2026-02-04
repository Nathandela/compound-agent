/**
 * CLI tests for lna CLI alias (v0.2.1) and documentation requirements.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { cleanupCliTestDir, runCli, setupCliTestDir } from './cli-test-utils.js';

describe('CLI', { tags: ['integration'] }, () => {
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

      it('has required bin entries (lna, learning-agent, learning-agent-mcp)', async () => {
        const pkgPath = join(process.cwd(), 'package.json');
        const pkgContent = await readFile(pkgPath, 'utf8');
        const pkg = JSON.parse(pkgContent) as { bin?: Record<string, string> };

        const binKeys = Object.keys(pkg.bin ?? {});
        expect(binKeys).toHaveLength(3);
        expect(binKeys).toContain('lna');
        expect(binKeys).toContain('learning-agent');
        expect(binKeys).toContain('learning-agent-mcp');
      });
    });

    describe('Claude-facing strings use npx lna', () => {
      it('AGENTS_MD_TEMPLATE uses npx lna (not npx learning-agent)', async () => {
        const templatesPath = join(process.cwd(), 'src', 'commands', 'setup', 'templates.ts');
        const templatesContent = await readFile(templatesPath, 'utf8');

        const templateMatch = templatesContent.match(/export const AGENTS_MD_TEMPLATE = `([\s\S]*?)`;\n\n/);
        expect(templateMatch).toBeTruthy();

        const templateContent = templateMatch![1];

        // v0.2.4: uses lesson_search MCP tool, CLI commands still use lna prefix
        expect(templateContent).toContain('npx lna search');
        expect(templateContent).toContain('npx lna learn');

        expect(templateContent).not.toContain('npx learning-agent');
      });

      it('PRE_COMMIT_MESSAGE uses npx lna learn (preferred alias)', async () => {
        const templatesPath = join(process.cwd(), 'src', 'commands', 'setup', 'templates.ts');
        const templatesContent = await readFile(templatesPath, 'utf8');

        const messageMatch = templatesContent.match(/export const PRE_COMMIT_MESSAGE = `([\s\S]*?)`;/);
        expect(messageMatch).toBeTruthy();

        const messageContent = messageMatch![1];

        // Uses 'learn' alias (preferred) or 'capture' (also valid)
        expect(messageContent).toMatch(/npx lna (learn|capture)/);

        expect(messageContent).not.toContain('npx learning-agent');
      });

      it('CLAUDE_HOOK_CONFIG uses npx lna prime (v0.2.4)', async () => {
        const templatesPath = join(process.cwd(), 'src', 'commands', 'setup', 'templates.ts');
        const templatesContent = await readFile(templatesPath, 'utf8');

        const hookMatch = templatesContent.match(/export const CLAUDE_HOOK_CONFIG = \{([\s\S]*?)\};/);
        expect(hookMatch).toBeTruthy();

        const hookContent = hookMatch![1];

        // v0.2.4: uses prime instead of load-session for trust language
        expect(hookContent).toContain('npx lna prime');

        expect(hookContent).not.toContain('npx learning-agent');
      });

      it('check-plan error message suggests npx lna download-model', async () => {
        // Error messages now come from model.ts (isModelUsable function)
        const modelPath = join(process.cwd(), 'src', 'embeddings', 'model.ts');
        const modelContent = await readFile(modelPath, 'utf8');

        const errorMatches = modelContent.match(/npx lna download-model/g);
        expect(errorMatches).toBeTruthy();
        expect(errorMatches!.length).toBeGreaterThan(0);
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
        const templatesPath = join(process.cwd(), 'src', 'commands', 'setup', 'templates.ts');
        const templatesContent = await readFile(templatesPath, 'utf8');

        const agentsTemplate = templatesContent.match(/export const AGENTS_MD_TEMPLATE = `([\s\S]*?)`;\n\n/)?.[1] ?? '';
        const preCommitMsg = templatesContent.match(/export const PRE_COMMIT_MESSAGE = `([\s\S]*?)`;/)?.[1] ?? '';
        const claudeHook = templatesContent.match(/export const CLAUDE_HOOK_CONFIG = \{([\s\S]*?)\};/)?.[1] ?? '';

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
      const templatesPath = join(process.cwd(), 'src', 'commands', 'setup', 'templates.ts');
      const templatesContent = await readFile(templatesPath, 'utf8');
      agentsTemplate = templatesContent.match(/export const AGENTS_MD_TEMPLATE = `([\s\S]*?)`;\n\n/)?.[1] ?? '';
    });

    it('contains "Never Edit JSONL Directly" section header', () => {
      expect(agentsTemplate).toContain('Never Edit JSONL Directly');
    });

    it('warns about direct editing consequences', () => {
      expect(agentsTemplate).toMatch(/NEVER.*edit.*index\.jsonl/i);
    });

    it('lists MCP tools as primary and CLI as fallback', () => {
      // MCP tools are primary
      expect(agentsTemplate).toContain('lesson_capture');
      expect(agentsTemplate).toContain('lesson_search');
      // CLI is fallback
      expect(agentsTemplate).toContain('CLI (fallback only)');
      expect(agentsTemplate).toContain('npx lna learn');
    });

    it('mentions schema/validation/sync issues from manual edits', () => {
      expect(agentsTemplate).toMatch(/schema|validation|sync/i);
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
