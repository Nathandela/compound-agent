/**
 * Banner audio — generates a short melodic sequence as a WAV buffer
 * and plays it via the platform's built-in audio player.
 *
 * Zero external dependencies. Pure sine-wave synthesis.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// -- Audio constants --
const SAMPLE_RATE = 22050;
const BITS = 16;
const MAX_AMP = 0x6000; // ~75% of int16 range to avoid clipping

// -- Note frequencies (Hz) --
const NOTE: Record<string, number> = {
  C3: 131, E3: 165, G3: 196,
  C4: 262, D4: 294, E4: 330, G4: 392, A4: 440,
  C5: 523, E5: 659, G5: 784,
  C6: 1047,
};

// -- Envelope: smooth attack/release to avoid clicks --
function envelope(i: number, total: number, attack: number, release: number): number {
  if (i < attack) return i / attack;
  if (i > total - release) return (total - i) / release;
  return 1;
}

// -- Generate samples for a single tone --
function tone(freq: number, durationMs: number, amp = 1.0): number[] {
  const samples = Math.floor(SAMPLE_RATE * durationMs / 1000);
  const attack = Math.min(Math.floor(samples * 0.05), 200);
  const release = Math.min(Math.floor(samples * 0.15), 400);
  const out: number[] = [];
  for (let i = 0; i < samples; i++) {
    const env = envelope(i, samples, attack, release);
    out.push(Math.sin(2 * Math.PI * freq * i / SAMPLE_RATE) * env * amp);
  }
  return out;
}

// -- Mix multiple frequency arrays into one (for chords) --
function chord(freqs: number[], durationMs: number, amp = 1.0): number[] {
  const tones = freqs.map(f => tone(f, durationMs, 1.0));
  const len = tones[0]!.length;
  const out: number[] = [];
  const scale = amp / freqs.length;
  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (const t of tones) sum += t[i]!;
    out.push(sum * scale);
  }
  return out;
}

// -- Silence --
function silence(durationMs: number): number[] {
  return new Array(Math.floor(SAMPLE_RATE * durationMs / 1000)).fill(0);
}

// -- Compose the banner melody --
function composeMelody(): number[] {
  const samples: number[] = [];

  // Phase 1 — Seed pulse: low warm tones
  samples.push(...tone(NOTE.C3!, 250, 0.3));
  samples.push(...silence(150));
  samples.push(...tone(NOTE.C3!, 250, 0.35));
  samples.push(...silence(100));
  samples.push(...tone(NOTE.E3!, 200, 0.3));

  // Phase 2 — Growth: rising pentatonic arpeggio
  samples.push(...silence(80));
  samples.push(...tone(NOTE.C4!, 140, 0.45));
  samples.push(...silence(30));
  samples.push(...tone(NOTE.E4!, 140, 0.5));
  samples.push(...silence(30));
  samples.push(...tone(NOTE.G4!, 140, 0.5));
  samples.push(...silence(30));
  samples.push(...tone(NOTE.C5!, 160, 0.55));
  samples.push(...silence(30));
  samples.push(...tone(NOTE.E5!, 160, 0.55));
  samples.push(...silence(30));
  samples.push(...tone(NOTE.G5!, 180, 0.6));
  samples.push(...silence(60));
  // Second wave — faster
  samples.push(...tone(NOTE.C4!, 100, 0.4));
  samples.push(...tone(NOTE.E4!, 100, 0.45));
  samples.push(...tone(NOTE.G4!, 100, 0.45));
  samples.push(...tone(NOTE.C5!, 120, 0.5));
  samples.push(...tone(NOTE.E5!, 120, 0.55));
  samples.push(...tone(NOTE.G5!, 140, 0.6));

  // Phase 3 — Shimmer: sparkly high tones
  samples.push(...silence(60));
  samples.push(...tone(NOTE.C6!, 80, 0.3));
  samples.push(...silence(40));
  samples.push(...tone(NOTE.G5!, 80, 0.35));
  samples.push(...silence(40));
  samples.push(...tone(NOTE.C6!, 80, 0.3));
  samples.push(...silence(40));
  samples.push(...tone(NOTE.E5!, 100, 0.35));
  samples.push(...silence(60));

  // Phase 4 — Title: triumphant major chord
  samples.push(...chord([NOTE.C4!, NOTE.E4!, NOTE.G4!], 600, 0.7));
  samples.push(...chord([NOTE.C4!, NOTE.E4!, NOTE.G4!, NOTE.C5!], 500, 0.6));

  // Phase 5 — Hold: gentle fade
  samples.push(...chord([NOTE.C3!, NOTE.G3!, NOTE.C4!], 1200, 0.35));

  return samples;
}

// -- WAV file encoding --
function encodeWav(samples: number[]): Buffer {
  const dataSize = samples.length * (BITS / 8);
  const fileSize = 44 + dataSize;
  const buf = Buffer.alloc(fileSize);

  // RIFF header
  buf.write('RIFF', 0);
  buf.writeUInt32LE(fileSize - 8, 4);
  buf.write('WAVE', 8);

  // fmt chunk
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);           // chunk size
  buf.writeUInt16LE(1, 20);            // PCM format
  buf.writeUInt16LE(1, 22);            // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);  // sample rate
  buf.writeUInt32LE(SAMPLE_RATE * BITS / 8, 28); // byte rate
  buf.writeUInt16LE(BITS / 8, 32);     // block align
  buf.writeUInt16LE(BITS, 34);         // bits per sample

  // data chunk
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  // PCM samples
  let offset = 44;
  for (const s of samples) {
    const clamped = Math.max(-1, Math.min(1, s));
    buf.writeInt16LE(Math.round(clamped * MAX_AMP), offset);
    offset += 2;
  }

  return buf;
}

// -- Cross-platform playback --
function spawnPlayer(filePath: string): ChildProcess | null {
  try {
    switch (process.platform) {
      case 'darwin':
        return spawn('afplay', [filePath], { stdio: 'ignore', detached: true });
      case 'linux':
        return spawn('aplay', ['-q', filePath], { stdio: 'ignore', detached: true });
      case 'win32':
        return spawn('powershell', ['-c',
          `(New-Object Media.SoundPlayer '${filePath}').PlaySync()`
        ], { stdio: 'ignore', detached: true });
      default:
        return null;
    }
  } catch {
    return null; // audio player not found — silent skip
  }
}

/** Start playing the banner melody. Returns a stop handle, or null if audio unavailable. */
export function playBannerAudio(): { stop: () => void } | null {
  try {
    const wav = encodeWav(composeMelody());
    const tmpPath = join(tmpdir(), `ca-banner-${process.pid}.wav`);
    writeFileSync(tmpPath, wav);

    const proc = spawnPlayer(tmpPath);
    if (!proc) {
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
      return null;
    }

    // Unref so the player doesn't prevent Node from exiting
    proc.unref();

    const cleanup = () => {
      try { proc.kill(); } catch { /* already dead */ }
      try { unlinkSync(tmpPath); } catch { /* already cleaned */ }
    };

    proc.on('exit', () => {
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
    });

    return { stop: cleanup };
  } catch {
    return null; // any failure — silent skip
  }
}
