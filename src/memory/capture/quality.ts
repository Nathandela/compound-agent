/**
 * Quality filters for lesson capture
 *
 * Filters to ensure lessons are:
 * - Novel (not duplicate)
 * - Specific (not vague)
 *
 * Actionability check is available but not part of the capture gate.
 * Strategy: capture aggressively, prune later.
 */

import { isModelAvailable } from '../embeddings/model-info.js';
import { findSimilarLessons } from '../search/index.js';
import { syncIfNeeded } from '../storage/index.js';

/** Cosine similarity threshold for near-duplicate detection */
const DUPLICATE_THRESHOLD = 0.98;

/** Result of novelty check */
export interface NoveltyResult {
  novel: boolean;
  reason?: string;
  existingId?: string;
}

/** Options for novelty check */
export interface NoveltyOptions {
  threshold?: number;
}

/**
 * Check if an insight is novel (not a near-duplicate of existing lessons).
 * Uses semantic embeddings with cosine similarity.
 * Falls back to novel: true when model is unavailable or on error.
 */
export async function isNovel(
  repoRoot: string,
  insight: string,
  options: NoveltyOptions = {}
): Promise<NoveltyResult> {
  const threshold = options.threshold ?? DUPLICATE_THRESHOLD;

  if (!isModelAvailable()) {
    return { novel: true };
  }

  try {
    await syncIfNeeded(repoRoot);
    const similar = await findSimilarLessons(repoRoot, insight, { threshold });
    const top = similar[0];
    if (top) {
      return {
        novel: false,
        reason: `Near-duplicate of existing lesson: "${top.item.insight.slice(0, 50)}..."`,
        existingId: top.item.id,
      };
    }
    return { novel: true };
  } catch (err) {
    if (process.env['CA_DEBUG']) {
      process.stderr.write(`[CA_DEBUG] isNovel catch: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    return { novel: true };
  }
}

/** Minimum word count for a specific insight */
const MIN_WORD_COUNT = 4;

/** Vague patterns that indicate non-specific advice */
const VAGUE_PATTERNS = [
  /\bwrite better\b/i,
  /\bbe careful\b/i,
  /\bremember to\b/i,
  /\bmake sure\b/i,
  /\btry to\b/i,
  /\bdouble check\b/i,
];

/** Generic "always/never" phrases (short, lacking specificity) */
const GENERIC_IMPERATIVE_PATTERN = /^(always|never)\s+\w+(\s+\w+){0,2}$/i;

/** Result of specificity check */
export interface SpecificityResult {
  specific: boolean;
  reason?: string;
}

/**
 * Check if an insight is specific enough to be useful.
 * Rejects vague, generic advice that doesn't provide actionable guidance.
 */
export function isSpecific(insight: string): SpecificityResult {
  // Check minimum length first
  const words = insight.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length < MIN_WORD_COUNT) {
    return { specific: false, reason: 'Insight is too short to be actionable' };
  }

  // Check for vague patterns
  for (const pattern of VAGUE_PATTERNS) {
    if (pattern.test(insight)) {
      return { specific: false, reason: 'Insight matches a vague pattern' };
    }
  }

  // Check for generic "Always X" or "Never X" phrases
  if (GENERIC_IMPERATIVE_PATTERN.test(insight)) {
    return { specific: false, reason: 'Insight matches a vague pattern' };
  }

  return { specific: true };
}

/** Action word patterns that indicate actionable guidance */
const ACTION_PATTERNS = [
  /\buse\s+.+\s+instead\s+of\b/i, // "use X instead of Y"
  /\bprefer\s+.+\s+(over|to)\b/i, // "prefer X over Y" or "prefer X to Y"
  /\balways\s+.+\s+when\b/i, // "always X when Y"
  /\bnever\s+.+\s+without\b/i, // "never X without Y"
  /\bavoid\s+(using\s+)?\w+/i, // "avoid X" or "avoid using X"
  /\bcheck\s+.+\s+before\b/i, // "check X before Y"
  /^(run|use|add|remove|install|update|configure|set|enable|disable)\s+/i, // Imperative commands at start
];

/** Result of actionability check */
export interface ActionabilityResult {
  actionable: boolean;
  reason?: string;
}

/**
 * Check if an insight contains actionable guidance.
 * Returns false for pure observations or questions.
 */
export function isActionable(insight: string): ActionabilityResult {
  // Check for action patterns
  for (const pattern of ACTION_PATTERNS) {
    if (pattern.test(insight)) {
      return { actionable: true };
    }
  }

  return { actionable: false, reason: 'Insight lacks clear action guidance' };
}

/** Result of combined quality check */
export interface ProposeResult {
  shouldPropose: boolean;
  reason?: string;
}

/**
 * Combined quality check for lesson proposals.
 * Returns true only if insight is novel AND specific.
 * Actionability gate removed: capture aggressively, prune later.
 */
export async function shouldPropose(
  repoRoot: string,
  insight: string
): Promise<ProposeResult> {
  // Check specificity first (fast, no DB)
  const specificResult = isSpecific(insight);
  if (!specificResult.specific) {
    return { shouldPropose: false, reason: specificResult.reason };
  }

  // Check novelty (requires DB lookup)
  const noveltyResult = await isNovel(repoRoot, insight);
  if (!noveltyResult.novel) {
    return { shouldPropose: false, reason: noveltyResult.reason };
  }

  return { shouldPropose: true };
}
