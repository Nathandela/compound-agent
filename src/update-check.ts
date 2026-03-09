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
  checkedAt: string;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT_MS = 3000;
const CACHE_FILENAME = 'update-check.json';

/**
 * Fetch the latest published version of a package from the npm registry.
 * Returns null on any error.
 */
export async function fetchLatestVersion(
  packageName: string = 'compound-agent',
): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${packageName}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const data = await res.json();
    return (data as Record<string, unknown>)['dist-tags']
      ? ((data as { 'dist-tags': { latest: string } })['dist-tags'].latest ?? null)
      : null;
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
        updateAvailable: cached.latest !== VERSION,
      };
    }

    // Cache miss / expired / corrupt -- fetch from registry
    const latest = await fetchLatestVersion();
    if (latest === null) return null;

    // Write cache
    try {
      mkdirSync(cacheDir, { recursive: true });
      const cacheData: CacheData = { latest, checkedAt: new Date().toISOString() };
      writeFileSync(cachePath, JSON.stringify(cacheData));
    } catch {
      // Cache write failure is non-fatal
    }

    return {
      current: VERSION,
      latest,
      updateAvailable: latest !== VERSION,
    };
  } catch {
    return null;
  }
}

/**
 * Format a human-readable update notification string.
 */
export function formatUpdateNotification(
  current: string,
  latest: string,
): string {
  return `Update available: ${current} -> ${latest}\nRun: pnpm update compound-agent`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function readCache(cachePath: string): CacheData | null {
  try {
    const stat = statSync(cachePath);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;

    const raw = readFileSync(cachePath, 'utf-8');
    const data = JSON.parse(raw as string) as CacheData;
    if (!data.latest) return null;
    return data;
  } catch {
    return null;
  }
}
