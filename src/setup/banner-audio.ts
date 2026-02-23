/**
 * Banner audio — "Entering the Cloud"
 *
 * Vaporwave-aesthetic startup sound. Two attacks, four pitch classes,
 * one transformation: suspension to illumination.
 *
 * Audio climax at T=2.9s leads visual shimmer wave at T=3.2s by 300ms.
 *
 * Zero external dependencies. PolyBLEP anti-aliased synthesis.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── Constants ──
const SR = 44100;
const MAX_AMP = 0x7000;

// ── Pitch classes (Hz) ──
const E2 = 82.41;
const B2 = 123.47;
const E3 = 164.81;
const B3 = 246.94;
const E4 = 329.63;
const Fs4 = 369.99;
const Gs4 = 415.30;
const B4 = 493.88;

// ── PolyBLEP anti-aliased sawtooth ──

function polyBlep(phase: number, dt: number): number {
  if (phase < dt) { const t = phase / dt; return t + t - t * t - 1; }
  if (phase > 1 - dt) { const t = (phase - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

function sawBL(freq: number, t: number, offset = 0): number {
  const dt = freq / SR;
  const phase = ((freq * t + offset) % 1 + 1) % 1;
  return (2 * phase - 1) - polyBlep(phase, dt);
}

function wideSaw(freq: number, t: number, cents = 10): number {
  const r = Math.pow(2, cents / 1200);
  return (sawBL(freq, t, 0) + sawBL(freq * r, t, 0.33) + sawBL(freq / r, t, 0.66)) / 3;
}

// ── Biquad low-pass filter ──

class BiquadLPF {
  private x1 = 0; private x2 = 0;
  private y1 = 0; private y2 = 0;
  private b0 = 0; private b1 = 0; private b2 = 0;
  private a1 = 0; private a2 = 0;
  private lastCut = -1;
  constructor(private Q = 0.707) {}
  process(x: number, cutoff: number): number {
    if (cutoff !== this.lastCut) {
      this.lastCut = cutoff;
      const w0 = 2 * Math.PI * Math.min(cutoff, SR * 0.45) / SR;
      const sin0 = Math.sin(w0), cos0 = Math.cos(w0);
      const alpha = sin0 / (2 * this.Q);
      const a0 = 1 + alpha;
      this.b0 = ((1 - cos0) / 2) / a0;
      this.b1 = (1 - cos0) / a0;
      this.b2 = this.b0;
      this.a1 = (-2 * cos0) / a0;
      this.a2 = (1 - alpha) / a0;
    }
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2
            - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

// ── Effects ──

function applyDelay(samples: number[], ms: number, fb: number, wet: number, lpHz = 3000): number[] {
  const len = Math.floor(SR * ms / 1000);
  const buf = new Float64Array(len);
  const lpf = new BiquadLPF();
  const out: number[] = [];
  let i = 0;
  for (const s of samples) {
    const d = buf[i]!;
    buf[i] = s + lpf.process(d, lpHz) * fb;
    i = (i + 1) % len;
    out.push(s + d * wet);
  }
  return out;
}

function applyReverb(samples: number[], decayMs: number, wet: number): number[] {
  const combDs = [1116, 1188, 1277, 1356, 1422, 1491];
  const apDs = [225, 341, 556];

  function comb(input: number[], delay: number, decay: number): number[] {
    const fb = Math.pow(0.001, delay / (decay * SR / 1000));
    const buf = new Float64Array(delay);
    const damp = new BiquadLPF(0.5);
    const out: number[] = [];
    let i = 0;
    for (const s of input) {
      const d = buf[i]!;
      buf[i] = s + damp.process(d, 4500) * fb;
      i = (i + 1) % delay;
      out.push(d);
    }
    return out;
  }

  function allpass(input: number[], delay: number, c = 0.5): number[] {
    const buf = new Float64Array(delay);
    const out: number[] = [];
    let i = 0;
    for (const s of input) {
      const d = buf[i]!;
      const v = s + d * c;
      buf[i] = v;
      i = (i + 1) % delay;
      out.push(d - v * c);
    }
    return out;
  }

  const pre = Math.floor(SR * 0.04);
  const delayed: number[] = new Array(pre).fill(0);
  for (const s of samples) delayed.push(s);

  const combs = combDs.map(d => comb(delayed, d, decayMs));
  const sum: number[] = new Array(delayed.length).fill(0);
  for (const c of combs)
    for (let i = 0; i < sum.length; i++) sum[i]! += (c[i] ?? 0) / combDs.length;

  let ap = sum;
  for (const d of apDs) ap = allpass(ap, d);

  let hpY = 0;
  const hpAlpha = (1 / SR) / (1 / (2 * Math.PI * 120) + 1 / SR);
  const clean: number[] = [];
  for (const s of ap) { hpY += hpAlpha * (s - hpY); clean.push(s - hpY); }

  const outLen = Math.max(samples.length, clean.length);
  const out: number[] = [];
  for (let i = 0; i < outLen; i++) {
    const dry = i < samples.length ? samples[i]! : 0;
    const w = i < clean.length ? clean[i]! : 0;
    out.push(dry * (1 - wet * 0.3) + w * wet);
  }
  return out;
}

// ── Helpers ──

function expCurve(x: number, pow = 2): number {
  return Math.pow(Math.max(0, Math.min(1, x)), pow);
}

function saturate(x: number): number {
  return Math.tanh(x * 1.15) / Math.tanh(1.15);
}

// ── Composition ──
//
//  T=0.0   ROOT     E2 strike. The seed.
//  T=1.0   CLOUD    E-B pad fades in. Open 5th. Ambiguous.
//  T=2.3            F#4 whispers in. Foreshadowing.
//  T=2.7   BUILD    Crescendo + filter sweep accelerates.
//  T=2.9   BLOOM    E major arrives. G#4 resolves everything.
//  T=3.2            [Visual: shimmer wave — brain fully lit]
//  T=3.5-6.0        Long sustain, slow decay.
//  T=6.0-7.5        Reverb dissolution.

// ── Voice: root strike (T=0) — E2 + hint of B2 ──
function voiceRoot(i: number, t: number, f: BiquadLPF): number {
  const atk = i < SR * 0.008 ? i / (SR * 0.008) : 1;
  const dec = Math.exp(-t * 2.5);
  const amp = atk * dec * 0.35;
  if (amp < 0.001) return 0;
  const s = wideSaw(E2, t, 6) * 0.7 + Math.sin(2 * Math.PI * B2 * t) * 0.3;
  return f.process(s, 800 + dec * 1200) * amp;
}

// ── Voice: suspended pad (T=1.0) — E3-B3 open 5th ──
function voicePad(t: number, fE: BiquadLPF, fB: BiquadLPF): number {
  if (t < 1.0) return 0;
  const padT = t - 1.0;
  const fadeIn = expCurve(Math.min(1, padT / 1.8));
  const fadeOut = t < 4.0 ? 1 : expCurve(1 - (t - 4.0) / 3.5, 1.5);
  const amp = fadeIn * fadeOut * 0.20;
  if (amp < 0.001) return 0;

  let cutoff: number;
  if (t < 2.7) cutoff = 350 + (padT / 1.7) * 850;
  else if (t < 3.1) cutoff = 1200 + expCurve((t - 2.7) / 0.4) * 2800;
  else cutoff = 4000 - expCurve((t - 3.1) / 4.0, 1.3) * 3200;
  cutoff *= 1 + 0.04 * Math.sin(2 * Math.PI * 0.11 * t);

  const dE = 1 + 0.0008 * Math.sin(2 * Math.PI * 0.09 * t);
  const dB = 1 + 0.0007 * Math.sin(2 * Math.PI * 0.12 * t + 0.5);
  const e3 = fE.process(wideSaw(E3 * dE, t, 12), cutoff);
  const b3 = fB.process(wideSaw(B3 * dB, t, 12), cutoff);
  return (e3 * 0.55 + b3 * 0.45) * amp;
}

// ── Voice: F#4 whisper (T=2.3) — foreshadowing 9th ──
function voiceForeshadow(t: number, f: BiquadLPF): number {
  if (t < 2.3 || t >= 3.5) return 0;
  const fT = t - 2.3;
  const fadeIn = expCurve(Math.min(1, fT / 0.7));
  const fadeOut = fT > 0.7 ? expCurve((1.2 - fT) / 0.5) : 1;
  const amp = fadeIn * fadeOut * 0.07;
  if (amp < 0.001) return 0;
  return f.process(Math.sin(2 * Math.PI * Fs4 * t), 3000) * amp;
}

// ── Voice: bloom chord (T=2.9) — E major, G#4 resolves ──
function voiceBloom(t: number, fE: BiquadLPF, fG: BiquadLPF, fB: BiquadLPF): number {
  if (t < 2.9) return 0;
  const bT = t - 2.9;
  const atk = Math.min(1, bT / 0.08);
  const sus = bT < 1.5 ? 1 : Math.exp(-(bT - 1.5) * 0.8);
  const amp = atk * sus;
  if (amp < 0.002) return 0;

  const bloomF = bT < 0.3
    ? 1500 + expCurve(bT / 0.3) * 3500
    : 5000 - expCurve(Math.min(1, (bT - 0.3) / 4.0), 1.2) * 3500;

  const dE4 = 1 + 0.0005 * Math.sin(2 * Math.PI * 0.08 * t);
  const e4 = fE.process(wideSaw(E4 * dE4, t, 8), bloomF);

  let gs4 = 0;
  if (bT > 0.03) {
    const gsA = Math.min(1, (bT - 0.03) / 0.1);
    const gsD = 1 + 0.0006 * Math.sin(2 * Math.PI * 0.1 * t + 1.0);
    gs4 = fG.process(wideSaw(Gs4 * gsD, t, 9), bloomF) * gsA;
  }

  let b4 = 0;
  if (bT > 0.05 && bT < 3.0) {
    const bA = Math.min(1, (bT - 0.05) / 0.15)
             * (bT > 2.0 ? expCurve(1 - (bT - 2.0)) : 1);
    b4 = fB.process(
      Math.sin(2 * Math.PI * B4 * t) * 0.5 + wideSaw(B4, t, 6) * 0.5,
      bloomF,
    ) * bA;
  }

  return (e4 * 0.35 + gs4 * 0.35 + b4 * 0.15) * amp * 0.28;
}

// ── Voice: sub drone (E2 sine, felt not heard) ──
function voiceSub(t: number): number {
  const subIn = expCurve(Math.min(1, t / 2.0));
  const subOut = t < 4.5 ? 1 : expCurve(1 - (t - 4.5) / 2.5, 1.5);
  return Math.sin(2 * Math.PI * E2 * t) * subIn * subOut * 0.08;
}

// ── Compose: mix all voices + master effects ──
function compose(): number[] {
  const TOTAL = Math.floor(SR * 7.5);
  const out = new Float64Array(TOTAL);
  const f: BiquadLPF[] = [];
  for (let i = 0; i < 7; i++) f.push(new BiquadLPF(0.6));

  for (let i = 0; i < TOTAL; i++) {
    const t = i / SR;
    out[i] = saturate(
      voiceRoot(i, t, f[0]!) + voicePad(t, f[1]!, f[2]!)
      + voiceForeshadow(t, f[3]!) + voiceBloom(t, f[4]!, f[5]!, f[6]!)
      + voiceSub(t),
    );
  }

  let result = Array.from(out);
  result = applyDelay(result, 520, 0.22, 0.18, 2800);
  result = applyReverb(result, 4800, 0.40);
  return result;
}

// ── WAV encoding ──

function encodeWav(raw: number[]): Buffer {
  let peak = 0;
  for (const s of raw) { const a = Math.abs(s); if (a > peak) peak = a; }
  const scale = peak > 0 ? 0.92 / peak : 1;

  const dataSize = raw.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataSize, 40);
  let off = 44;
  for (const s of raw) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * scale)) * MAX_AMP), off);
    off += 2;
  }
  return buf;
}

// ── Cross-platform playback ──

function spawnPlayer(filePath: string): ChildProcess | null {
  try {
    switch (process.platform) {
      case 'darwin':
        return spawn('afplay', [filePath], { stdio: 'ignore', detached: true });
      case 'linux':
        return spawn('aplay', ['-q', filePath], { stdio: 'ignore', detached: true });
      case 'win32':
        return spawn('powershell', ['-c',
          `(New-Object Media.SoundPlayer "${filePath.replace(/"/g, '`"')}").PlaySync()`
        ], { stdio: 'ignore', detached: true });
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Start playing the banner audio. Returns a stop handle, or null if unavailable. */
export function playBannerAudio(): { stop: () => void } | null {
  try {
    const wav = encodeWav(compose());
    const tmpPath = join(tmpdir(), `ca-banner-${process.pid}.wav`);
    writeFileSync(tmpPath, wav);

    const proc = spawnPlayer(tmpPath);
    if (!proc) {
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
      return null;
    }

    proc.unref();

    const cleanup = () => {
      try { proc.kill(); } catch { /* already dead */ }
      try { unlinkSync(tmpPath); } catch { /* already cleaned */ }
    };

    proc.on('error', () => {
      // Audio player not found (e.g. aplay missing on headless Linux).
      // Silently clean up — audio is non-essential.
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
    });

    proc.on('exit', () => {
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
    });

    return { stop: cleanup };
  } catch {
    return null;
  }
}
