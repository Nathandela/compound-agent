/**
 * Tests for install-check utility.
 *
 * These tests verify detection of invalid installations (GitHub vs npm).
 * Uses REAL temporary directories to simulate different installation states.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fc, test } from '@fast-check/vitest';

import {
  assertValidInstall,
  checkInstallation,
  type InstallCheckResult,
} from './install-check.js';

/**
 * Create a temporary directory structure simulating a valid npm installation.
 * Returns the package root path.
 */
function setupValidInstall(): string {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'lna-valid-'));
  const packageRoot = path.join(tempDir, 'learning-agent');
  const distDir = path.join(packageRoot, 'dist');

  mkdirSync(distDir, { recursive: true });

  // Create package.json
  writeFileSync(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({ name: 'learning-agent', version: '1.0.0' })
  );

  // Create dist/cli.js (simulating built output)
  writeFileSync(path.join(distDir, 'cli.js'), '#!/usr/bin/env node\nconsole.log("cli");');

  return packageRoot;
}

/**
 * Create a temporary directory structure simulating a GitHub installation
 * (missing dist/ folder).
 */
function setupGitHubInstall(): string {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'lna-github-'));
  const packageRoot = path.join(tempDir, 'learning-agent');
  const srcDir = path.join(packageRoot, 'src');

  mkdirSync(srcDir, { recursive: true });

  // Create package.json
  writeFileSync(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({ name: 'learning-agent', version: '1.0.0' })
  );

  // Create source files (but NO dist/)
  writeFileSync(path.join(srcDir, 'cli.ts'), 'console.log("source");');

  return packageRoot;
}

/**
 * Create a temporary directory with dist/ but missing cli.js.
 */
function setupCorruptedInstall(): string {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'lna-corrupt-'));
  const packageRoot = path.join(tempDir, 'learning-agent');
  const distDir = path.join(packageRoot, 'dist');

  mkdirSync(distDir, { recursive: true });

  // Create package.json
  writeFileSync(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({ name: 'learning-agent', version: '1.0.0' })
  );

  // Create dist/ but NOT cli.js (corrupted/partial build)
  writeFileSync(path.join(distDir, 'index.js'), 'console.log("index");');

  return packageRoot;
}

/**
 * Create a symlinked installation (like pnpm workspaces).
 */
function setupSymlinkedInstall(): string {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'lna-symlink-'));
  const realPackage = path.join(tempDir, '.pnpm', 'learning-agent@1.0.0');
  const symlinkPath = path.join(tempDir, 'node_modules', 'learning-agent');

  // Create real package with dist/
  const distDir = path.join(realPackage, 'dist');
  mkdirSync(distDir, { recursive: true });
  writeFileSync(
    path.join(realPackage, 'package.json'),
    JSON.stringify({ name: 'learning-agent', version: '1.0.0' })
  );
  writeFileSync(path.join(distDir, 'cli.js'), '#!/usr/bin/env node');

  // Create symlink
  mkdirSync(path.join(tempDir, 'node_modules'), { recursive: true });
  symlinkSync(realPackage, symlinkPath);

  return symlinkPath;
}

/**
 * Cleanup a temporary directory.
 */
