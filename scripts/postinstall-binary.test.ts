/**
 * Tests for the binary distribution postinstall script.
 *
 * Tests platform detection, SHA256 checksum verification, binary skip logic,
 * and the bin/ca wrapper. Uses temp dirs to avoid polluting the project.
 *
 * TDD: These tests are written BEFORE the implementation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// The postinstall.cjs exports functions for testability
// Using createRequire since the postinstall is CommonJS (.cjs in an ESM project)
import { createRequire } from 'node:module';

const cjsRequire = createRequire(import.meta.url);

// Path to the postinstall script
const POSTINSTALL_PATH = join(import.meta.dirname, 'postinstall.cjs');

/**
 * Helper: compute SHA256 hex digest of a buffer.
 */
function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

describe('postinstall-binary: platform detection', () => {
  it('maps darwin + arm64 to darwin-arm64', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = cjsRequire(POSTINSTALL_PATH);
    expect(mod.getPlatformKey('darwin', 'arm64')).toBe('darwin-arm64');
  });

  it('maps darwin + x64 to darwin-amd64', () => {
    const mod = cjsRequire(POSTINSTALL_PATH);
    expect(mod.getPlatformKey('darwin', 'x64')).toBe('darwin-amd64');
  });

  it('maps linux + arm64 to linux-arm64', () => {
    const mod = cjsRequire(POSTINSTALL_PATH);
    expect(mod.getPlatformKey('linux', 'arm64')).toBe('linux-arm64');
  });

  it('maps linux + x64 to linux-amd64', () => {
    const mod = cjsRequire(POSTINSTALL_PATH);
    expect(mod.getPlatformKey('linux', 'x64')).toBe('linux-amd64');
  });

  it('throws for unsupported platform (win32)', () => {
    const mod = cjsRequire(POSTINSTALL_PATH);
    expect(() => mod.getPlatformKey('win32', 'x64')).toThrow(/unsupported platform/i);
  });

  it('throws for unsupported arch (ia32)', () => {
    const mod = cjsRequire(POSTINSTALL_PATH);
    expect(() => mod.getPlatformKey('linux', 'ia32')).toThrow(/unsupported platform/i);
  });
});

describe('postinstall-binary: checksum verification', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ca-checksum-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('verifyChecksum returns true for matching SHA256', () => {
    const mod = cjsRequire(POSTINSTALL_PATH);
    const content = Buffer.from('hello binary content');
    const filePath = join(tempDir, 'ca-binary');
    writeFileSync(filePath, content);

    const hash = sha256(content);
    const checksumsTxt = `${hash}  ca-binary\n`;
    const checksumsPath = join(tempDir, 'checksums.txt');
    writeFileSync(checksumsPath, checksumsTxt);

    expect(mod.verifyChecksum(filePath, 'ca-binary', checksumsPath)).toBe(true);
  });

  it('verifyChecksum returns false for mismatching SHA256', () => {
    const mod = cjsRequire(POSTINSTALL_PATH);
    const content = Buffer.from('hello binary content');
    const filePath = join(tempDir, 'ca-binary');
    writeFileSync(filePath, content);

    const checksumsTxt = `0000000000000000000000000000000000000000000000000000000000000000  ca-binary\n`;
    const checksumsPath = join(tempDir, 'checksums.txt');
    writeFileSync(checksumsPath, checksumsTxt);

    expect(mod.verifyChecksum(filePath, 'ca-binary', checksumsPath)).toBe(false);
  });

  it('verifyChecksum throws when artifact not found in checksums.txt', () => {
    const mod = cjsRequire(POSTINSTALL_PATH);
    const content = Buffer.from('some content');
    const filePath = join(tempDir, 'ca-binary');
    writeFileSync(filePath, content);

    const checksumsTxt = `deadbeef  some-other-file\n`;
    const checksumsPath = join(tempDir, 'checksums.txt');
    writeFileSync(checksumsPath, checksumsTxt);

    expect(() => mod.verifyChecksum(filePath, 'ca-binary', checksumsPath))
      .toThrow(/not found in checksums/i);
  });

  it('verifyChecksum handles GoReleaser checksums.txt format', () => {
    const mod = cjsRequire(POSTINSTALL_PATH);
    const content = Buffer.from('go binary bytes');
    const filePath = join(tempDir, 'ca-darwin-arm64');
    writeFileSync(filePath, content);

    const hash = sha256(content);
    // GoReleaser format: <hash>  <filename>
    const checksumsTxt = [
      `aaaa  ca-darwin-amd64`,
      `${hash}  ca-darwin-arm64`,
      `bbbb  ca-linux-amd64`,
      `cccc  ca-embed-darwin-arm64`,
    ].join('\n') + '\n';
    const checksumsPath = join(tempDir, 'checksums.txt');
    writeFileSync(checksumsPath, checksumsTxt);

    expect(mod.verifyChecksum(filePath, 'ca-darwin-arm64', checksumsPath)).toBe(true);
  });
});

