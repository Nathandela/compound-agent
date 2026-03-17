/**
 * Tests for cleanStaleArtifacts().
 * Covers: commands, agents, skills (phase + agent-role), docs cleanup.
 * Scenarios S1-S21 from the specification.
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { cleanStaleArtifacts } from './stale-cleanup.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'stale-cleanup-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helper: create a file (with intermediate dirs)
// ---------------------------------------------------------------------------
async function createFile(relativePath: string, content = 'stub'): Promise<void> {
  const full = join(tempDir, relativePath);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Helper: create a directory (empty)
// ---------------------------------------------------------------------------
async function createDir(relativePath: string): Promise<void> {
  await mkdir(join(tempDir, relativePath), { recursive: true });
}

// ---------------------------------------------------------------------------
// Commands: .claude/commands/compound/
// ---------------------------------------------------------------------------
describe('commands cleanup', () => {
  const cmdDir = '.claude/commands/compound';

  it('S1: removes stale .md file not in WORKFLOW_COMMANDS', async () => {
    await createFile(`${cmdDir}/brainstorm.md`);

    const removed = await cleanStaleArtifacts(tempDir, false);

    expect(removed).toContain('.claude/commands/compound/brainstorm.md');
    expect(existsSync(join(tempDir, cmdDir, 'brainstorm.md'))).toBe(false);
  });

  it('S2: keeps .md file that IS in WORKFLOW_COMMANDS', async () => {
    await createFile(`${cmdDir}/plan.md`);

    const removed = await cleanStaleArtifacts(tempDir, false);

    expect(removed).not.toContain('.claude/commands/compound/plan.md');
    expect(existsSync(join(tempDir, cmdDir, 'plan.md'))).toBe(true);
  });

  it('S3: empty commands/ directory causes no error', async () => {
    await createDir(cmdDir);

    const removed = await cleanStaleArtifacts(tempDir, false);

    // No commands-related paths
    const cmdPaths = removed.filter((p) => p.includes('commands/'));
    expect(cmdPaths).toEqual([]);
  });

  it('S4: missing commands/ directory causes no error', async () => {
    // Do not create the directory at all
    const removed = await cleanStaleArtifacts(tempDir, false);

    expect(removed).toEqual([]);
  });

  it('S21: .DS_Store in commands/ is skipped (not a .md file)', async () => {
    await createFile(`${cmdDir}/.DS_Store`);

    const removed = await cleanStaleArtifacts(tempDir, false);

    expect(removed).not.toContain('.claude/commands/compound/.DS_Store');
    expect(existsSync(join(tempDir, cmdDir, '.DS_Store'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Agents: .claude/agents/compound/
// ---------------------------------------------------------------------------
describe('agents cleanup', () => {
  const agentDir = '.claude/agents/compound';

  it('S5: removes stale .md file not in AGENT_TEMPLATES', async () => {
    await createFile(`${agentDir}/codex.md`);

    const removed = await cleanStaleArtifacts(tempDir, false);

    expect(removed).toContain('.claude/agents/compound/codex.md');
    expect(existsSync(join(tempDir, agentDir, 'codex.md'))).toBe(false);
  });

  it('keeps .md file that IS in AGENT_TEMPLATES', async () => {
    await createFile(`${agentDir}/repo-analyst.md`);

    const removed = await cleanStaleArtifacts(tempDir, false);

    expect(removed).not.toContain('.claude/agents/compound/repo-analyst.md');
    expect(existsSync(join(tempDir, agentDir, 'repo-analyst.md'))).toBe(true);
  });

  it('skips non-.md files in agents/', async () => {
    await createFile(`${agentDir}/.DS_Store`);

    const removed = await cleanStaleArtifacts(tempDir, false);

    expect(removed).not.toContain('.claude/agents/compound/.DS_Store');
    expect(existsSync(join(tempDir, agentDir, '.DS_Store'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Skills (phase): .claude/skills/compound/
// ---------------------------------------------------------------------------
describe('skills phase cleanup', () => {
  const skillsDir = '.claude/skills/compound';

  it('S6: removes stale directory not in PHASE_SKILLS', async () => {
    await createDir(`${skillsDir}/brainstorm`);

    const removed = await cleanStaleArtifacts(tempDir, false);

    expect(removed).toContain('.claude/skills/compound/brainstorm');
    expect(existsSync(join(tempDir, skillsDir, 'brainstorm'))).toBe(false);
  });

  it('S7: agents/ subdirectory in skills/ is skipped (special case)', async () => {
    await createDir(`${skillsDir}/agents`);

    const removed = await cleanStaleArtifacts(tempDir, false);

    expect(removed).not.toContain('.claude/skills/compound/agents');
    expect(existsSync(join(tempDir, skillsDir, 'agents'))).toBe(true);
  });

  it('keeps directory that IS in PHASE_SKILLS', async () => {
    await createDir(`${skillsDir}/spec-dev`);

    const removed = await cleanStaleArtifacts(tempDir, false);

    expect(removed).not.toContain('.claude/skills/compound/spec-dev');
    expect(existsSync(join(tempDir, skillsDir, 'spec-dev'))).toBe(true);
  });

  it('skips non-directory entries in skills/', async () => {
    await createFile(`${skillsDir}/.DS_Store`);

    const removed = await cleanStaleArtifacts(tempDir, false);

    expect(removed).not.toContain('.claude/skills/compound/.DS_Store');
    expect(existsSync(join(tempDir, skillsDir, '.DS_Store'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Skills (agent-role): .claude/skills/compound/agents/
// ---------------------------------------------------------------------------
describe('skills agent-role cleanup', () => {
  const agentsSkillDir = '.claude/skills/compound/agents';

  it('S8: removes stale directory not in AGENT_ROLE_SKILLS', async () => {
    await createDir(`${agentsSkillDir}/old-role`);

    const removed = await cleanStaleArtifacts(tempDir, false);

    expect(removed).toContain('.claude/skills/compound/agents/old-role');
    expect(existsSync(join(tempDir, agentsSkillDir, 'old-role'))).toBe(false);
  });

  it('keeps directory that IS in AGENT_ROLE_SKILLS', async () => {
    await createDir(`${agentsSkillDir}/test-writer`);

    const removed = await cleanStaleArtifacts(tempDir, false);

    expect(removed).not.toContain('.claude/skills/compound/agents/test-writer');
    expect(existsSync(join(tempDir, agentsSkillDir, 'test-writer'))).toBe(true);
  });

  it('skips non-directory entries in agents/', async () => {
    await createFile(`${agentsSkillDir}/.gitkeep`);

    const removed = await cleanStaleArtifacts(tempDir, false);

    expect(removed).not.toContain('.claude/skills/compound/agents/.gitkeep');
    expect(existsSync(join(tempDir, agentsSkillDir, '.gitkeep'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Docs: docs/compound/
// ---------------------------------------------------------------------------
describe('docs cleanup', () => {
  const docsDir = 'docs/compound';

  it('S9: removes stale file not in DOC_TEMPLATES', async () => {
    await createFile(`${docsDir}/HOW_TO_COMPOUND.md`);

    const removed = await cleanStaleArtifacts(tempDir, false);

    expect(removed).toContain('docs/compound/HOW_TO_COMPOUND.md');
    expect(existsSync(join(tempDir, docsDir, 'HOW_TO_COMPOUND.md'))).toBe(false);
  });

  it('S10: research/ directory in docs/ is skipped (special case)', async () => {
    await createDir(`${docsDir}/research`);

    const removed = await cleanStaleArtifacts(tempDir, false);

    expect(removed).not.toContain('docs/compound/research');
    expect(existsSync(join(tempDir, docsDir, 'research'))).toBe(true);
  });

  it('keeps file that IS in DOC_TEMPLATES', async () => {
    await createFile(`${docsDir}/README.md`);

    const removed = await cleanStaleArtifacts(tempDir, false);

    expect(removed).not.toContain('docs/compound/README.md');
    expect(existsSync(join(tempDir, docsDir, 'README.md'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Dry-run mode
// ---------------------------------------------------------------------------
describe('dry-run mode', () => {
  it('S17: stale files are listed but NOT deleted', async () => {
    await createFile('.claude/commands/compound/brainstorm.md');
    await createFile('.claude/agents/compound/codex.md');
    await createDir('.claude/skills/compound/brainstorm');

    const removed = await cleanStaleArtifacts(tempDir, true);

    // Should report what would be removed
    expect(removed).toContain('.claude/commands/compound/brainstorm.md');
    expect(removed).toContain('.claude/agents/compound/codex.md');
    expect(removed).toContain('.claude/skills/compound/brainstorm');

    // Files/dirs must still exist on disk
    expect(existsSync(join(tempDir, '.claude/commands/compound/brainstorm.md'))).toBe(true);
    expect(existsSync(join(tempDir, '.claude/agents/compound/codex.md'))).toBe(true);
    expect(existsSync(join(tempDir, '.claude/skills/compound/brainstorm'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Return value: array of removed relative paths
// ---------------------------------------------------------------------------
describe('return value', () => {
  it('S18: returns one relative path per removed artifact', async () => {
    await createFile('.claude/commands/compound/brainstorm.md');
    await createFile('.claude/agents/compound/codex.md');
    await createDir('.claude/skills/compound/brainstorm');

    const removed = await cleanStaleArtifacts(tempDir, false);

    expect(removed).toHaveLength(3);
    expect(removed.sort()).toEqual([
      '.claude/agents/compound/codex.md',
      '.claude/commands/compound/brainstorm.md',
      '.claude/skills/compound/brainstorm',
    ]);
  });

  it('returns empty array when nothing is stale', async () => {
    // Only valid entries
    await createFile('.claude/commands/compound/plan.md');
    await createFile('.claude/agents/compound/repo-analyst.md');
    await createDir('.claude/skills/compound/spec-dev');
    await createDir('.claude/skills/compound/agents/test-writer');
    await createFile('docs/compound/README.md');

    const removed = await cleanStaleArtifacts(tempDir, false);

    expect(removed).toEqual([]);
  });

  it('returns empty array when no compound directories exist', async () => {
    const removed = await cleanStaleArtifacts(tempDir, false);
    expect(removed).toEqual([]);
  });
});
