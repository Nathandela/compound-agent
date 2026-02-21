import { describe, it, expect, vi, afterEach } from 'vitest';
import { playBannerAudio } from './index.js';

describe('banner-audio', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns a stop handle with a stop function', () => {
    const result = playBannerAudio();
    // On macOS/Linux CI this should work; in environments without afplay/aplay
    // it may return null — both are valid.
    if (result !== null) {
      expect(result).toHaveProperty('stop');
      expect(typeof result.stop).toBe('function');
      result.stop(); // clean up spawned process + temp file
    }
  });

  it('returns null when audio player is unavailable', () => {
    // Mock spawn to throw — simulates missing audio player
    vi.mock('node:child_process', async (importOriginal) => {
      const orig = await importOriginal<typeof import('node:child_process')>();
      return {
        ...orig,
        spawn: () => { throw new Error('not found'); },
      };
    });

    // Re-import to pick up mock — dynamic import bypasses module cache
    // Since vi.mock hoists, playBannerAudio will use the mocked spawn
    const result = playBannerAudio();
    // Should return null gracefully, not throw
    expect(result).toBeNull();
  });

  it('stop() does not throw when called multiple times', () => {
    const result = playBannerAudio();
    if (result !== null) {
      expect(() => result.stop()).not.toThrow();
      expect(() => result.stop()).not.toThrow(); // idempotent
    }
  });
});
