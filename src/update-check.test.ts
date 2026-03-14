/**
 * Tests for update-check module -- version checking, caching, and notification.
 *
 * TDD: Tests written BEFORE implementation.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('./version.js', () => ({
  VERSION: '1.5.0',
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    statSync: vi.fn(),
  };
});

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedStatSync = vi.mocked(statSync);

// Dynamic import after mocks are in place.
const {
  fetchLatestVersion,
  checkForUpdate,
  formatUpdateNotification,
  formatUpdateNotificationMarkdown,
  isMajorUpdate,
  shouldCheckForUpdate,
} = await import('./update-check.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchOk(body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(body),
    }),
  );
}

function mockFetchFail(): void {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
}

// ---------------------------------------------------------------------------
// fetchLatestVersion
// ---------------------------------------------------------------------------

describe('fetchLatestVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns version string on successful fetch', async () => {
    mockFetchOk({ latest: '2.0.0' });

    const version = await fetchLatestVersion('compound-agent');

    expect(version).toBe('2.0.0');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('returns null on network failure', async () => {
    mockFetchFail();

    const version = await fetchLatestVersion('compound-agent');

    expect(version).toBeNull();
  });

  it('returns null when HTTP response is not ok (e.g., 404)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve({}) }),
    );

    const version = await fetchLatestVersion('compound-agent');

    expect(version).toBeNull();
  });

  it('returns null on invalid JSON response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      }),
    );

    const version = await fetchLatestVersion('compound-agent');

    expect(version).toBeNull();
  });

  it('uses a 3-second timeout via AbortSignal', async () => {
    mockFetchOk({ latest: '2.0.0' });

    await fetchLatestVersion('compound-agent');

    const callArgs = vi.mocked(fetch).mock.calls[0];
    const options = callArgs[1] as RequestInit | undefined;
    expect(options?.signal).toBeDefined();
    // AbortSignal.timeout(3000) produces an AbortSignal
    expect(options!.signal).toBeInstanceOf(AbortSignal);
  });

  it('defaults to "compound-agent" when no package name is provided', async () => {
    mockFetchOk({ latest: '3.0.0' });

    const version = await fetchLatestVersion();

    expect(version).toBe('3.0.0');
    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain('compound-agent');
  });

  it('uses the dist-tags endpoint (not full manifest)', async () => {
    mockFetchOk({ latest: '2.0.0' });

    await fetchLatestVersion('compound-agent');

    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toBe('https://registry.npmjs.org/-/package/compound-agent/dist-tags');
  });
});

// ---------------------------------------------------------------------------
// checkForUpdate
// ---------------------------------------------------------------------------

describe('checkForUpdate', () => {
  const cacheDir = join(tmpdir(), 'ca-test-cache');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns result with updateAvailable=true when newer version exists', async () => {
    // No cache file -- force fetch
    mockedStatSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    mockFetchOk({ latest: '2.0.0' });

    const result = await checkForUpdate(cacheDir);

    expect(result).not.toBeNull();
    expect(result!.current).toBe('1.5.0');
    expect(result!.latest).toBe('2.0.0');
    expect(result!.updateAvailable).toBe(true);
  });

  it('returns result with updateAvailable=false when current equals latest', async () => {
    mockedStatSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    mockFetchOk({ latest: '1.5.0' });

    const result = await checkForUpdate(cacheDir);

    expect(result).not.toBeNull();
    expect(result!.current).toBe('1.5.0');
    expect(result!.latest).toBe('1.5.0');
    expect(result!.updateAvailable).toBe(false);
  });

  it('returns updateAvailable=false when installed version is newer than registry (downgrade guard)', async () => {
    // Simulates an npm unpublish scenario where registry returns an older version.
    // Current is 1.5.0 (mocked VERSION), registry returns 1.4.0 -- should NOT prompt upgrade.
    mockedStatSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    mockFetchOk({ latest: '1.4.0' });

    const result = await checkForUpdate(cacheDir);

    expect(result).not.toBeNull();
    expect(result!.updateAvailable).toBe(false);
  });

  it('uses cached result when cache is fresh (< 24 hours old)', async () => {
    const now = new Date();
    mockedStatSync.mockReturnValue({ mtimeMs: now.getTime() } as ReturnType<typeof statSync>);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ latest: '2.0.0' }),
    );
    // fetch should NOT be called when cache is fresh
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await checkForUpdate(cacheDir);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result!.latest).toBe('2.0.0');
    expect(result!.updateAvailable).toBe(true);
  });

  it('fetches from registry when cache is expired (> 24 hours old)', async () => {
    const staleTime = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
    mockedStatSync.mockReturnValue({ mtimeMs: staleTime } as ReturnType<typeof statSync>);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ latest: '1.5.0' }),
    );
    mockFetchOk({ latest: '2.1.0' });

    const result = await checkForUpdate(cacheDir);

    expect(fetch).toHaveBeenCalledOnce();
    expect(result).not.toBeNull();
    expect(result!.latest).toBe('2.1.0');
  });

  it('fetches from registry when cache file does not exist', async () => {
    mockedStatSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    mockFetchOk({ latest: '2.0.0' });

    const result = await checkForUpdate(cacheDir);

    expect(fetch).toHaveBeenCalledOnce();
    expect(result).not.toBeNull();
    expect(result!.latest).toBe('2.0.0');
  });

  it('returns null on corrupted cache file (invalid JSON) and treats as miss', async () => {
    const now = new Date();
    mockedStatSync.mockReturnValue({ mtimeMs: now.getTime() } as ReturnType<typeof statSync>);
    mockedReadFileSync.mockReturnValue('not valid json{{{');
    mockFetchOk({ latest: '2.0.0' });

    const result = await checkForUpdate(cacheDir);

    // Should fall through to fetch since cache parse failed
    expect(fetch).toHaveBeenCalledOnce();
    expect(result).not.toBeNull();
    expect(result!.latest).toBe('2.0.0');
  });

  it('returns null when fetch fails (network error)', async () => {
    mockedStatSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    mockFetchFail();

    const result = await checkForUpdate(cacheDir);

    expect(result).toBeNull();
  });

  it('writes cache file after successful fetch', async () => {
    mockedStatSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    mockFetchOk({ latest: '2.0.0' });

    await checkForUpdate(cacheDir);

    expect(mockedMkdirSync).toHaveBeenCalledWith(cacheDir, { recursive: true });
    expect(mockedWriteFileSync).toHaveBeenCalledOnce();
    const writtenPath = mockedWriteFileSync.mock.calls[0][0] as string;
    expect(writtenPath).toContain('update-check');
    const writtenData = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(writtenData.latest).toBe('2.0.0');
  });
});

// ---------------------------------------------------------------------------
// formatUpdateNotification
// ---------------------------------------------------------------------------

describe('isMajorUpdate', () => {
  it('returns true when major version increases', () => {
    expect(isMajorUpdate('1.5.0', '2.0.0')).toBe(true);
  });

  it('returns false for minor bump', () => {
    expect(isMajorUpdate('1.5.0', '1.6.0')).toBe(false);
  });

  it('returns false for patch bump', () => {
    expect(isMajorUpdate('1.5.0', '1.5.1')).toBe(false);
  });
});

describe('formatUpdateNotification', () => {
  it('returns formatted string with both versions', () => {
    const output = formatUpdateNotification('1.5.0', '2.0.0');

    expect(output).toContain('1.5.0');
    expect(output).toContain('2.0.0');
  });

  it('shows both global and dev-dependency update commands', () => {
    const output = formatUpdateNotification('1.5.0', '1.6.0');

    expect(output).toContain('npm update -g compound-agent');
    expect(output).toContain('pnpm add -D compound-agent@latest');
  });

  it('labels major updates differently from minor/patch', () => {
    const major = formatUpdateNotification('1.5.0', '2.0.0');
    const minor = formatUpdateNotification('1.5.0', '1.6.0');

    expect(major).toContain('Major update');
    expect(major).toContain('breaking changes');
    expect(minor).not.toContain('Major update');
    expect(minor).toContain('Update available');
  });

  it('classifies patch bump as "Update available" (not major)', () => {
    const patch = formatUpdateNotification('1.5.0', '1.5.1');

    expect(patch).toContain('Update available');
    expect(patch).not.toContain('Major update');
  });
});

describe('formatUpdateNotificationMarkdown', () => {
  it('returns markdown with backtick-wrapped commands', () => {
    const output = formatUpdateNotificationMarkdown('1.5.0', '1.6.0');

    expect(output).toContain('`npm update -g compound-agent`');
    expect(output).toContain('`pnpm add -D compound-agent@latest`');
  });

  it('includes MAJOR label for major version bumps', () => {
    const output = formatUpdateNotificationMarkdown('1.5.0', '2.0.0');

    expect(output).toContain('MAJOR');
    expect(output).toContain('breaking changes');
  });

  it('prefixes versions with v', () => {
    const output = formatUpdateNotificationMarkdown('1.5.0', '1.6.0');

    expect(output).toContain('v1.6.0');
    expect(output).toContain('v1.5.0');
  });
});

// ---------------------------------------------------------------------------
// shouldCheckForUpdate
// ---------------------------------------------------------------------------

describe('shouldCheckForUpdate', () => {
  const originalEnv = { ...process.env };
  const originalIsTTY = process.stdout.isTTY;

  afterEach(() => {
    process.env = { ...originalEnv };
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
  });

  it('returns true in normal TTY environment', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    delete process.env['CI'];
    delete process.env['NO_UPDATE_NOTIFIER'];
    delete process.env['NODE_ENV'];

    expect(shouldCheckForUpdate()).toBe(true);
  });

  it('returns false when not a TTY', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

    expect(shouldCheckForUpdate()).toBe(false);
  });

  it('returns false when CI env var is set', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    process.env['CI'] = 'true';

    expect(shouldCheckForUpdate()).toBe(false);
  });

  it('returns false when NO_UPDATE_NOTIFIER is set', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    process.env['NO_UPDATE_NOTIFIER'] = '1';

    expect(shouldCheckForUpdate()).toBe(false);
  });

  it('returns false when NODE_ENV is test', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    process.env['NODE_ENV'] = 'test';

    expect(shouldCheckForUpdate()).toBe(false);
  });
});
