/**
 * Update-check module -- fetches latest version from npm, caches results,
 * and formats upgrade notifications.
 */

import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { VERSION } from './version.js';

export interface UpdateCheckResult {
  current: string;
  latest: string;
  updateAvailable: boolean;
}

interface CacheData {
  latest: string;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT_MS = 3000;
const CACHE_FILENAME = 'update-check.json';

/**
 * Fetch the latest published version of a package from the npm registry.
 * Uses the dist-tags endpoint (~100 bytes) instead of the full manifest.
 * Returns null on any error.
 */
export async function fetchLatestVersion(
  packageName: string = 'compound-agent',
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://registry.npmjs.org/-/package/${packageName}/dist-tags`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const latest = data['latest'];
    return typeof latest === 'string' ? latest : null;
  } catch {
    return null;
  }
}

/**
 * Check whether an update is available, using a file-based cache to avoid
 * hitting the registry on every invocation.
 * Returns null on any failure.
 */
export async function checkForUpdate(
  cacheDir: string,
): Promise<UpdateCheckResult | null> {
  try {
    const cachePath = join(cacheDir, CACHE_FILENAME);

    // Try reading a fresh cache
    const cached = readCache(cachePath);
    if (cached) {
      return {
        current: VERSION,
        latest: cached.latest,
        updateAvailable: semverGt(cached.latest, VERSION),
      };
    }

    // Cache miss / expired / corrupt -- fetch from registry
    const latest = await fetchLatestVersion();
    if (latest === null) return null;

    // Write cache
    try {
      mkdirSync(cacheDir, { recursive: true });
      const cacheData: CacheData = { latest };
      writeFileSync(cachePath, JSON.stringify(cacheData));
    } catch {
      // Cache write failure is non-fatal
    }

    return {
      current: VERSION,
      latest,
      updateAvailable: semverGt(latest, VERSION),
    };
  } catch {
    return null;
  }
}

/**
 * Returns true when the major version of `latest` exceeds that of `current`.
 */
export function isMajorUpdate(current: string, latest: string): boolean {
  return parseInt(latest.split('.')[0]!, 10) > parseInt(current.split('.')[0]!, 10);
}

/**
 * Format a human-readable update notification string (plain text, for TTY).
 * Major updates get an urgency label; shows both global and dev-dep commands.
 */
export function formatUpdateNotification(
  current: string,
  latest: string,
): string {
  const label = isMajorUpdate(current, latest) ? 'Major update' : 'Update available';
  const warning = isMajorUpdate(current, latest)
    ? '\n  May contain breaking changes -- check the changelog.'
    : '';
  return [
    `${label}: ${current} -> ${latest}${warning}`,
    `Run: npm update -g compound-agent        (global)`,
    `     pnpm add -D compound-agent@latest   (dev dependency)`,
  ].join('\n');
}

/**
 * Format an update notification in markdown (for non-TTY / prime output).
 */
export function formatUpdateNotificationMarkdown(
  current: string,
  latest: string,
): string {
  const urgency = isMajorUpdate(current, latest)
    ? ' (MAJOR - may contain breaking changes)'
    : '';
  return `\n---\n# Update Available\ncompound-agent v${latest} is available (current: v${current})${urgency}.\nRun: \`npm update -g compound-agent\` (global) or \`pnpm add -D compound-agent@latest\` (dev dependency)\n`;
}

/**
 * Determine whether an update check should run.
 * Skips non-TTY, CI environments, and explicit opt-outs.
 */
export function shouldCheckForUpdate(): boolean {
  if (!process.stdout.isTTY) return false;
  if (process.env['CI']) return false;
  if (process.env['NO_UPDATE_NOTIFIER']) return false;
  if (process.env['NODE_ENV'] === 'test') return false;
  return true;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if version a is strictly greater than version b.
 * Handles standard MAJOR.MINOR.PATCH semver format.
 * Pre-release suffixes (e.g. "2.0.0-beta.1") are stripped before comparison
 * so that pre-releases are never promoted over stable releases.
 */
function semverGt(a: string, b: string): boolean {
  const parse = (v: string): [number, number, number] => {
    // Strip pre-release suffix: "2.0.0-beta.1" -> "2.0.0"
    const clean = v.split('-')[0]!;
    const parts = clean.split('.').map(n => {
      const num = parseInt(n, 10);
      return isNaN(num) ? 0 : num;
    });
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  };
  const [aMaj, aMin, aPat] = parse(a);
  const [bMaj, bMin, bPat] = parse(b);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPat > bPat;
}

function readCache(cachePath: string): CacheData | null {
  try {
    const stat = statSync(cachePath);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;

    const raw = readFileSync(cachePath, 'utf-8');
    const data = JSON.parse(raw) as CacheData;
    if (typeof data.latest !== 'string' || !data.latest) return null;
    return data;
  } catch {
    return null;
  }
}
