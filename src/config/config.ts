/**
 * Configuration for compound-agent.
 * Stored in .claude/compound-agent.json (user-editable, not overwritten by setup --update).
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Config filename within .claude/ */
export const CONFIG_FILENAME = 'compound-agent.json';

/** Valid external reviewer tool names. */
export const VALID_REVIEWERS = ['gemini', 'codex'] as const;

/** Valid reviewer names for the infinity loop review phase. */
export const VALID_LOOP_REVIEWERS = ['claude-sonnet', 'claude-opus', 'gemini', 'codex'] as const;
export type LoopReviewerName = (typeof VALID_LOOP_REVIEWERS)[number];
export type ReviewerName = (typeof VALID_REVIEWERS)[number];

/** Shape of .claude/compound-agent.json */
export interface CompoundAgentConfig {
  gemini?: boolean;
  externalReviewers?: string[];
}

function configPath(repoRoot: string): string {
  return join(repoRoot, '.claude', CONFIG_FILENAME);
}

/**
 * Read config from .claude/compound-agent.json.
 * Returns empty object if file doesn't exist or is malformed.
 */
export async function readConfig(repoRoot: string): Promise<CompoundAgentConfig> {
  const path = configPath(repoRoot);
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(await readFile(path, 'utf-8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

/**
 * Write config to .claude/compound-agent.json.
 */
export async function writeConfig(repoRoot: string, config: CompoundAgentConfig): Promise<void> {
  await mkdir(join(repoRoot, '.claude'), { recursive: true });
  await writeFile(configPath(repoRoot), JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/** Safely extract the externalReviewers array from config, handling malformed values. */
function safeReviewerArray(config: CompoundAgentConfig): string[] {
  const raw = config.externalReviewers;
  if (!Array.isArray(raw)) return [];
  return raw;
}

export async function getExternalReviewers(repoRoot: string): Promise<ReviewerName[]> {
  const config = await readConfig(repoRoot);
  return safeReviewerArray(config).filter((r): r is ReviewerName => (VALID_REVIEWERS as readonly string[]).includes(r));
}

/**
 * Enable an external reviewer. Returns true if it was added, false if already enabled.
 */
export async function enableReviewer(repoRoot: string, name: string): Promise<boolean> {
  if (!(VALID_REVIEWERS as readonly string[]).includes(name)) {
    throw new Error(`Invalid reviewer: ${name}. Valid options: ${VALID_REVIEWERS.join(', ')}`);
  }
  const config = await readConfig(repoRoot);
  const reviewers = safeReviewerArray(config);
  if (reviewers.includes(name)) return false;
  config.externalReviewers = [...reviewers, name];
  await writeConfig(repoRoot, config);
  return true;
}

/**
 * Disable an external reviewer. Returns true if it was removed, false if not enabled.
 */
export async function disableReviewer(repoRoot: string, name: string): Promise<boolean> {
  const config = await readConfig(repoRoot);
  const reviewers = safeReviewerArray(config);
  if (!reviewers.includes(name)) return false;
  config.externalReviewers = reviewers.filter(r => r !== name);
  await writeConfig(repoRoot, config);
  return true;
}

// ── Gemini adapter opt-in ─────────────────────────────────────────────

/**
 * Check if Gemini adapter is enabled in config.
 */
export async function isGeminiEnabled(repoRoot: string): Promise<boolean> {
  const config = await readConfig(repoRoot);
  return config.gemini === true;
}

/**
 * Enable Gemini adapter. Returns true if it was enabled, false if already enabled.
 */
export async function enableGemini(repoRoot: string): Promise<boolean> {
  const config = await readConfig(repoRoot);
  if (config.gemini === true) return false;
  config.gemini = true;
  await writeConfig(repoRoot, config);
  return true;
}

/**
 * Disable Gemini adapter. Returns true if it was disabled, false if already disabled.
 */
export async function disableGemini(repoRoot: string): Promise<boolean> {
  const config = await readConfig(repoRoot);
  if (config.gemini !== true) return false;
  delete config.gemini;
  await writeConfig(repoRoot, config);
  return true;
}
