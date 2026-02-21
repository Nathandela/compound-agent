/**
 * Tests for doctor command — verify external dependencies and project health.
 *
 * Follows TDD: Tests written BEFORE implementation.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runDoctor, type DoctorCheck } from './doctor.js';

describe('Doctor Command', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'compound-agent-doctor-'));
    // Create minimal .claude/ structure
    await mkdir(join(tempDir, '.claude'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // ============================================================================
  // Return type
  // ============================================================================

  it('returns an array of DoctorCheck objects', async () => {
    const checks = await runDoctor(tempDir);
    expect(Array.isArray(checks)).toBe(true);
    expect(checks.length).toBeGreaterThan(0);
    for (const check of checks) {
      expect(check).toHaveProperty('name');
      expect(check).toHaveProperty('status');
      expect(['pass', 'fail', 'warn']).toContain(check.status);
    }
  });

  // ============================================================================
  // .claude/ directory check
  // ============================================================================

  it('passes when .claude/ directory exists', async () => {
    const checks = await runDoctor(tempDir);
    const dirCheck = checks.find(c => c.name === '.claude directory');
    expect(dirCheck).toBeDefined();
    expect(dirCheck!.status).toBe('pass');
  });

  it('fails when .claude/ directory is missing', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'compound-agent-doctor-empty-'));
    try {
      const checks = await runDoctor(emptyDir);
      const dirCheck = checks.find(c => c.name === '.claude directory');
      expect(dirCheck).toBeDefined();
      expect(dirCheck!.status).toBe('fail');
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });

  // ============================================================================
  // Lessons index check
  // ============================================================================

  it('passes when lessons index exists', async () => {
    await mkdir(join(tempDir, '.claude', 'lessons'), { recursive: true });
    await writeFile(join(tempDir, '.claude', 'lessons', 'index.jsonl'), '', 'utf-8');

    const checks = await runDoctor(tempDir);
    const lessonsCheck = checks.find(c => c.name === 'Lessons index');
    expect(lessonsCheck).toBeDefined();
    expect(lessonsCheck!.status).toBe('pass');
  });

  it('warns when lessons index is missing', async () => {
    const checks = await runDoctor(tempDir);
    const lessonsCheck = checks.find(c => c.name === 'Lessons index');
    expect(lessonsCheck).toBeDefined();
    expect(lessonsCheck!.status).toBe('warn');
  });

  // ============================================================================
  // Agent templates check
  // ============================================================================

  it('passes when agent templates directory exists', async () => {
    await mkdir(join(tempDir, '.claude', 'agents', 'compound'), { recursive: true });

    const checks = await runDoctor(tempDir);
    const agentsCheck = checks.find(c => c.name === 'Agent templates');
    expect(agentsCheck).toBeDefined();
    expect(agentsCheck!.status).toBe('pass');
  });

  it('fails when agent templates directory is missing', async () => {
    const checks = await runDoctor(tempDir);
    const agentsCheck = checks.find(c => c.name === 'Agent templates');
    expect(agentsCheck).toBeDefined();
    expect(agentsCheck!.status).toBe('fail');
  });

  // ============================================================================
  // Each check has a fix hint on failure/warn
  // ============================================================================

  it('provides fix hint for failed checks', async () => {
    // No .claude/agents/compound → fail with hint
    const checks = await runDoctor(tempDir);
    const failed = checks.filter(c => c.status === 'fail' || c.status === 'warn');
    for (const check of failed) {
      expect(check.fix).toBeDefined();
      expect(check.fix!.length).toBeGreaterThan(0);
    }
  });

  // ============================================================================
  // Does not throw on missing repo structure
  // ============================================================================

  it('does not throw even when nothing is installed', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'compound-agent-doctor-bare-'));
    try {
      await expect(runDoctor(emptyDir)).resolves.not.toThrow();
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });

  // ============================================================================
  // Beads CLI check
  // ============================================================================

  it('includes Beads CLI check in results', async () => {
    const checks = await runDoctor(tempDir);
    const beadsCheck = checks.find(c => c.name === 'Beads CLI');
    expect(beadsCheck).toBeDefined();
    // Status should be 'pass' or 'warn' (never 'fail')
    expect(['pass', 'warn']).toContain(beadsCheck!.status);
  });

  it('Beads CLI check uses warn (not fail) when bd is missing', async () => {
    const checks = await runDoctor(tempDir);
    const beadsCheck = checks.find(c => c.name === 'Beads CLI');
    expect(beadsCheck).toBeDefined();
    if (beadsCheck!.status === 'warn') {
      expect(beadsCheck!.fix).toContain('https://github.com/Nathandela/beads');
    }
  });

  // ============================================================================
  // .gitignore health check
  // ============================================================================

  it('passes .gitignore check when all patterns present', async () => {
    await writeFile(
      join(tempDir, '.gitignore'),
      'node_modules/\n.claude/.cache/\n',
      'utf-8'
    );

    const checks = await runDoctor(tempDir);
    const gitignoreCheck = checks.find(c => c.name === '.gitignore health');
    expect(gitignoreCheck).toBeDefined();
    expect(gitignoreCheck!.status).toBe('pass');
  });

  it('warns .gitignore check when .gitignore is missing', async () => {
    const checks = await runDoctor(tempDir);
    const gitignoreCheck = checks.find(c => c.name === '.gitignore health');
    expect(gitignoreCheck).toBeDefined();
    expect(gitignoreCheck!.status).toBe('warn');
  });

  it('warns .gitignore check when patterns are missing', async () => {
    await writeFile(join(tempDir, '.gitignore'), 'dist/\n', 'utf-8');

    const checks = await runDoctor(tempDir);
    const gitignoreCheck = checks.find(c => c.name === '.gitignore health');
    expect(gitignoreCheck).toBeDefined();
    expect(gitignoreCheck!.status).toBe('warn');
    expect(gitignoreCheck!.fix).toContain('npx ca setup --update');
  });

  // ============================================================================
  // Usage documentation check
  // ============================================================================

  it('passes usage documentation check when README.md exists', async () => {
    await mkdir(join(tempDir, 'docs', 'compound'), { recursive: true });
    await writeFile(join(tempDir, 'docs', 'compound', 'README.md'), '# Compound Agent', 'utf-8');

    const checks = await runDoctor(tempDir);
    const docCheck = checks.find(c => c.name === 'Usage documentation');
    expect(docCheck).toBeDefined();
    expect(docCheck!.status).toBe('pass');
  });

  it('warns usage documentation check when README.md is missing', async () => {
    const checks = await runDoctor(tempDir);
    const docCheck = checks.find(c => c.name === 'Usage documentation');
    expect(docCheck).toBeDefined();
    expect(docCheck!.status).toBe('warn');
    expect(docCheck!.fix).toContain('npx ca setup');
  });
});