describe('postinstall-binary: skip logic', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ca-skip-'));
    mkdirSync(join(tempDir, 'bin'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('shouldSkipDownload returns true when both binaries exist and ca works', () => {
    const mod = cjsRequire(POSTINSTALL_PATH);
    const binDir = join(tempDir, 'bin');

    // Create a fake "ca-binary" that exits 0 when called with "version"
    const fakeBinary = join(binDir, 'ca-binary');
    writeFileSync(fakeBinary, '#!/bin/sh\necho "v1.0.0"\n');
    chmodSync(fakeBinary, 0o755);

    const fakeEmbed = join(binDir, 'ca-embed');
    writeFileSync(fakeEmbed, '#!/bin/sh\n');
    chmodSync(fakeEmbed, 0o755);

    expect(mod.shouldSkipDownload(binDir)).toBe(true);
  });

  it('shouldSkipDownload returns false when ca-binary is missing', () => {
    const mod = cjsRequire(POSTINSTALL_PATH);
    const binDir = join(tempDir, 'bin');

    const fakeEmbed = join(binDir, 'ca-embed');
    writeFileSync(fakeEmbed, '#!/bin/sh\n');
    chmodSync(fakeEmbed, 0o755);

    expect(mod.shouldSkipDownload(binDir)).toBe(false);
  });

  it('shouldSkipDownload returns false when ca-embed is missing', () => {
    const mod = cjsRequire(POSTINSTALL_PATH);
    const binDir = join(tempDir, 'bin');

    const fakeBinary = join(binDir, 'ca-binary');
    writeFileSync(fakeBinary, '#!/bin/sh\necho "v1.0.0"\n');
    chmodSync(fakeBinary, 0o755);

    expect(mod.shouldSkipDownload(binDir)).toBe(false);
  });

  it('shouldSkipDownload returns false when ca-binary exits non-zero', () => {
    const mod = cjsRequire(POSTINSTALL_PATH);
    const binDir = join(tempDir, 'bin');

    const fakeBinary = join(binDir, 'ca-binary');
    writeFileSync(fakeBinary, '#!/bin/sh\nexit 1\n');
    chmodSync(fakeBinary, 0o755);

    const fakeEmbed = join(binDir, 'ca-embed');
    writeFileSync(fakeEmbed, '#!/bin/sh\n');
    chmodSync(fakeEmbed, 0o755);

    expect(mod.shouldSkipDownload(binDir)).toBe(false);
  });
});

describe('bin/ca wrapper', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ca-wrapper-'));
    mkdirSync(join(tempDir, 'bin'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('exits with error when binary not found', () => {
    // The wrapper script at bin/ca should exit 1 when ca-binary is missing
    const wrapperPath = join(import.meta.dirname, '..', 'bin', 'ca');

    // Only run if wrapper exists (it will be created in T2)
    if (!existsSync(wrapperPath)) {
      // TDD RED: wrapper doesn't exist yet, test should fail
      expect(existsSync(wrapperPath)).toBe(true);
      return;
    }

    // Point CA_BINARY_PATH to a non-existent file
    try {
      execFileSync('node', [wrapperPath], {
        stdio: 'pipe',
        env: { ...process.env, CA_BINARY_PATH: join(tempDir, 'nonexistent') },
      });
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.status).toBe(1);
      expect(err.stderr?.toString() || '').toMatch(/binary not found/i);

    }
  });

  it('forwards args to the binary', () => {
    const wrapperPath = join(import.meta.dirname, '..', 'bin', 'ca');
    if (!existsSync(wrapperPath)) {
      expect(existsSync(wrapperPath)).toBe(true);
      return;
    }

    // Create a fake binary that echoes its args
    const binDir = join(tempDir, 'bin');
    const fakeBinary = join(binDir, 'ca-binary');
    writeFileSync(fakeBinary, '#!/bin/sh\necho "$@"\n');
    chmodSync(fakeBinary, 0o755);

    // Wrapper needs to find the binary relative to itself
    // For testing, we'll set an env var to override the binary path
    // This tests that args are forwarded correctly
    const result = execFileSync('node', [wrapperPath, 'version', '--json'], {
      stdio: 'pipe',
      env: { ...process.env, CA_BINARY_PATH: fakeBinary },
    });
    expect(result.toString().trim()).toBe('version --json');
  });
});

describe('package.json for npm distribution', () => {
  const pkg = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf-8'),
  );

  it('has bin entries for ca and compound-agent', () => {
    expect(pkg.bin?.ca).toBeDefined();
    expect(pkg.bin?.['compound-agent']).toBeDefined();
  });

  it('has os restrictions for darwin and linux', () => {
    expect(pkg.os).toEqual(expect.arrayContaining(['darwin', 'linux']));
    expect(pkg.os).toHaveLength(2);
  });

  it('has cpu restrictions for x64 and arm64', () => {
    expect(pkg.cpu).toEqual(expect.arrayContaining(['x64', 'arm64']));
    expect(pkg.cpu).toHaveLength(2);
  });

  it('postinstall script runs postinstall.cjs', () => {
    expect(pkg.scripts?.postinstall).toBe('node scripts/postinstall.cjs');
  });

  it('files list includes bin/ and scripts/postinstall.cjs', () => {
    expect(pkg.files).toEqual(expect.arrayContaining(['bin/']));
    expect(pkg.files).toEqual(expect.arrayContaining(['scripts/postinstall.cjs']));
  });

  it('bin/ca wrapper exists as publish-ready artifact', () => {
    expect(existsSync(join(import.meta.dirname, '..', 'bin', 'ca'))).toBe(true);
  });

  it('scripts/postinstall.cjs exists as publish-ready artifact', () => {
    expect(existsSync(join(import.meta.dirname, '..', 'scripts', 'postinstall.cjs'))).toBe(true);
  });
});
