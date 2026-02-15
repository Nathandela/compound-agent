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
});
