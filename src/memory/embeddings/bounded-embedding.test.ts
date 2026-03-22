/**
 * Tests for withBoundedEmbedding integration.
 *
 * Mocks acquireSearchSlot to test slot-acquired vs slot-busy paths
 * without needing real file system slot files.
 */

import { describe, expect, it, vi } from 'vitest';

import type { SearchSlotResult } from './search-semaphore.js';

// Mock the semaphore module
const mockAcquireSearchSlot = vi.fn<(repoRoot: string) => SearchSlotResult>();
vi.mock('./search-semaphore.js', () => ({
  acquireSearchSlot: (...args: [string]) => mockAcquireSearchSlot(...args),
}));

// Mock withEmbedding to avoid loading the real model -- just run fn directly
vi.mock('./nomic.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./nomic.js')>();
  return {
    ...original,
    withEmbedding: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
  };
});

import { withBoundedEmbedding } from './nomic.js';

describe('withBoundedEmbedding', () => {
  it('calls fn when slot acquired', async () => {
    const releaseFn = vi.fn();
    mockAcquireSearchSlot.mockReturnValue({ acquired: true, release: releaseFn });

    const fn = vi.fn().mockResolvedValue('result');
    const fallback = vi.fn().mockResolvedValue('fallback');

    const result = await withBoundedEmbedding('/tmp/test', fn, fallback);
    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
    expect(releaseFn).toHaveBeenCalledOnce();
  });

  it('calls fallback when slot busy', async () => {
    mockAcquireSearchSlot.mockReturnValue({ acquired: false, activeCount: 2 });

    const fn = vi.fn().mockResolvedValue('result');
    const fallback = vi.fn().mockResolvedValue('fallback');

    const result = await withBoundedEmbedding('/tmp/test', fn, fallback);
    expect(result).toBe('fallback');
    expect(fallback).toHaveBeenCalledOnce();
    expect(fn).not.toHaveBeenCalled();
  });

  it('releases slot even on fn error', async () => {
    const releaseFn = vi.fn();
    mockAcquireSearchSlot.mockReturnValue({ acquired: true, release: releaseFn });

    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    const fallback = vi.fn();

    await expect(withBoundedEmbedding('/tmp/test', fn, fallback)).rejects.toThrow('boom');
    expect(releaseFn).toHaveBeenCalledOnce();
  });
});
