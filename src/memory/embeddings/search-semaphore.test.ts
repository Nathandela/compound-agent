/**
 * Tests for cross-process embedding search semaphore.
 *
 * Uses real file system operations (no mocked business logic).
 * Each test gets an isolated temp directory via mkdtempSync.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { acquireSearchSlot, countActiveSlots, DEFAULT_MAX_CONCURRENT, getMaxConcurrent } from './search-semaphore.js';

describe('search-semaphore', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'search-sem-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  describe('acquireSearchSlot', () => {
    it('returns acquired when no slots are taken', () => {
      const result = acquireSearchSlot(tempDir);
      expect(result.acquired).toBe(true);
      if (result.acquired) {
        result.release();
      }
    });

    it('can acquire up to MAX_CONCURRENT slots', () => {
      const slots = [];
      for (let i = 0; i < DEFAULT_MAX_CONCURRENT; i++) {
        const result = acquireSearchSlot(tempDir);
        expect(result.acquired).toBe(true);
        slots.push(result);
      }
      // Clean up
      for (const s of slots) {
        if (s.acquired) s.release();
      }
    });

    it('returns not-acquired when all slots are taken', () => {
      const slots = [];
      for (let i = 0; i < DEFAULT_MAX_CONCURRENT; i++) {
        const result = acquireSearchSlot(tempDir);
        expect(result.acquired).toBe(true);
        slots.push(result);
      }

      const overflow = acquireSearchSlot(tempDir);
      expect(overflow.acquired).toBe(false);
      if (!overflow.acquired) {
        expect(overflow.activeCount).toBe(DEFAULT_MAX_CONCURRENT);
      }

      // Clean up
      for (const s of slots) {
        if (s.acquired) s.release();
      }
    });

    it('release callback removes the slot file', () => {
      const result = acquireSearchSlot(tempDir);
      expect(result.acquired).toBe(true);
      if (!result.acquired) return;

      const slotDir = join(tempDir, '.claude', '.cache', 'embed-slots');
      const filesBefore = readdirSync(slotDir);
      expect(filesBefore.length).toBe(1);

      result.release();

      const filesAfter = readdirSync(slotDir);
      expect(filesAfter.length).toBe(0);
    });

    it('cleans up stale slot with dead PID and re-acquires', () => {
      const slotDir = join(tempDir, '.claude', '.cache', 'embed-slots');
      mkdirSync(slotDir, { recursive: true });

      // Write a slot file with a PID that doesn't exist (99999999)
      const staleContent = JSON.stringify({ pid: 99999999, startedAt: new Date().toISOString() });
      writeFileSync(join(slotDir, 'slot-0.lock'), staleContent, { flag: 'wx' });

      // Fill slot-1 with current process (alive)
      const slot1Content = JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() });
      writeFileSync(join(slotDir, 'slot-1.lock'), slot1Content, { flag: 'wx' });

      // Should clean up the stale slot-0 and acquire it
      const result = acquireSearchSlot(tempDir);
      expect(result.acquired).toBe(true);
      if (result.acquired) {
        // Verify it took the stale slot
        const content = JSON.parse(readFileSync(join(slotDir, 'slot-0.lock'), 'utf-8'));
        expect(content.pid).toBe(process.pid);
        result.release();
      }

      // Clean up the manually-written slot-1
      rmSync(join(slotDir, 'slot-1.lock'), { force: true });
    });

    it('creates slot directory automatically if missing', () => {
      const slotDir = join(tempDir, '.claude', '.cache', 'embed-slots');
      expect(existsSync(slotDir)).toBe(false);

      const result = acquireSearchSlot(tempDir);
      expect(result.acquired).toBe(true);
      expect(existsSync(slotDir)).toBe(true);

      if (result.acquired) result.release();
    });
  });

  describe('getMaxConcurrent', () => {
    it('returns DEFAULT_MAX_CONCURRENT when env var not set', () => {
      vi.stubEnv('CA_MAX_EMBED_SLOTS', '');
      expect(getMaxConcurrent()).toBe(DEFAULT_MAX_CONCURRENT);
    });

    it('reads CA_MAX_EMBED_SLOTS env var', () => {
      vi.stubEnv('CA_MAX_EMBED_SLOTS', '5');
      expect(getMaxConcurrent()).toBe(5);
    });

    it('falls back to default for non-numeric env value', () => {
      vi.stubEnv('CA_MAX_EMBED_SLOTS', 'abc');
      expect(getMaxConcurrent()).toBe(DEFAULT_MAX_CONCURRENT);
    });

    it('falls back to default for zero', () => {
      vi.stubEnv('CA_MAX_EMBED_SLOTS', '0');
      expect(getMaxConcurrent()).toBe(DEFAULT_MAX_CONCURRENT);
    });

    it('falls back to default for negative values', () => {
      vi.stubEnv('CA_MAX_EMBED_SLOTS', '-1');
      expect(getMaxConcurrent()).toBe(DEFAULT_MAX_CONCURRENT);
    });
  });

  describe('countActiveSlots', () => {
    it('returns 0 when no slots taken', () => {
      expect(countActiveSlots(tempDir)).toBe(0);
    });

    it('returns correct count after acquiring slots', () => {
      const s1 = acquireSearchSlot(tempDir);
      expect(countActiveSlots(tempDir)).toBe(1);

      const s2 = acquireSearchSlot(tempDir);
      expect(countActiveSlots(tempDir)).toBe(2);

      if (s1.acquired) s1.release();
      expect(countActiveSlots(tempDir)).toBe(1);

      if (s2.acquired) s2.release();
      expect(countActiveSlots(tempDir)).toBe(0);
    });

    it('does not count stale slots with dead PIDs', () => {
      const slotDir = join(tempDir, '.claude', '.cache', 'embed-slots');
      mkdirSync(slotDir, { recursive: true });

      // Write a stale slot
      const staleContent = JSON.stringify({ pid: 99999999, startedAt: new Date().toISOString() });
      writeFileSync(join(slotDir, 'slot-0.lock'), staleContent);

      expect(countActiveSlots(tempDir)).toBe(0);
    });
  });
});
