/**
 * Tests for pnpm build config check in doctor command.
 *
 * TDD: Tests written BEFORE implementation.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
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

const { checkPnpmBuildConfig } = await import('./doctor.js');

describe('checkPnpmBuildConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null for non-pnpm projects', () => {
    mockedExistsSync.mockReturnValue(false);
    mockedReadFileSync.mockReturnValue(JSON.stringify({}));

    const result = checkPnpmBuildConfig('/repo');

    expect(result).toBeNull();
  });

  it('returns fail when pnpm project has no onlyBuiltDependencies', () => {
    mockedExistsSync.mockImplementation((p: unknown) =>
      String(p).endsWith('pnpm-lock.yaml'),
    );
    mockedReadFileSync.mockReturnValue(JSON.stringify({ pnpm: {} }));

    const result = checkPnpmBuildConfig('/repo');

    expect(result).not.toBeNull();
    expect(result!.status).toBe('fail');
  });

  it('returns fail when pnpm project is missing some required deps', () => {
    mockedExistsSync.mockImplementation((p: unknown) =>
      String(p).endsWith('pnpm-lock.yaml'),
    );
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      pnpm: { onlyBuiltDependencies: ['better-sqlite3'] },
    }));

    const result = checkPnpmBuildConfig('/repo');

    expect(result).not.toBeNull();
    expect(result!.status).toBe('fail');
    expect(result!.fix).toContain('node-llama-cpp');
  });

  it('returns pass when all required deps are configured', () => {
    mockedExistsSync.mockImplementation((p: unknown) =>
      String(p).endsWith('pnpm-lock.yaml'),
    );
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      pnpm: { onlyBuiltDependencies: ['better-sqlite3', 'node-llama-cpp'] },
    }));

    const result = checkPnpmBuildConfig('/repo');

    expect(result).not.toBeNull();
    expect(result!.status).toBe('pass');
  });

  it('detects pnpm via packageManager field', () => {
    mockedExistsSync.mockReturnValue(false);
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      packageManager: 'pnpm@10.0.0',
      pnpm: { onlyBuiltDependencies: ['better-sqlite3', 'node-llama-cpp'] },
    }));

    const result = checkPnpmBuildConfig('/repo');

    expect(result).not.toBeNull();
    expect(result!.status).toBe('pass');
  });

  it('returns null when package.json is unreadable', () => {
    mockedExistsSync.mockReturnValue(false);
    mockedReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = checkPnpmBuildConfig('/repo');

    expect(result).toBeNull();
  });

  it('returns pass when wildcard "*" is configured', () => {
    mockedExistsSync.mockImplementation((p: unknown) =>
      String(p).endsWith('pnpm-lock.yaml'),
    );
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      pnpm: { onlyBuiltDependencies: ['*'] },
    }));

    const result = checkPnpmBuildConfig('/repo');

    expect(result).not.toBeNull();
    expect(result!.status).toBe('pass');
  });

  it('includes fix instruction mentioning npx ca setup', () => {
    mockedExistsSync.mockImplementation((p: unknown) =>
      String(p).endsWith('pnpm-lock.yaml'),
    );
    mockedReadFileSync.mockReturnValue(JSON.stringify({ pnpm: {} }));

    const result = checkPnpmBuildConfig('/repo');

    expect(result!.fix).toContain('npx ca setup');
  });
});
