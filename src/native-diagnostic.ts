/**
 * Rich diagnostic output when native addon loading fails.
 *
 * Detects the consumer's package manager and provides targeted
 * fix instructions for pnpm v10+ build script approval.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Detect the package manager used in a project directory.
 */
export function detectPackageManager(cwd: string): 'pnpm' | 'npm' | 'yarn' | 'unknown' {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';

  try {
    const raw = readFileSync(join(cwd, 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    if (typeof pkg.packageManager === 'string') {
      if (pkg.packageManager.startsWith('pnpm')) return 'pnpm';
      if (pkg.packageManager.startsWith('yarn')) return 'yarn';
    }
  } catch { /* ignore */ }

  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(cwd, 'package-lock.json'))) return 'npm';
  return 'unknown';
}

/**
 * Print a rich diagnostic when native modules fail to load.
 * Uses stderr to keep stdout clean for JSON output.
 *
 * @param err - The error thrown by ensureSqliteAvailable()
 * @param cwd - Project root for package manager detection (defaults to process.cwd())
 */
export function printNativeBuildDiagnostic(err: unknown, cwd: string = process.cwd()): void {
  const pm = detectPackageManager(cwd);

  console.error('');
  console.error('ERROR: Native module "better-sqlite3" failed to load.');
  console.error('');

  if (pm === 'pnpm') {
    console.error('  pnpm v10+ blocks native addon builds by default.');
    console.error('');
    console.error('  Fix (choose one):');
    console.error('');
    console.error('    Option A -- Run setup (recommended):');
    console.error('      npx ca setup');
    console.error('');
    console.error('    Option B -- Manual patch:');
    console.error('      1. Add to package.json:');
    console.error('         "pnpm": { "onlyBuiltDependencies": ["better-sqlite3"] }');
    console.error('      2. Run: pnpm install && pnpm rebuild better-sqlite3');
    console.error('');
    console.error('    Option C -- Approve build scripts interactively:');
    console.error('      pnpm approve-builds');
    console.error('');
  } else {
    console.error('  Fix: npm rebuild better-sqlite3');
    console.error('');
    console.error('  If the error persists, ensure build tools are installed:');
    printBuildToolsHint();
    console.error('');
  }

  if (err instanceof Error && err.cause) {
    const causeMsg = err.cause instanceof Error ? err.cause.message : String(err.cause);
    console.error('  Underlying error:', causeMsg);
    console.error('');
  }
}

function printBuildToolsHint(): void {
  const platform = process.platform;
  if (platform === 'darwin') {
    console.error('    macOS: xcode-select --install');
  } else if (platform === 'linux') {
    console.error('    Linux: sudo apt install build-essential python3  (Debian/Ubuntu)');
    console.error('           sudo dnf groupinstall "Development Tools"  (Fedora)');
  } else if (platform === 'win32') {
    console.error('    Windows: Install Visual Studio Build Tools');
    console.error('             https://visualstudio.microsoft.com/visual-cpp-build-tools/');
  }
}
