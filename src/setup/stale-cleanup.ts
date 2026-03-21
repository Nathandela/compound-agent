/**
 * Dynamic stale artifact cleanup for --update.
 *
 * Scans managed directories and removes entries not present
 * in the current template registries. Replaces hardcoded
 * DEPRECATED_COMMANDS / DEPRECATED_PATHS lists.
 */

import { existsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import {
  AGENT_TEMPLATES,
  AGENT_ROLE_SKILLS,
  DOC_TEMPLATES,
  PHASE_SKILLS,
  WORKFLOW_COMMANDS,
} from './templates/index.js';

/**
 * Remove Claude-side artifacts not present in current template registries.
 *
 * Scans:
 *   .claude/commands/compound/  (WORKFLOW_COMMANDS, .md files)
 *   .claude/agents/compound/    (AGENT_TEMPLATES, .md files)
 *   .claude/skills/compound/    (PHASE_SKILLS, directories; skips 'agents')
 *   .claude/skills/compound/agents/ (AGENT_ROLE_SKILLS, directories)
 *   docs/compound/              (DOC_TEMPLATES, files; skips 'research')
 *
 * @returns Array of relative paths removed (or would-be-removed in dry-run).
 */
export async function cleanStaleArtifacts(repoRoot: string, dryRun: boolean): Promise<string[]> {
  const removed: string[] = [];

  // 1. Commands: .claude/commands/compound/ — only .md files
  await cleanDir(repoRoot, ['.claude', 'commands', 'compound'], removed, dryRun, {
    filter: (name) => name.endsWith('.md'),
    isStale: (name) => !(name in WORKFLOW_COMMANDS),
  });

  // 2. Agents: .claude/agents/compound/ — only .md files
  await cleanDir(repoRoot, ['.claude', 'agents', 'compound'], removed, dryRun, {
    filter: (name) => name.endsWith('.md'),
    isStale: (name) => !(name in AGENT_TEMPLATES),
  });

  // 3. Skills (phase): .claude/skills/compound/ — directories only, skip 'agents'
  await cleanDir(repoRoot, ['.claude', 'skills', 'compound'], removed, dryRun, {
    filter: (_name, isDir) => isDir,
    isStale: (name) => name !== 'agents' && !(name in PHASE_SKILLS),
  });

  // 4. Skills (agent-role): .claude/skills/compound/agents/ — directories only
  await cleanDir(repoRoot, ['.claude', 'skills', 'compound', 'agents'], removed, dryRun, {
    filter: (_name, isDir) => isDir,
    isStale: (name) => !(name in AGENT_ROLE_SKILLS),
  });

  // 5. Docs: docs/compound/ — fully managed directory. Only research/ is user-owned.
  //    Any file/dir not in DOC_TEMPLATES (and not research/) is removed on --update.
  await cleanDir(repoRoot, ['docs', 'compound'], removed, dryRun, {
    filter: () => true,
    isStale: (name, isDir) => {
      if (isDir && name === 'research') return false;
      return !(name in DOC_TEMPLATES);
    },
  });

  return removed;
}

/**
 * Remove Gemini-side artifacts not present in current template registries.
 *
 * Scans:
 *   .gemini/commands/compound/  (WORKFLOW_COMMANDS stems, .toml files)
 *   .gemini/skills/             (compound-* dirs matching PHASE_SKILLS or AGENT_ROLE_SKILLS)
 *
 * @returns Array of relative paths removed (or would-be-removed in dry-run).
 */
export async function cleanStaleGeminiArtifacts(repoRoot: string, dryRun: boolean): Promise<string[]> {
  const removed: string[] = [];

  // Valid command stems: WORKFLOW_COMMANDS keys with .md stripped
  const validCommandStems = new Set(
    Object.keys(WORKFLOW_COMMANDS).map((k) => k.replace(/\.md$/, '')),
  );

  // 1. Commands: .gemini/commands/compound/ — only .toml files
  await cleanDir(repoRoot, ['.gemini', 'commands', 'compound'], removed, dryRun, {
    filter: (name) => name.endsWith('.toml'),
    isStale: (name) => !validCommandStems.has(name.replace(/\.toml$/, '')),
  });

  // 2. Skills: .gemini/skills/ — only compound-* directories
  await cleanDir(repoRoot, ['.gemini', 'skills'], removed, dryRun, {
    filter: (name, isDir) => isDir && name.startsWith('compound-'),
    isStale: (name) => {
      // compound-agent-<role> checked first (longest prefix); phase names must not start with "agent-"
      if (name.startsWith('compound-agent-')) {
        const role = name.slice('compound-agent-'.length);
        return !(role in AGENT_ROLE_SKILLS);
      }
      // compound-<phase> → check PHASE_SKILLS
      const phase = name.slice('compound-'.length);
      return !(phase in PHASE_SKILLS);
    },
  });

  return removed;
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

interface CleanOptions {
  /** Return true if this entry should be considered for cleanup. */
  filter: (name: string, isDir: boolean) => boolean;
  /** Return true if the entry should be removed. */
  isStale: (name: string, isDir: boolean) => boolean;
}

async function cleanDir(
  repoRoot: string,
  segments: string[],
  removed: string[],
  dryRun: boolean,
  opts: CleanOptions,
): Promise<void> {
  const dirPath = join(repoRoot, ...segments);
  if (!existsSync(dirPath)) return;

  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return; // Permission denied, not a directory, or removed between check and read
  }
  for (const entry of entries) {
    const isDir = entry.isDirectory();
    if (!opts.filter(entry.name, isDir)) continue;
    if (!opts.isStale(entry.name, isDir)) continue;

    const relPath = [...segments, entry.name].join('/');
    removed.push(relPath);
    if (!dryRun) {
      await rm(join(dirPath, entry.name), { recursive: true, force: true });
    }
  }
}
