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
  return process.env['LEARNING_AGENT_ROOT'] ?? process.cwd();
}