function cleanup(dir: string): void {
  try {
    // Resolve symlinks to find base temp directory
    const realPath = path.dirname(dir);
    // Find the temp dir root (starts with lna-)
    let current = dir;
    while (current !== path.dirname(current)) {
      if (path.basename(current).startsWith('lna-')) {
        rmSync(current, { recursive: true, force: true });
        return;
      }
      current = path.dirname(current);
    }
    // Fallback: remove dir's parent if it's in temp
    if (realPath.includes(tmpdir())) {
      rmSync(realPath, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}

describe('checkInstallation', () => {
  describe('valid npm installation', () => {
    let packageRoot: string;

    beforeEach(() => {
      packageRoot = setupValidInstall();
    });

    afterEach(() => {
      cleanup(packageRoot);
    });

    it('returns valid=true when dist/ and cli.js exist', () => {
      const result = checkInstallation(packageRoot);

      expect(result.valid).toBe(true);
    });

    it('returns absolute distPath', () => {
      const result = checkInstallation(packageRoot);

      expect(path.isAbsolute(result.distPath)).toBe(true);
      // Use realpathSync because checkInstallation resolves symlinks (macOS /var -> /private/var)
      expect(result.distPath).toBe(path.join(realpathSync(packageRoot), 'dist'));
    });

    it('returns absolute cliPath', () => {
      const result = checkInstallation(packageRoot);

      expect(path.isAbsolute(result.cliPath)).toBe(true);
      // Use realpathSync because checkInstallation resolves symlinks (macOS /var -> /private/var)
      expect(result.cliPath).toBe(path.join(realpathSync(packageRoot), 'dist', 'cli.js'));
    });

    it('does not include reason when valid', () => {
      const result = checkInstallation(packageRoot);

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  describe('GitHub installation (missing dist/)', () => {
    let packageRoot: string;

    beforeEach(() => {
      packageRoot = setupGitHubInstall();
    });

    afterEach(() => {
      cleanup(packageRoot);
    });

    it('returns valid=false when dist/ is missing', () => {
      const result = checkInstallation(packageRoot);

      expect(result.valid).toBe(false);
    });

    it('includes reason explaining the problem', () => {
      const result = checkInstallation(packageRoot);

      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.reason).toContain('GitHub');
    });

    it('includes actionable fix command in reason', () => {
      const result = checkInstallation(packageRoot);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('pnpm add -D learning-agent');
    });

    it('still includes distPath for debugging', () => {
      const result = checkInstallation(packageRoot);

      expect(result.distPath).toBeDefined();
      expect(path.isAbsolute(result.distPath)).toBe(true);
    });

    it('still includes cliPath for debugging', () => {
      const result = checkInstallation(packageRoot);

      expect(result.cliPath).toBeDefined();
      expect(path.isAbsolute(result.cliPath)).toBe(true);
    });
  });

  describe('corrupted installation (dist/ exists but cli.js missing)', () => {
    let packageRoot: string;

    beforeEach(() => {
      packageRoot = setupCorruptedInstall();
    });

    afterEach(() => {
      cleanup(packageRoot);
    });

    it('returns valid=false when cli.js is missing', () => {
      const result = checkInstallation(packageRoot);

      expect(result.valid).toBe(false);
    });

    it('includes reason about missing cli.js', () => {
      const result = checkInstallation(packageRoot);

      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });
  });

  describe('symlinked installation (pnpm workspaces)', () => {
    let packageRoot: string;

    beforeEach(() => {
      packageRoot = setupSymlinkedInstall();
    });

    afterEach(() => {
      cleanup(packageRoot);
    });

    it('returns valid=true when following symlinks', () => {
      const result = checkInstallation(packageRoot);

      expect(result.valid).toBe(true);
    });

    it('resolves symlinked paths correctly', () => {
      const result = checkInstallation(packageRoot);

      expect(result.distPath).toContain('dist');
      expect(existsSync(result.distPath)).toBe(true);
      expect(existsSync(result.cliPath)).toBe(true);
    });
  });

  describe('performance', () => {
    let packageRoot: string;

    beforeEach(() => {
      packageRoot = setupValidInstall();
    });

    afterEach(() => {
      cleanup(packageRoot);
    });

    it('completes in under 100ms', () => {
      const start = performance.now();
      checkInstallation(packageRoot);
      const duration = performance.now() - start;

      // 100ms threshold accounts for slower CI environments
      expect(duration).toBeLessThan(100);
    });

    it('is deterministic (same result on repeated calls)', () => {
      const result1 = checkInstallation(packageRoot);
      const result2 = checkInstallation(packageRoot);
      const result3 = checkInstallation(packageRoot);

      expect(result1.valid).toBe(result2.valid);
      expect(result2.valid).toBe(result3.valid);
      expect(result1.distPath).toBe(result2.distPath);
      expect(result2.cliPath).toBe(result3.cliPath);
    });
  });

  describe('default behavior (no packageRoot argument)', () => {
    it('uses actual package location when no argument provided', () => {
      // This tests the default behavior in the real development environment
      const result = checkInstallation();

      // Should have valid structure regardless of valid/invalid
      expect(typeof result.valid).toBe('boolean');
      expect(typeof result.distPath).toBe('string');
      expect(typeof result.cliPath).toBe('string');
      expect(path.isAbsolute(result.distPath)).toBe(true);
      expect(path.isAbsolute(result.cliPath)).toBe(true);
    });
  });
});

describe('assertValidInstall', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  describe('valid installation', () => {
    let packageRoot: string;

    beforeEach(() => {
      packageRoot = setupValidInstall();
    });

    afterEach(() => {
      cleanup(packageRoot);
    });

    it('does not exit when installation is valid', () => {
      expect(() => assertValidInstall(packageRoot)).not.toThrow();
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('does not write to stderr when valid', () => {
      assertValidInstall(packageRoot);

      expect(stderrSpy).not.toHaveBeenCalled();
    });
  });

  describe('invalid installation', () => {
    let packageRoot: string;

    beforeEach(() => {
      packageRoot = setupGitHubInstall();
    });

    afterEach(() => {
      cleanup(packageRoot);
    });

    it('exits with code 1 when dist/ is missing', () => {
      try {
        assertValidInstall(packageRoot);
      } catch {
        // Expected: process.exit throws in test
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('writes error to stderr', () => {
      try {
        assertValidInstall(packageRoot);
      } catch {
        // Expected
      }

      expect(stderrSpy).toHaveBeenCalled();
    });

    it('error message contains ERROR prefix', () => {
      try {
        assertValidInstall(packageRoot);
      } catch {
        // Expected
      }

      const stderrOutput = stderrSpy.mock.calls.map((c) => c[0]).join('');
      expect(stderrOutput).toContain('ERROR');
    });

    it('error message contains fix command', () => {
      try {
        assertValidInstall(packageRoot);
      } catch {
        // Expected
      }

      const stderrOutput = stderrSpy.mock.calls.map((c) => c[0]).join('');
      expect(stderrOutput).toContain('pnpm add -D learning-agent');
    });

    it('error message mentions GitHub', () => {
      try {
        assertValidInstall(packageRoot);
      } catch {
        // Expected
      }

      const stderrOutput = stderrSpy.mock.calls.map((c) => c[0]).join('');
      expect(stderrOutput).toContain('GitHub');
    });
  });

  describe('corrupted installation', () => {
    let packageRoot: string;

    beforeEach(() => {
      packageRoot = setupCorruptedInstall();
    });

    afterEach(() => {
      cleanup(packageRoot);
    });

    it('exits with code 1 when cli.js is missing', () => {
      try {
        assertValidInstall(packageRoot);
      } catch {
        // Expected
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});

describe('InstallCheckResult discriminated union', () => {
  let validPackage: string;
  let invalidPackage: string;

  beforeEach(() => {
    validPackage = setupValidInstall();
    invalidPackage = setupGitHubInstall();
  });

  afterEach(() => {
    cleanup(validPackage);
    cleanup(invalidPackage);
  });

  it('valid result has no reason property', () => {
    const result = checkInstallation(validPackage);

    expect(result.valid).toBe(true);
    if (result.valid) {
      // TypeScript narrowing: reason should not exist
      expect('reason' in result && result.reason).toBeFalsy();
    }
  });

  it('invalid result has reason property', () => {
    const result = checkInstallation(invalidPackage);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      // TypeScript narrowing: reason should exist
      expect(result.reason).toBeDefined();
      expect(typeof result.reason).toBe('string');
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});

describe('Property-Based Tests: checkInstallation', () => {
  describe('Path Handling Properties', () => {
    test.prop([fc.string({ minLength: 1, maxLength: 100 })])(
      'paths are always absolute regardless of input',
      (dirName) => {
        // Create temp directory with arbitrary name
        const tempDir = mkdtempSync(path.join(tmpdir(), 'lna-prop-'));
        const packageRoot = path.join(tempDir, dirName);

        try {
          mkdirSync(packageRoot, { recursive: true });
          const distDir = path.join(packageRoot, 'dist');
          mkdirSync(distDir, { recursive: true });
          writeFileSync(path.join(distDir, 'cli.js'), '#!/usr/bin/env node');

          const result = checkInstallation(packageRoot);

          // Property: All paths must be absolute
          expect(path.isAbsolute(result.distPath)).toBe(true);
          expect(path.isAbsolute(result.cliPath)).toBe(true);
        } finally {
          rmSync(tempDir, { recursive: true, force: true });
        }
      }
    );

    test.prop([fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 })])(
      'handles deeply nested directory structures',
      (pathSegments) => {
        const tempDir = mkdtempSync(path.join(tmpdir(), 'lna-deep-'));
        const packageRoot = path.join(tempDir, ...pathSegments);

        try {
          mkdirSync(packageRoot, { recursive: true });
          const distDir = path.join(packageRoot, 'dist');
          mkdirSync(distDir, { recursive: true });
          writeFileSync(path.join(distDir, 'cli.js'), '#!/usr/bin/env node');

          const result = checkInstallation(packageRoot);

          // Property: Valid installs return valid=true regardless of depth
          expect(result.valid).toBe(true);
          expect(existsSync(result.distPath)).toBe(true);
          expect(existsSync(result.cliPath)).toBe(true);
        } finally {
          rmSync(tempDir, { recursive: true, force: true });
        }
      }
    );

    test.prop([fc.string({ minLength: 1, maxLength: 50 })])(
      'distPath always ends with dist directory',
      (dirName) => {
        const tempDir = mkdtempSync(path.join(tmpdir(), 'lna-prop-'));
        const packageRoot = path.join(tempDir, dirName);

        try {
          mkdirSync(packageRoot, { recursive: true });
          const distDir = path.join(packageRoot, 'dist');
          mkdirSync(distDir, { recursive: true });
          writeFileSync(path.join(distDir, 'cli.js'), '#!/usr/bin/env node');

          const result = checkInstallation(packageRoot);

          // Property: distPath must always end with 'dist'
          expect(path.basename(result.distPath)).toBe('dist');
        } finally {
          rmSync(tempDir, { recursive: true, force: true });
        }
      }
    );

    test.prop([fc.string({ minLength: 1, maxLength: 50 })])(
      'cliPath always ends with cli.js',
      (dirName) => {
        const tempDir = mkdtempSync(path.join(tmpdir(), 'lna-prop-'));
        const packageRoot = path.join(tempDir, dirName);

        try {
          mkdirSync(packageRoot, { recursive: true });
          const distDir = path.join(packageRoot, 'dist');
          mkdirSync(distDir, { recursive: true });
          writeFileSync(path.join(distDir, 'cli.js'), '#!/usr/bin/env node');

          const result = checkInstallation(packageRoot);

          // Property: cliPath must always end with 'cli.js'
          expect(path.basename(result.cliPath)).toBe('cli.js');
        } finally {
          rmSync(tempDir, { recursive: true, force: true });
        }
      }
    );
  });

  describe('Determinism Properties', () => {
    test.prop([fc.integer({ min: 2, max: 10 })])(
      'multiple calls with same input produce identical results',
      (numCalls) => {
        const packageRoot = setupValidInstall();

        try {
          const results: InstallCheckResult[] = [];
          for (let i = 0; i < numCalls; i++) {
            results.push(checkInstallation(packageRoot));
          }

          // Property: All results must be identical
          const first = results[0];
          for (let i = 1; i < results.length; i++) {
            expect(results[i].valid).toBe(first.valid);
            expect(results[i].distPath).toBe(first.distPath);
            expect(results[i].cliPath).toBe(first.cliPath);
          }
        } finally {
          cleanup(packageRoot);
        }
      }
    );

    test.prop([fc.integer({ min: 2, max: 10 })])(
      'interleaved valid and invalid checks remain consistent',
      (numCalls) => {
        const validPkg = setupValidInstall();
        const invalidPkg = setupGitHubInstall();

        try {
          for (let i = 0; i < numCalls; i++) {
            const validResult = checkInstallation(validPkg);
            const invalidResult = checkInstallation(invalidPkg);

            // Property: Results don't affect each other
            expect(validResult.valid).toBe(true);
            expect(invalidResult.valid).toBe(false);
          }
        } finally {
          cleanup(validPkg);
          cleanup(invalidPkg);
        }
      }
    );
  });

  describe('Read-Only Properties', () => {
    test.prop([fc.integer({ min: 1, max: 20 })])(
      'filesystem state unchanged after multiple checks',
      (numCalls) => {
        const packageRoot = setupValidInstall();

        try {
          // Capture initial filesystem state
          const distPath = path.join(packageRoot, 'dist');
          const cliPath = path.join(distPath, 'cli.js');
          const initialDistStat = statSync(distPath);
          const initialCliStat = statSync(cliPath);

          // Run checks multiple times
          for (let i = 0; i < numCalls; i++) {
            checkInstallation(packageRoot);
          }

          // Property: mtimes unchanged (no modifications)
          const finalDistStat = statSync(distPath);
          const finalCliStat = statSync(cliPath);

          expect(finalDistStat.mtimeMs).toBe(initialDistStat.mtimeMs);
          expect(finalCliStat.mtimeMs).toBe(initialCliStat.mtimeMs);
        } finally {
          cleanup(packageRoot);
        }
      }
    );

    test.prop([fc.integer({ min: 1, max: 20 })])(
      'invalid checks do not create missing directories',
      (numCalls) => {
        const packageRoot = setupGitHubInstall();

        try {
          const distPath = path.join(packageRoot, 'dist');

          // Verify dist/ doesn't exist initially
          expect(existsSync(distPath)).toBe(false);

          // Run checks multiple times
          for (let i = 0; i < numCalls; i++) {
            checkInstallation(packageRoot);
          }

          // Property: dist/ still doesn't exist (no side effects)
          expect(existsSync(distPath)).toBe(false);
        } finally {
          cleanup(packageRoot);
        }
      }
    );
  });

  describe('Performance Properties', () => {
    test.prop([fc.integer({ min: 1, max: 10 })])(
      'checks complete in under 100ms regardless of call count',
      (numCalls) => {
        const packageRoot = setupValidInstall();

        try {
          for (let i = 0; i < numCalls; i++) {
            const start = performance.now();
            checkInstallation(packageRoot);
            const duration = performance.now() - start;

            // Property: Each call completes within time bound
            // 100ms threshold accounts for slower CI environments
            // while still being fast enough for CLI startup
            expect(duration).toBeLessThan(100);
          }
        } finally {
          cleanup(packageRoot);
        }
      }
    );

    test.prop([fc.integer({ min: 10, max: 20 })])(
      'all calls complete within performance budget',
      (numCalls) => {
        const packageRoot = setupValidInstall();

        try {
          // Property: Every call meets performance requirement
          // This is more robust than comparing first/second half
          for (let i = 0; i < numCalls; i++) {
            const start = performance.now();
            checkInstallation(packageRoot);
            const duration = performance.now() - start;

            // All calls must complete within budget (no degradation)
            expect(duration).toBeLessThan(100);
          }
        } finally {
          cleanup(packageRoot);
        }
      }
    );
  });

  describe('Error Message Properties', () => {
    test.prop([fc.constant(undefined)])(
      'invalid installs always have non-empty reason',
      () => {
        const packageRoot = setupGitHubInstall();

        try {
          const result = checkInstallation(packageRoot);

          // Property: Failure reasons are never empty
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.reason).toBeDefined();
            expect(result.reason.length).toBeGreaterThan(0);
            expect(result.reason.trim()).toBe(result.reason); // No leading/trailing whitespace
          }
        } finally {
          cleanup(packageRoot);
        }
      }
    );

    test.prop([fc.constant(undefined)])(
      'error messages contain actionable fix command',
      () => {
        const invalidCases = [setupGitHubInstall(), setupCorruptedInstall()];

        try {
          for (const packageRoot of invalidCases) {
            const result = checkInstallation(packageRoot);

            // Property: Error messages include installation command
            expect(result.valid).toBe(false);
            if (!result.valid) {
              expect(result.reason).toContain('pnpm add -D learning-agent');
            }
          }
        } finally {
          invalidCases.forEach(cleanup);
        }
      }
    );

    test.prop([fc.constant(undefined)])(
      'missing dist reason mentions GitHub installation',
      () => {
        const packageRoot = setupGitHubInstall();

        try {
          const result = checkInstallation(packageRoot);

          // Property: Missing dist/ errors explain GitHub cause
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.reason.toLowerCase()).toContain('github');
          }
        } finally {
          cleanup(packageRoot);
        }
      }
    );

    test.prop([fc.constant(undefined)])(
      'missing cli.js reason mentions missing file',
      () => {
        const packageRoot = setupCorruptedInstall();

        try {
          const result = checkInstallation(packageRoot);

          // Property: Missing cli.js errors mention the file
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.reason.toLowerCase()).toContain('cli.js');
          }
        } finally {
          cleanup(packageRoot);
        }
      }
    );
  });

  describe('Symlink Resolution Properties', () => {
    test.prop([fc.integer({ min: 1, max: 5 })])(
      'symlinked valid installs always return valid=true',
      (callCount) => {
        const packageRoot = setupSymlinkedInstall();

        try {
          for (let i = 0; i < callCount; i++) {
            const result = checkInstallation(packageRoot);

            // Property: Symlinks don't cause false negatives
            expect(result.valid).toBe(true);
            expect(existsSync(result.distPath)).toBe(true);
            expect(existsSync(result.cliPath)).toBe(true);
          }
        } finally {
          cleanup(packageRoot);
        }
      }
    );

    test.prop([fc.constant(undefined)])(
      'resolved paths point to real files, not symlinks',
      () => {
        const symlinkPkg = setupSymlinkedInstall();

        try {
          const result = checkInstallation(symlinkPkg);

          // Property: Paths resolve through symlinks to actual files
          const realDistPath = realpathSync(result.distPath);
          const realCliPath = realpathSync(result.cliPath);

          expect(existsSync(realDistPath)).toBe(true);
          expect(existsSync(realCliPath)).toBe(true);
        } finally {
          cleanup(symlinkPkg);
        }
      }
    );
  });

  describe('Invariant Properties', () => {
    test.prop([fc.constant(undefined)])(
      'valid results never have reason property',
      () => {
        const packageRoot = setupValidInstall();

        try {
          const result = checkInstallation(packageRoot);

          // Property: Discriminated union correctness
          expect(result.valid).toBe(true);
          if (result.valid) {
            expect(result.reason).toBeUndefined();
          }
        } finally {
          cleanup(packageRoot);
        }
      }
    );

    test.prop([fc.constant(undefined)])(
      'invalid results always have reason property',
      () => {
        const invalidCases = [setupGitHubInstall(), setupCorruptedInstall()];

        try {
          for (const packageRoot of invalidCases) {
            const result = checkInstallation(packageRoot);

            // Property: Discriminated union correctness
            expect(result.valid).toBe(false);
            if (!result.valid) {
              expect(result.reason).toBeDefined();
              expect(typeof result.reason).toBe('string');
            }
          }
        } finally {
          invalidCases.forEach(cleanup);
        }
      }
    );

    test.prop([fc.constant(undefined)])(
      'distPath is parent of cliPath',
      () => {
        const packageRoot = setupValidInstall();

        try {
          const result = checkInstallation(packageRoot);

          // Property: Path hierarchy relationship
          expect(path.dirname(result.cliPath)).toBe(result.distPath);
        } finally {
          cleanup(packageRoot);
        }
      }
    );
  });
});

describe('Property-Based Tests: assertValidInstall', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  describe('Exit Behavior Properties', () => {
    test.prop([fc.integer({ min: 1, max: 5 })])(
      'valid installs never exit',
      (callCount) => {
        const packageRoot = setupValidInstall();

        try {
          for (let i = 0; i < callCount; i++) {
            expect(() => assertValidInstall(packageRoot)).not.toThrow();
            expect(exitSpy).not.toHaveBeenCalled();
          }
        } finally {
          cleanup(packageRoot);
        }
      }
    );

    test.prop([fc.integer({ min: 1, max: 5 })])(
      'invalid installs always exit with code 1',
      (callCount) => {
        for (let i = 0; i < callCount; i++) {
          const packageRoot = setupGitHubInstall();

          try {
            try {
              assertValidInstall(packageRoot);
            } catch {
              // Expected: process.exit throws in test
            }

            // Property: Always exits with code 1
            expect(exitSpy).toHaveBeenCalledWith(1);
          } finally {
            cleanup(packageRoot);
            exitSpy.mockClear();
          }
        }
      }
    );
  });

  describe('Error Output Properties', () => {
    test.prop([fc.constant(undefined)])(
      'invalid installs always write to stderr',
      () => {
        const packageRoot = setupGitHubInstall();

        try {
          try {
            assertValidInstall(packageRoot);
          } catch {
            // Expected
          }

          // Property: Errors go to stderr, not stdout
          expect(stderrSpy).toHaveBeenCalled();
          const output = stderrSpy.mock.calls.map((c) => c[0]).join('');
          expect(output.length).toBeGreaterThan(0);
        } finally {
          cleanup(packageRoot);
        }
      }
    );

    test.prop([fc.constant(undefined)])(
      'stderr output always starts with ERROR prefix',
      () => {
        const packageRoot = setupGitHubInstall();

        try {
          try {
            assertValidInstall(packageRoot);
          } catch {
            // Expected
          }

          // Property: Error messages are clearly marked
          const output = stderrSpy.mock.calls.map((c) => c[0]).join('');
          expect(output).toMatch(/^ERROR:/);
        } finally {
          cleanup(packageRoot);
        }
      }
    );

    test.prop([fc.constant(undefined)])(
      'valid installs produce no stderr output',
      () => {
        const packageRoot = setupValidInstall();

        try {
          assertValidInstall(packageRoot);

          // Property: Success is silent
          expect(stderrSpy).not.toHaveBeenCalled();
        } finally {
          cleanup(packageRoot);
        }
      }
    );
  });
});
