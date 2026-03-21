/**
 * Tests for subprocess-based model usability probe.
 *
 * Written BEFORE implementation (TDD).
 *
 * These tests mock `execFile` from `node:child_process` to avoid actually
 * loading the ONNX runtime. The probe is designed to run the heavy check
 * in a subprocess so that ~370-460MB RSS is fully reclaimed on exit.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock child_process before importing the module under test
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

// Mock model-info to control isModelAvailable
vi.mock('./model-info.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./model-info.js')>();
  return {
    ...original,
    isModelAvailable: vi.fn(() => true),
  };
});

import { execFile } from 'node:child_process';
import { isModelAvailable } from './model-info.js';
import { probeModelUsability, PROBE_TIMEOUT_MS } from './model-probe.js';

// Type the mocked functions
const mockExecFile = vi.mocked(execFile);
const mockIsModelAvailable = vi.mocked(isModelAvailable);

describe('probeModelUsability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsModelAvailable.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns usable:true when probe subprocess exits 0', async () => {
    // Simulate execFile calling back with no error (exit code 0)
    mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      // execFile callback: (error, stdout, stderr)
      if (typeof callback === 'function') {
        callback(null, '', '');
      }
      return undefined as never;
    });

    const result = await probeModelUsability();

    expect(result.usable).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.action).toBeUndefined();
  });

  it('returns usable:false when subprocess exits non-zero', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      if (typeof callback === 'function') {
        const err = new Error('Command failed') as NodeJS.ErrnoException;
        err.code = '1';
        callback(err, '', 'Initialization failed');
      }
      return undefined as never;
    });

    const result = await probeModelUsability();

    expect(result.usable).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.action).toBeDefined();
    expect(result.action).toMatch(/download-model/);
  });

  it('returns usable:false when subprocess times out', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      if (typeof callback === 'function') {
        const err = new Error('Timed out') as NodeJS.ErrnoException & { killed?: boolean };
        err.killed = true;
        callback(err, '', '');
      }
      return undefined as never;
    });

    const result = await probeModelUsability();

    expect(result.usable).toBe(false);
    expect(result.reason).toMatch(/timed?\s*out/i);
  });

  it('returns usable:false when model files do not exist (fast path)', async () => {
    mockIsModelAvailable.mockReturnValue(false);

    const result = await probeModelUsability();

    expect(result.usable).toBe(false);
    expect(result.reason).toContain('not found');
    expect(result.action).toContain('download-model');
    // Should NOT have spawned a subprocess
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('spawns subprocess with timeout matching PROBE_TIMEOUT_MS', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      if (typeof callback === 'function') {
        callback(null, '', '');
      }
      return undefined as never;
    });

    await probeModelUsability();

    // Verify execFile was called with the timeout option
    expect(mockExecFile).toHaveBeenCalledTimes(1);
    const callArgs = mockExecFile.mock.calls[0];
    // callArgs: [command, args, options, callback]
    const options = callArgs![2] as { timeout?: number };
    expect(options.timeout).toBe(PROBE_TIMEOUT_MS);
  });

  it('exports PROBE_TIMEOUT_MS as 10000', () => {
    expect(PROBE_TIMEOUT_MS).toBe(10_000);
  });

  it('spawns node with -e flag containing probe script', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      if (typeof callback === 'function') {
        callback(null, '', '');
      }
      return undefined as never;
    });

    await probeModelUsability();

    expect(mockExecFile).toHaveBeenCalledTimes(1);
    const callArgs = mockExecFile.mock.calls[0];
    const command = callArgs![0];
    const args = callArgs![1] as string[];
    expect(command).toBe(process.execPath);
    expect(args[0]).toBe('-e');
    // The inline script should reference @huggingface/transformers
    expect(args[1]).toContain('@huggingface/transformers');
  });
});
