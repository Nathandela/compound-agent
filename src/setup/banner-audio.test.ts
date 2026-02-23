import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';

// File-scope vi.mock — hoists correctly here. Replaces spawn with a controllable vi.fn.
vi.mock('node:child_process', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:child_process')>();
  return { ...orig, spawn: vi.fn(orig.spawn) };
});

import { spawn } from 'node:child_process';
import { playBannerAudio } from './banner-audio.js';

const mockSpawn = vi.mocked(spawn);

describe('banner-audio', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  /** Create a fake ChildProcess-like EventEmitter with enough surface for spawnPlayer. */
  function fakeProc(): ChildProcess {
    const emitter = new EventEmitter() as ChildProcess;
    emitter.kill = vi.fn().mockReturnValue(true);
    emitter.unref = vi.fn();
    emitter.pid = 99999;
    return emitter;
  }

  it('handles async ENOENT error without crashing', async () => {
    const proc = fakeProc();
    mockSpawn.mockReturnValue(proc);

    const result = playBannerAudio();

    // spawn didn't throw synchronously, so we get a stop handle
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('stop');
    expect(typeof result!.stop).toBe('function');

    // Simulate the async error that fires when aplay/afplay binary is missing
    proc.emit('error', new Error('spawn aplay ENOENT'));

    // Allow microtask queue to flush
    await new Promise(resolve => setTimeout(resolve, 10));

    // stop() should not throw even after async error
    expect(() => result!.stop()).not.toThrow();
  });

  it('returns null when spawn throws synchronously', () => {
    mockSpawn.mockImplementation(() => { throw new Error('spawn ENOENT'); });

    const result = playBannerAudio();
    expect(result).toBeNull();
  });

  it('stop() is idempotent', () => {
    const proc = fakeProc();
    mockSpawn.mockReturnValue(proc);

    const result = playBannerAudio();
    expect(result).not.toBeNull();

    proc.emit('exit', 0, null);

    expect(() => result!.stop()).not.toThrow();
    expect(() => result!.stop()).not.toThrow();
  });

  it('cleans up temp file on normal exit', () => {
    const proc = fakeProc();
    mockSpawn.mockReturnValue(proc);

    const result = playBannerAudio();
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('stop');

    // Normal exit triggers cleanup listener
    proc.emit('exit', 0, null);

    // stop() still works after process exits
    expect(() => result!.stop()).not.toThrow();
  });
});
