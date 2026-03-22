/**
 * Concurrency regression tests for the search semaphore.
 *
 * Verifies the semaphore stays bounded under concurrent pressure,
 * cleans up stale slots, and does not leak slot files.
 * Uses real file system operations with isolated temp directories.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  acquireSearchSlot,
  countActiveSlots,
  DEFAULT_MAX_CONCURRENT,
  type SearchSlotResult,
} from './search-semaphore.js';

describe('search-semaphore concurrency regression', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sem-concurrency-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const slotsDir = () => join(tempDir, '.claude', '.cache', 'embed-slots');

  const slotFileCount = (): number => {
    const dir = slotsDir();
    if (!existsSync(dir)) return 0;
    return readdirSync(dir).filter(f => f.startsWith('slot-') && f.endsWith('.lock')).length;
  };

  it('concurrent slot acquisitions stay bounded at MAX_CONCURRENT', () => {
    const attempts = 10;
    const results: SearchSlotResult[] = [];

    for (let i = 0; i < attempts; i++) {
      results.push(acquireSearchSlot(tempDir));
    }

    const acquired = results.filter(r => r.acquired);
    const busy = results.filter(r => !r.acquired);

    expect(acquired.length).toBe(DEFAULT_MAX_CONCURRENT);
    expect(busy.length).toBe(attempts - DEFAULT_MAX_CONCURRENT);

    // Every busy result reports the correct active count
    for (const r of busy) {
      if (!r.acquired) {
        expect(r.activeCount).toBe(DEFAULT_MAX_CONCURRENT);
      }
    }

    // Clean up
    for (const r of acquired) {
      if (r.acquired) r.release();
    }
  });

  it('cleans up stale slots from dead processes', () => {
    const dir = slotsDir();
    mkdirSync(dir, { recursive: true });

    // Fill all slots with a PID that is almost certainly dead
    for (let i = 0; i < DEFAULT_MAX_CONCURRENT; i++) {
      writeFileSync(
        join(dir, `slot-${i}.lock`),
        JSON.stringify({ pid: 999999, startedAt: new Date().toISOString() }),
      );
    }

    // All slots are stale, so new acquisitions should clean them up and succeed
    const result = acquireSearchSlot(tempDir);
    expect(result.acquired).toBe(true);

    // countActiveSlots should reflect only 1 live slot (ours)
    expect(countActiveSlots(tempDir)).toBe(1);

    if (result.acquired) result.release();
  });

  it('slot release after error in callback-style usage', () => {
    const result = acquireSearchSlot(tempDir);
    expect(result.acquired).toBe(true);
    if (!result.acquired) return;

    // Simulate an error during work, then release in finally
    try {
      throw new Error('simulated failure');
    } catch {
      // Error handled
    } finally {
      result.release();
    }

    // Slot file should be cleaned up
    expect(slotFileCount()).toBe(0);
    expect(countActiveSlots(tempDir)).toBe(0);

    // New acquisition should succeed
    const retry = acquireSearchSlot(tempDir);
    expect(retry.acquired).toBe(true);
    if (retry.acquired) retry.release();
  });

  it('repeated acquire/release cycles do not leak slot files', () => {
    const cycles = 20;

    for (let i = 0; i < cycles; i++) {
      const result = acquireSearchSlot(tempDir);
      expect(result.acquired).toBe(true);
      if (result.acquired) result.release();
    }

    // After all cycles, no slot files should remain
    expect(slotFileCount()).toBe(0);
    expect(countActiveSlots(tempDir)).toBe(0);
  });

  it('multiple concurrent cycles do not leak slots', () => {
    const cycles = 15;

    for (let c = 0; c < cycles; c++) {
      // Acquire all available slots
      const batch: SearchSlotResult[] = [];
      for (let i = 0; i < DEFAULT_MAX_CONCURRENT; i++) {
        batch.push(acquireSearchSlot(tempDir));
      }

      // All should succeed
      for (const r of batch) {
        expect(r.acquired).toBe(true);
      }

      // Release all
      for (const r of batch) {
        if (r.acquired) r.release();
      }
    }

    // No leftover files
    expect(slotFileCount()).toBe(0);
  });
});
