/**
 * CLI utility functions.
 *
 * Pure functions extracted from cli.ts for testability.
 */

/**
 * Format bytes to human-readable string.
 *
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "1.5 KB", "2.0 MB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

/**
 * Parse limit option and validate it's a positive integer.
 *
 * @param value - String value from command option
 * @param name - Option name for error message
 * @returns Parsed integer
 * @throws Error if value is not a valid positive integer
 */
export function parseLimit(value: string, name: string): number {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: must be a positive integer`);
  }
  return parsed;
}

/**
 * Get repository root from environment variable or current directory.
 *
 * @returns Repository root path for lesson storage
 */
export function getRepoRoot(): string {
  return process.env['COMPOUND_AGENT_ROOT'] || process.cwd();
}

// ============================================================================
// Beads shared utilities
// ============================================================================

/** Strict pattern for valid beads epic/task IDs. */
export const EPIC_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Validate an epic ID, throwing if invalid. */
export function validateEpicId(epicId: string): void {
  if (!EPIC_ID_PATTERN.test(epicId)) {
    throw new Error(`Invalid epic ID: "${epicId}" (must be alphanumeric with hyphens/underscores)`);
  }
}

export interface BeadsDep {
  id: string;
  title: string;
  status: string;
}

/** Parse dependencies from `bd show --json` output. */
export function parseBdShowDeps(raw: string): BeadsDep[] {
  const data = JSON.parse(raw);
  const issue = Array.isArray(data) ? data[0] : data;
  if (!issue) return [];
  const depsArray = issue.depends_on ?? issue.dependencies ?? [];
  return depsArray.map((dep: { id?: string; title?: string; status?: string }) => ({
    id: dep.id ?? '',
    title: dep.title ?? '',
    status: dep.status ?? 'open',
  }));
}
