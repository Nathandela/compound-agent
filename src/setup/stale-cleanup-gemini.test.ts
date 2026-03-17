/**
 * Tests for cleanStaleGeminiArtifacts().
 *
 * Validates removal of stale .gemini/ entries that no longer match
 * the current WORKFLOW_COMMANDS, PHASE_SKILLS, or AGENT_ROLE_SKILLS registries.
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { cleanStaleGeminiArtifacts } from './stale-cleanup.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'stale-gemini-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// Helper: create a .toml file in .gemini/commands/compound/
async function createToml(name: string): Promise<void> {
  const dir = join(tempDir, '.gemini', 'commands', 'compound');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${name}.toml`), `description = "test"\nprompt = "test"\n`, 'utf8');
}

// Helper: create a skill directory in .gemini/skills/
async function createSkillDir(name: string): Promise<void> {
  const dir = join(tempDir, '.gemini', 'skills', name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), '---\nname: test\n---\nContent\n', 'utf8');
}

describe('cleanStaleGeminiArtifacts', () => {
  // ── S11: stale TOML command removed ──────────────────────────────────

  it('S11: removes .toml file whose stem does not match any WORKFLOW_COMMANDS key', async () => {
    // 'brainstorm' is not a key in WORKFLOW_COMMANDS (was deprecated)
    await createToml('brainstorm');

    const removed = await cleanStaleGeminiArtifacts(tempDir, false);

    expect(removed).toContain('.gemini/commands/compound/brainstorm.toml');
    expect(existsSync(join(tempDir, '.gemini', 'commands', 'compound', 'brainstorm.toml'))).toBe(false);
  });

  // ── S12: valid TOML command kept ─────────────────────────────────────

  it('S12: keeps .toml file whose stem matches a WORKFLOW_COMMANDS key', async () => {
    // 'plan.md' is a key in WORKFLOW_COMMANDS, so 'plan.toml' should be kept
    await createToml('plan');

    const removed = await cleanStaleGeminiArtifacts(tempDir, false);

    expect(removed).not.toContain('.gemini/commands/compound/plan.toml');
    expect(existsSync(join(tempDir, '.gemini', 'commands', 'compound', 'plan.toml'))).toBe(true);
  });

  // ── S13: stale phase skill dir removed ───────────────────────────────

  it('S13: removes compound-<phase> skill dir when phase is NOT in PHASE_SKILLS', async () => {
    // 'brainstorm' is not a key in PHASE_SKILLS
    await createSkillDir('compound-brainstorm');

    const removed = await cleanStaleGeminiArtifacts(tempDir, false);

    expect(removed).toContain('.gemini/skills/compound-brainstorm');
    expect(existsSync(join(tempDir, '.gemini', 'skills', 'compound-brainstorm'))).toBe(false);
  });

  // ── S14: valid phase skill dir kept ──────────────────────────────────

  it('S14: keeps compound-<phase> skill dir when phase IS in PHASE_SKILLS', async () => {
    // 'spec-dev' is a key in PHASE_SKILLS
    await createSkillDir('compound-spec-dev');

    const removed = await cleanStaleGeminiArtifacts(tempDir, false);

    expect(removed).not.toContain('.gemini/skills/compound-spec-dev');
    expect(existsSync(join(tempDir, '.gemini', 'skills', 'compound-spec-dev'))).toBe(true);
  });

  // ── S15: stale agent role skill dir removed ──────────────────────────

  it('S15: removes compound-agent-<name> skill dir when name is NOT in AGENT_ROLE_SKILLS', async () => {
    // 'old' is not a key in AGENT_ROLE_SKILLS
    await createSkillDir('compound-agent-old');

    const removed = await cleanStaleGeminiArtifacts(tempDir, false);

    expect(removed).toContain('.gemini/skills/compound-agent-old');
    expect(existsSync(join(tempDir, '.gemini', 'skills', 'compound-agent-old'))).toBe(false);
  });

  // ── S16: non-compound skill dir untouched ────────────────────────────

  it('S16: does NOT touch skill directories that do not start with compound-', async () => {
    await createSkillDir('my-skill');

    const removed = await cleanStaleGeminiArtifacts(tempDir, false);

    expect(removed).not.toContain('.gemini/skills/my-skill');
    expect(existsSync(join(tempDir, '.gemini', 'skills', 'my-skill'))).toBe(true);
  });

  // ── S17: dry-run mode ────────────────────────────────────────────────

  it('S17: dry-run lists stale entries but does NOT delete them', async () => {
    await createToml('brainstorm');
    await createSkillDir('compound-brainstorm');
    await createSkillDir('compound-agent-old');

    const removed = await cleanStaleGeminiArtifacts(tempDir, true);

    // Should report all three stale entries
    expect(removed).toContain('.gemini/commands/compound/brainstorm.toml');
    expect(removed).toContain('.gemini/skills/compound-brainstorm');
    expect(removed).toContain('.gemini/skills/compound-agent-old');

    // Nothing should have been deleted
    expect(existsSync(join(tempDir, '.gemini', 'commands', 'compound', 'brainstorm.toml'))).toBe(true);
    expect(existsSync(join(tempDir, '.gemini', 'skills', 'compound-brainstorm'))).toBe(true);
    expect(existsSync(join(tempDir, '.gemini', 'skills', 'compound-agent-old'))).toBe(true);
  });

  // ── Edge cases ───────────────────────────────────────────────────────

  it('returns empty array when .gemini/ directory does not exist', async () => {
    const removed = await cleanStaleGeminiArtifacts(tempDir, false);
    expect(removed).toEqual([]);
  });

  it('returns empty array when .gemini/ exists but has no commands or skills', async () => {
    await mkdir(join(tempDir, '.gemini'), { recursive: true });
    const removed = await cleanStaleGeminiArtifacts(tempDir, false);
    expect(removed).toEqual([]);
  });

  it('handles mix of stale and valid entries in a single pass', async () => {
    // Valid entries
    await createToml('plan');
    await createToml('work');
    await createSkillDir('compound-spec-dev');
    await createSkillDir('compound-agent-repo-analyst');

    // Stale entries
    await createToml('brainstorm');
    await createToml('old-command');
    await createSkillDir('compound-brainstorm');
    await createSkillDir('compound-agent-old');

    // Non-compound (should be ignored)
    await createSkillDir('my-custom-skill');

    const removed = await cleanStaleGeminiArtifacts(tempDir, false);

    // Stale entries removed
    expect(removed).toContain('.gemini/commands/compound/brainstorm.toml');
    expect(removed).toContain('.gemini/commands/compound/old-command.toml');
    expect(removed).toContain('.gemini/skills/compound-brainstorm');
    expect(removed).toContain('.gemini/skills/compound-agent-old');
    expect(removed).toHaveLength(4);

    // Valid entries still exist
    expect(existsSync(join(tempDir, '.gemini', 'commands', 'compound', 'plan.toml'))).toBe(true);
    expect(existsSync(join(tempDir, '.gemini', 'commands', 'compound', 'work.toml'))).toBe(true);
    expect(existsSync(join(tempDir, '.gemini', 'skills', 'compound-spec-dev'))).toBe(true);
    expect(existsSync(join(tempDir, '.gemini', 'skills', 'compound-agent-repo-analyst'))).toBe(true);
    expect(existsSync(join(tempDir, '.gemini', 'skills', 'my-custom-skill'))).toBe(true);
  });

  it('keeps compound-agent-<name> when name IS in AGENT_ROLE_SKILLS', async () => {
    // 'repo-analyst' is a key in AGENT_ROLE_SKILLS
    await createSkillDir('compound-agent-repo-analyst');

    const removed = await cleanStaleGeminiArtifacts(tempDir, false);

    expect(removed).not.toContain('.gemini/skills/compound-agent-repo-analyst');
    expect(existsSync(join(tempDir, '.gemini', 'skills', 'compound-agent-repo-analyst'))).toBe(true);
  });

  it('ignores non-.toml files in .gemini/commands/compound/', async () => {
    const dir = join(tempDir, '.gemini', 'commands', 'compound');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'README.md'), 'some readme', 'utf8');

    const removed = await cleanStaleGeminiArtifacts(tempDir, false);

    expect(removed).toEqual([]);
    expect(existsSync(join(dir, 'README.md'))).toBe(true);
  });
});
