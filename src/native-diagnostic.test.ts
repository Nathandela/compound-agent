/**
 * Tests for native module diagnostic output.
 *
 * TDD: Tests written BEFORE implementation.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);

// Must import AFTER mocks are set up
const { detectPackageManager, printNativeBuildDiagnostic } = await import('./native-diagnostic.js');

describe('detectPackageManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns pnpm when pnpm-lock.yaml exists', () => {
    mockedExistsSync.mockImplementation((p: unknown) =>
      String(p).endsWith('pnpm-lock.yaml'),
    );

    expect(detectPackageManager('/repo')).toBe('pnpm');
  });

  it('returns pnpm when packageManager field starts with pnpm', () => {
    mockedExistsSync.mockReturnValue(false);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ packageManager: 'pnpm@10.0.0' }),
    );

    expect(detectPackageManager('/repo')).toBe('pnpm');
  });

  it('returns yarn when yarn.lock exists', () => {
    mockedExistsSync.mockImplementation((p: unknown) =>
      String(p).endsWith('yarn.lock'),
    );
    mockedReadFileSync.mockImplementation(() => {
      throw new Error('no package.json');
    });

    expect(detectPackageManager('/repo')).toBe('yarn');
  });

  it('returns npm when package-lock.json exists', () => {
    mockedExistsSync.mockImplementation((p: unknown) =>
      String(p).endsWith('package-lock.json'),
    );
    mockedReadFileSync.mockImplementation(() => {
      throw new Error('no package.json');
    });

    expect(detectPackageManager('/repo')).toBe('npm');
  });

  it('returns unknown when no lockfile or packageManager field found', () => {
    mockedExistsSync.mockReturnValue(false);
    mockedReadFileSync.mockImplementation(() => {
      throw new Error('no package.json');
    });

    expect(detectPackageManager('/repo')).toBe('unknown');
  });

  it('returns yarn when packageManager field starts with yarn', () => {
    mockedExistsSync.mockReturnValue(false);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ packageManager: 'yarn@4.0.0' }),
    );

    expect(detectPackageManager('/repo')).toBe('yarn');
  });
});

describe('printNativeBuildDiagnostic', () => {
  let stderrOutput: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    stderrOutput = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      stderrOutput.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('outputs pnpm-specific instructions for pnpm projects', () => {
    // Set up as pnpm project
    mockedExistsSync.mockImplementation((p: unknown) =>
      String(p).endsWith('pnpm-lock.yaml'),
    );

    printNativeBuildDiagnostic(new Error('module not found'));

    const output = stderrOutput.join('\n');
    expect(output).toContain('pnpm');
    expect(output).toContain('onlyBuiltDependencies');
    expect(output).toContain('npx ca setup');
  });

  it('mentions pnpm approve-builds as an option', () => {
    mockedExistsSync.mockImplementation((p: unknown) =>
      String(p).endsWith('pnpm-lock.yaml'),
    );

    printNativeBuildDiagnostic(new Error('module not found'));

    const output = stderrOutput.join('\n');
    expect(output).toContain('pnpm approve-builds');
  });

  it('outputs npm rebuild for non-pnpm projects', () => {
    mockedExistsSync.mockImplementation((p: unknown) =>
      String(p).endsWith('package-lock.json'),
    );
    mockedReadFileSync.mockImplementation(() => {
      throw new Error('no package.json');
    });

    printNativeBuildDiagnostic(new Error('module not found'));

    const output = stderrOutput.join('\n');
    expect(output).toContain('npm rebuild better-sqlite3');
  });

  it('includes underlying error cause when available', () => {
    mockedExistsSync.mockReturnValue(false);
    mockedReadFileSync.mockImplementation(() => {
      throw new Error('no file');
    });

    const cause = new Error('Cannot find module better-sqlite3');
    const err = new Error('failed to load', { cause });

    printNativeBuildDiagnostic(err);

    const output = stderrOutput.join('\n');
    expect(output).toContain('Cannot find module better-sqlite3');
  });

  it('includes platform-specific build tool hints', () => {
    mockedExistsSync.mockReturnValue(false);
    mockedReadFileSync.mockImplementation(() => {
      throw new Error('no file');
    });

    printNativeBuildDiagnostic(new Error('failed'));

    const output = stderrOutput.join('\n');
    // Should include at least one platform-specific hint
    const hasHint = output.includes('xcode-select') ||
      output.includes('build-essential') ||
      output.includes('Visual Studio Build Tools');
    expect(hasHint).toBe(true);
  });

  it('always shows the ERROR header', () => {
    mockedExistsSync.mockReturnValue(false);
    mockedReadFileSync.mockImplementation(() => {
      throw new Error('no file');
    });

    printNativeBuildDiagnostic(new Error('failed'));

    const output = stderrOutput.join('\n');
    expect(output).toContain('better-sqlite3');
    expect(output).toContain('ERROR');
  });
});
