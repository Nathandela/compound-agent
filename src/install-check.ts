/**
 * Install-check utility for learning-agent.
 *
 * Detects invalid installations when package is installed from GitHub URL
 * instead of npm registry. GitHub installs don't include dist/ folder since
 * it's gitignored.
 */

import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Result of checking the installation validity.
 *
 * A discriminated union where `valid` determines which fields are present:
 * - valid=true: Installation is correct, no reason field
 * - valid=false: Installation is invalid, reason explains why and how to fix
 *
 * The distPath and cliPath fields are included for debugging purposes,
 * showing exactly which paths were checked. These are implementation details
 * exposed for diagnostic purposes only.
 *
 * @example
 * ```typescript
 * const result = checkInstallation();
 * if (!result.valid) {
 *   console.error(result.reason);
 *   // "Invalid installation: learning-agent was installed from GitHub..."
 * }
 * ```
 */
export type InstallCheckResult =
  | {
      valid: true;
      distPath: string;
      cliPath: string;
      reason?: undefined;
    }
  | {
      valid: false;
      reason: string;
      distPath: string;
      cliPath: string;
    };

/**
 * Get the package root directory.
 *
 * When no packageRoot is provided, determines the root from this file's
 * location. Handles both direct and symlinked installations.
 */
function getPackageRoot(packageRoot?: string): string {
  if (packageRoot) {
    // If it's a symlink, resolve to real path
    try {
      return realpathSync(packageRoot);
    } catch {
      return packageRoot;
    }
  }

  // Determine from this file's location
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = path.dirname(thisFile);

  // This file is in src/, so package root is one level up
  // But in dist/, it would also be one level up
  return path.dirname(thisDir);
}

/**
 * Check if learning-agent was installed correctly (from npm, not GitHub).
 *
 * GitHub installs don't include dist/ folder since it's gitignored.
 * Only npm registry installs include the built output.
 *
 * @param packageRoot - Optional package root directory. If not provided,
 *                      determined from this file's location.
 * @returns InstallCheckResult indicating if installation is valid
 */
export function checkInstallation(packageRoot?: string): InstallCheckResult {
  const root = getPackageRoot(packageRoot);
  const distPath = path.join(root, 'dist');
  const cliPath = path.join(distPath, 'cli.js');

  // Check if dist/ directory exists
  if (!existsSync(distPath)) {
    return {
      valid: false,
      reason:
        'Invalid installation: learning-agent was installed from GitHub URL ' +
        'without compiled output. Install from npm registry instead: ' +
        'pnpm add -D learning-agent',
      distPath,
      cliPath,
    };
  }

  // Check if dist/cli.js exists
  if (!existsSync(cliPath)) {
    return {
      valid: false,
      reason:
        'Invalid installation: dist/cli.js is missing. The package may be ' +
        'corrupted or was installed from GitHub URL. Reinstall from npm: ' +
        'pnpm add -D learning-agent',
      distPath,
      cliPath,
    };
  }

  return {
    valid: true,
    distPath,
    cliPath,
  };
}

/**
 * Assert that learning-agent was installed correctly.
 *
 * Exits with code 1 if installation is invalid. Use at the start of CLI
 * commands to fail fast with a clear error message.
 *
 * @param packageRoot - Optional package root directory for testing.
 */
export function assertValidInstall(packageRoot?: string): void {
  const result = checkInstallation(packageRoot);

  if (!result.valid) {
    process.stderr.write(`ERROR: ${result.reason}\n`);
    process.exit(1);
  }
}
