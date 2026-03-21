/**
 * Tests for abortable readStdin helper.
 *
 * Uses PassThrough streams to simulate stdin behavior without touching
 * the real process.stdin. Verifies proper cleanup of listeners, timers,
 * and stream state on all code paths (success, timeout, maxBytes, already-closed).
 */

import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// We'll import the module under test after mocking process.stdin
import type { ReadStdinOptions } from './read-stdin.js';

/** Helper: create a fresh PassThrough posing as stdin. */
function makeFakeStdin(): PassThrough & { isTTY?: boolean } {
  const stream = new PassThrough() as PassThrough & { isTTY?: boolean };
  stream.isTTY = undefined; // non-TTY by default
  return stream;
}

describe('readStdin', () => {
  let fakeStdin: ReturnType<typeof makeFakeStdin>;
  let readStdin: (options?: ReadStdinOptions) => Promise<string>;

  beforeEach(async () => {
    fakeStdin = makeFakeStdin();

    // Mock process.stdin with our PassThrough before importing the module
    vi.stubGlobal('process', {
      ...process,
      stdin: fakeStdin,
    });

    // Dynamic import so the module picks up the mocked stdin
    const mod = await import('./read-stdin.js');
    readStdin = mod.readStdin;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    // Ensure stream is destroyed to prevent leaks in tests
    if (!fakeStdin.destroyed) {
      fakeStdin.destroy();
    }
  });

  // -----------------------------------------------------------------------
  // 1. Reads complete stdin data and returns it as string
  // -----------------------------------------------------------------------
  it('reads complete stdin data and returns it as a string', async () => {
    const promise = readStdin({ timeoutMs: 5_000 });

    // Push data and signal end
    fakeStdin.write('hello ');
    fakeStdin.write('world');
    fakeStdin.end();

    const result = await promise;
    expect(result).toBe('hello world');
  });

  // -----------------------------------------------------------------------
  // 2. Returns empty string when stdin is already ended/closed
  // -----------------------------------------------------------------------
  it('returns empty string when stdin is already ended', async () => {
    // End the stream and consume it so readableEnded becomes true
    fakeStdin.resume(); // consume data so 'end' event fires
    fakeStdin.end();
    // Wait for the stream to fully close
    await new Promise<void>((resolve) => fakeStdin.once('end', resolve));

    const result = await readStdin({ timeoutMs: 1_000 });
    expect(result).toBe('');
  });

  it('returns empty string when stdin is already destroyed', async () => {
    fakeStdin.destroy();

    const result = await readStdin({ timeoutMs: 1_000 });
    expect(result).toBe('');
  });

  // -----------------------------------------------------------------------
  // 3. Times out and cleans up stdin after timeout period
  // -----------------------------------------------------------------------
  it('rejects with timeout error and cleans up the stream', async () => {
    // Use a very short timeout, never push data or end
    const promise = readStdin({ timeoutMs: 50 });

    await expect(promise).rejects.toThrow('stdin read timed out');

    // Stream should be cleaned up (destroyed or paused with listeners removed)
    expect(fakeStdin.destroyed || fakeStdin.isPaused()).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 4. Respects maxBytes limit
  // -----------------------------------------------------------------------
  it('rejects when maxBytes limit is exceeded', async () => {
    const promise = readStdin({ timeoutMs: 5_000, maxBytes: 10 });

    // Push more than 10 bytes
    fakeStdin.write('this is way more than ten bytes');
    fakeStdin.end();

    await expect(promise).rejects.toThrow(/exceeds.*byte limit/i);
  });

  it('allows data exactly at maxBytes boundary', async () => {
    const promise = readStdin({ timeoutMs: 5_000, maxBytes: 5 });

    fakeStdin.write('hello');
    fakeStdin.end();

    const result = await promise;
    expect(result).toBe('hello');
  });

  // -----------------------------------------------------------------------
  // 5. Cleans up timer on successful read
  // -----------------------------------------------------------------------
  it('clears the timeout timer on successful read', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const promise = readStdin({ timeoutMs: 10_000 });
    fakeStdin.write('data');
    fakeStdin.end();

    await promise;

    // clearTimeout should have been called to clean up the timer
    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThanOrEqual(1);

    clearTimeoutSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // 6. After resolve, no lingering listeners from readStdin
  // -----------------------------------------------------------------------
  it('removes all listeners it attached after successful read', async () => {
    const listenerCountBefore = fakeStdin.listenerCount('data') + fakeStdin.listenerCount('end') + fakeStdin.listenerCount('error');

    const promise = readStdin({ timeoutMs: 5_000 });
    fakeStdin.write('test');
    fakeStdin.end();
    await promise;

    const listenerCountAfter = fakeStdin.listenerCount('data') + fakeStdin.listenerCount('end') + fakeStdin.listenerCount('error');
    // Should not have more listeners than before
    expect(listenerCountAfter).toBeLessThanOrEqual(listenerCountBefore);
  });

  it('removes all listeners it attached after timeout', async () => {
    const listenerCountBefore = fakeStdin.listenerCount('data') + fakeStdin.listenerCount('end') + fakeStdin.listenerCount('error');

    const promise = readStdin({ timeoutMs: 50 });

    try {
      await promise;
    } catch {
      // Expected timeout error
    }

    const listenerCountAfter = fakeStdin.listenerCount('data') + fakeStdin.listenerCount('end') + fakeStdin.listenerCount('error');
    expect(listenerCountAfter).toBeLessThanOrEqual(listenerCountBefore);
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  it('handles empty stdin (immediate end, no data)', async () => {
    const promise = readStdin({ timeoutMs: 5_000 });
    fakeStdin.end();

    const result = await promise;
    expect(result).toBe('');
  });

  it('handles stream error gracefully', async () => {
    const promise = readStdin({ timeoutMs: 5_000 });

    fakeStdin.destroy(new Error('stream broke'));

    await expect(promise).rejects.toThrow('stream broke');
  });

  it('uses default options when none provided', async () => {
    // Just verify it doesn't throw when called with no options
    const promise = readStdin();
    fakeStdin.write('defaults work');
    fakeStdin.end();

    const result = await promise;
    expect(result).toBe('defaults work');
  });
});
