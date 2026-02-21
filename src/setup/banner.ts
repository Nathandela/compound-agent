/**
 * Install banner - Organic Tendril Growth animation.
 * Neural knowledge brain builds itself from a single seed.
 */

import { VERSION } from '../version.js';
import { playBannerAudio } from './banner-audio.js';

// -- Dimensions --
const W = 62;
const H = 22;

// -- ANSI escapes --
const CO = {
  VOID: '\x1B[0;90m',
  DUST: '\x1B[2;90m',
  OLD: '\x1B[0;34m',
  SETTLED: '\x1B[0;36m',
  WARM: '\x1B[0;35m',
  ACTIVE: '\x1B[1;36m',
  TIP: '\x1B[1;35m',
  SPARK: '\x1B[1;33m',
  FLASH: '\x1B[1;37m',
  TITLE: '\x1B[1;36m',
  DIM: '\x1B[0;90m',
  RESET: '\x1B[0m',
} as const;

// -- Brain topology (26 nodes, 44 edges) --
// Stored as flat arrays; accessor functions provide type-safe index access.
const _NX = [30, 22, 38, 15, 25, 35, 45, 11, 19, 28, 36, 43, 49, 13, 21, 30, 39, 47, 17, 25, 34, 43, 23, 30, 37, 30];
const _NY = [2, 3, 3, 5, 5, 5, 5, 7, 7, 7, 7, 7, 7, 10, 10, 10, 10, 10, 12, 12, 12, 12, 14, 14, 14, 16];
const _EA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 13, 14, 14, 15, 15, 16, 16, 17, 18, 19, 19, 20, 20, 21, 22, 23, 24];
const _EB = [1, 2, 4, 5, 3, 4, 5, 6, 7, 8, 8, 9, 9, 10, 10, 11, 12, 13, 13, 14, 14, 15, 15, 16, 16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22, 23, 23, 24, 24, 25, 25, 25];

const nx = (i: number): number => _NX[i]!;
const ny = (i: number): number => _NY[i]!;
const ea = (i: number): number => _EA[i]!;
const eb = (i: number): number => _EB[i]!;

const CENTER = 15;
const nc = _NX.length;
const ec = _EA.length;

// -- Tendril characters --
const H_CH = ['-', '~', '-', '.', '-'];
const V_CH = ['|', ':', '|', '.', '|'];
const D_CH = ['.', ':', '.', "'", '.'];

type Canvas = { ch: string[]; co: string[] };
interface Particle { x: number; y: number; born: number; life: number; dx: number; dy: number }

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

function tendrilChar(adx: number, ady: number, s: number): string {
  if (ady < 2) return H_CH[s % 5]!;
  if (adx < 2) return V_CH[s % 5]!;
  return D_CH[s % 5]!;
}

// -- Canvas --

function mkCanvas(): Canvas {
  return { ch: new Array<string>(W * H).fill(' '), co: new Array<string>(W * H).fill(CO.VOID) };
}

function put(cvs: Canvas, x: number, y: number, ch: string, co: string): void {
  if (x >= 0 && x < W && y >= 0 && y < H) { const i = y * W + x; cvs.ch[i] = ch; cvs.co[i] = co; }
}

function canvasAt(cvs: Canvas, x: number, y: number): string {
  return (x >= 0 && x < W && y >= 0 && y < H) ? cvs.ch[y * W + x]! : ' ';
}

function flush(cvs: Canvas): string {
  let buf = '\x1B[H\n\n';
  let prev = '';
  for (let y = 0; y < H; y++) {
    buf += '  ';
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const co = cvs.co[i]!;
      if (co !== prev) { buf += co; prev = co; }
      buf += cvs.ch[i]!;
    }
    buf += `${CO.RESET}\n`;
    prev = '';
  }
  return buf;
}

// -- Growth BFS from center --

function computeGrowth(): { order: number[]; parent: number[] } {
  const order = [CENTER];
  const parent = [-1];
  const vis = new Uint8Array(nc);
  vis[CENTER] = 1;
  const q = [CENTER];

  while (q.length > 0 && order.length < nc) {
    const qi = Math.floor(Math.random() * q.length);
    const cur = q[qi]!;
    const nb: number[] = [];
    for (let e = 0; e < ec; e++) {
      if (ea(e) === cur && !vis[eb(e)]) nb.push(eb(e));
      if (eb(e) === cur && !vis[ea(e)]) nb.push(ea(e));
    }
    if (nb.length > 0) {
      const nxt = nb[Math.floor(Math.random() * nb.length)]!;
      vis[nxt] = 1;
      order.push(nxt);
      parent.push(cur);
      q.push(nxt);
    } else {
      q.splice(qi, 1);
    }
  }
  return { order, parent };
}

// -- Drawing --

function drawTendril(cvs: Canvas, x1: number, y1: number, x2: number, y2: number, color: string): void {
  const dx = x2 - x1, dy = y2 - y1;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  const steps = Math.max(adx, ady, 1);
  for (let s = 1; s < steps; s++) {
    const px = x1 + Math.trunc(dx * s / steps), py = y1 + Math.trunc(dy * s / steps);
    const ex = canvasAt(cvs, px, py);
    if (ex !== ' ' && ex !== '.') continue;
    put(cvs, px, py, tendrilChar(adx, ady, s), color);
  }
}

function drawTendrilPartial(
  cvs: Canvas, x1: number, y1: number, x2: number, y2: number,
  color: string, progress: number,
): [number, number] {
  const dx = x2 - x1, dy = y2 - y1;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  const steps = Math.max(adx, ady, 1);
  const drawTo = Math.trunc(steps * progress / 100);
  for (let s = 1; s <= drawTo && s < steps; s++) {
    const px = x1 + Math.trunc(dx * s / steps), py = y1 + Math.trunc(dy * s / steps);
    const ex = canvasAt(cvs, px, py);
    if (ex !== ' ' && ex !== '.') continue;
    put(cvs, px, py, tendrilChar(adx, ady, s), color);
  }
  if (drawTo > 0 && drawTo <= steps) {
    return [x1 + Math.trunc(dx * drawTo / steps), y1 + Math.trunc(dy * drawTo / steps)];
  }
  return [x1, y1];
}

// -- Particles --

function spawnParticles(ps: Particle[], x: number, y: number, n: number, frame: number): void {
  for (let i = 0; i < n; i++) {
    ps.push({
      x, y, born: frame, life: Math.floor(Math.random() * 5) + 3,
      dx: Math.floor(Math.random() * 3) - 1, dy: Math.floor(Math.random() * 3) - 1,
    });
  }
}

function renderParticles(cvs: Canvas, ps: Particle[], frame: number): void {
  for (const p of ps) {
    const age = frame - p.born;
    if (age < 0 || age >= p.life) continue;
    p.x += p.dx; p.y += p.dy;
    let ch: string, co: string;
    if (age === 0) { ch = '*'; co = CO.SPARK; }
    else if (age === 1) { ch = '+'; co = CO.TIP; }
    else if (age < 4) { ch = '.'; co = CO.WARM; }
    else { ch = '.'; co = CO.VOID; }
    put(cvs, p.x, p.y, ch, co);
  }
}

// -- Background dust --

function renderBg(cvs: Canvas, frame: number): void {
  for (let y = 1; y < H - 1; y += 2) {
    for (let x = 2; x < W - 2; x += 4) {
      if ((x * 7 + y * 13 + frame) % 11 < 2) put(cvs, x, y, '.', CO.DUST);
    }
  }
}

// -- Node style during growth phase --

function growthNodeStyle(frame: number, i: number, born: number): [string, string] {
  const age = frame - born;
  if (age < 2) return ['*', CO.SPARK];
  if (age < 4) return ['@', CO.FLASH];
  if (age < 8) return ['@', CO.ACTIVE];
  const breath = (frame + i * 3) % 10;
  if (breath < 3 || breath >= 7) return ['o', CO.SETTLED];
  return ['O', CO.ACTIVE];
}

// -- Main animation --

// eslint-disable-next-line max-lines-per-function -- sequential 5-phase animation loop
export async function playInstallBanner(): Promise<void> {
  const { order, parent } = computeGrowth();
  const gc = order.length;
  const ps: Particle[] = [];
  const write = (s: string) => process.stdout.write(s);

  write('\x1B[?25l\x1B[2J\x1B[H');

  // Start background audio (silently skips if unavailable)
  const audio = playBannerAudio();

  // Use 'exit' event (not SIGINT) so cursor restore runs reliably even when
  // cli.ts's own SIGINT handler calls process.exit() before us.
  const restoreCursor = () => process.stdout.write('\x1B[?25h\x1B[0m');
  process.on('exit', restoreCursor);

  try {
    // Phase 1: Seed pulse (8 frames)
    const seedCh = ['.', 'o', 'O', '@'] as const;
    const seedCo = [CO.VOID, CO.WARM, CO.TIP, CO.FLASH] as const;
    for (let f = 0; f < 8; f++) {
      const cvs = mkCanvas();
      renderBg(cvs, f);
      put(cvs, nx(CENTER), ny(CENTER), seedCh[f % 4 as 0 | 1 | 2 | 3], seedCo[f % 4 as 0 | 1 | 2 | 3]);
      write(flush(cvs));
      write(`\n  ${CO.DIM}Seed detected...\x1B[K${CO.VOID}\n`);
      await sleep(60);
    }
    spawnParticles(ps, nx(CENTER), ny(CENTER), 5, 8);

    // Phase 2: Tendril growth
    const GSPEED = 4;
    const isGrown = new Uint8Array(nc);
    const grownAt = new Int32Array(nc).fill(999);
    isGrown[CENTER] = 1;
    grownAt[CENTER] = 0;
    const sched = order.map((_: number, g: number) => 8 + g * 2);
    const total = 8 + gc * 2 + GSPEED + 5;

    for (let f = 8; f < total; f++) {
      const cvs = mkCanvas();
      renderBg(cvs, f);

      for (let g = 0; g < gc; g++) {
        const node = order[g]!;
        if (f < sched[g]!) continue;
        isGrown[node] = 1;
        if (grownAt[node] === 999) { grownAt[node] = f; spawnParticles(ps, nx(node), ny(node), 4, f); }
      }

      for (let e = 0; e < ec; e++) {
        const a = ea(e), b = eb(e);
        if (!isGrown[a] || !isGrown[b]) continue;
        const minAge = Math.min(f - grownAt[a]!, f - grownAt[b]!);
        drawTendril(cvs, nx(a), ny(a), nx(b), ny(b), minAge > 12 ? CO.OLD : minAge > 6 ? CO.SETTLED : CO.WARM);
      }

      for (let g = 1; g < gc; g++) {
        const node = order[g]!, par = parent[g]!;
        if (f < sched[g]! || f >= sched[g]! + GSPEED) continue;
        const progress = Math.trunc((f - sched[g]!) * 100 / GSPEED);
        const [tipX, tipY] = drawTendrilPartial(cvs, nx(par), ny(par), nx(node), ny(node), CO.TIP, progress);
        if (tipX > 0 && tipY > 0) put(cvs, tipX, tipY, '*', CO.SPARK);
      }

      for (let i = 0; i < nc; i++) {
        if (!isGrown[i]) continue;
        const [ch, co] = growthNodeStyle(f, i, grownAt[i]!);
        put(cvs, nx(i), ny(i), ch, co);
      }

      renderParticles(cvs, ps, f);
      write(flush(cvs));
      let active = 0;
      for (let i = 0; i < nc; i++) if (isGrown[i]) active++;
      write(`\n  \x1B[0;35mNodes \x1B[1;36m${active}\x1B[0;35m/${nc}\x1B[0m  \x1B[0;90mGrowing neural tendrils...\x1B[K\x1B[0m\n`);
      await sleep(40);
    }

    // Phase 3: Shimmer wave (10 frames)
    for (let f = total; f < total + 10; f++) {
      const cvs = mkCanvas();
      renderBg(cvs, f);
      const wave = (f - total) * 3;

      for (let e = 0; e < ec; e++) {
        const a = ea(e), b = eb(e);
        const avgY = Math.trunc((ny(a) + ny(b)) / 2);
        const d = Math.abs(avgY - wave);
        drawTendril(cvs, nx(a), ny(a), nx(b), ny(b), d < 2 ? CO.FLASH : d < 4 ? CO.ACTIVE : d < 6 ? CO.SETTLED : CO.OLD);
      }

      for (let i = 0; i < nc; i++) {
        const d = Math.abs(ny(i) - wave);
        if (d < 2) put(cvs, nx(i), ny(i), '@', CO.FLASH);
        else if (d < 4) put(cvs, nx(i), ny(i), '@', CO.ACTIVE);
        else put(cvs, nx(i), ny(i), 'O', CO.SETTLED);
      }

      renderParticles(cvs, ps, f);
      write(flush(cvs));
      write(`\n  ${CO.SETTLED}Crystallizing pathways...\x1B[K${CO.VOID}\n`);
      await sleep(60);
    }

    // Phase 4: Title reveal (15 frames)
    const TITLE = 'COMPOUND';
    const SUBTITLE = 'AGENT';
    const TX = Math.trunc((W - TITLE.length) / 2);
    const TY = 9;
    const SX = Math.trunc((W - SUBTITLE.length) / 2);
    const SY = 11;
    const TAGLINE = 'Break once. Learn forever.';
    const LX = Math.trunc((W - TAGLINE.length) / 2);
    const LY = 19;

    for (let f = 0; f < 15; f++) {
      const cvs = mkCanvas();
      renderBg(cvs, f);

      for (let e = 0; e < ec; e++) {
        drawTendril(cvs, nx(ea(e)), ny(ea(e)), nx(eb(e)), ny(eb(e)), CO.OLD);
      }
      for (let i = 0; i < nc; i++) {
        const breath = (f + i * 3) % 8;
        if (breath < 2) put(cvs, nx(i), ny(i), 'o', CO.SETTLED);
        else if (breath < 6) put(cvs, nx(i), ny(i), 'O', CO.ACTIVE);
        else put(cvs, nx(i), ny(i), 'o', CO.SETTLED);
      }

      let shown = Math.trunc((f + 1) * TITLE.length / 8);
      if (shown > TITLE.length) shown = TITLE.length;
      for (let c = 0; c < shown; c++) {
        put(cvs, TX + c, TY, TITLE.charAt(c), c === shown - 1 && f < 8 ? CO.FLASH : CO.TITLE);
      }

      if (f > 5) {
        let sub = Math.trunc((f - 5) * SUBTITLE.length / 6);
        if (sub > SUBTITLE.length) sub = SUBTITLE.length;
        for (let c = 0; c < sub; c++) {
          put(cvs, SX + c, SY, SUBTITLE.charAt(c), c === sub - 1 && f < 12 ? CO.FLASH : CO.TITLE);
        }
      }

      if (f > 10) {
        let tag = Math.trunc((f - 10) * TAGLINE.length / 4);
        if (tag > TAGLINE.length) tag = TAGLINE.length;
        for (let c = 0; c < tag; c++) put(cvs, LX + c, LY, TAGLINE.charAt(c), CO.DIM);
      }

      write(flush(cvs));
      write('\n');
      await sleep(70);
    }

    // Phase 5: Breathing hold (12 frames)
    const ver = `v${VERSION}`;
    const vx = SX + SUBTITLE.length + 2;

    for (let f = 0; f < 12; f++) {
      const cvs = mkCanvas();
      for (let y = 1; y < H - 1; y += 3) {
        for (let x = 2; x < W - 2; x += 5) {
          if ((x + y + f) % 9 < 2) put(cvs, x, y, '.', CO.DUST);
        }
      }

      const bp = f % 6;
      const cco = bp < 4 && bp >= 2 ? CO.SETTLED : CO.OLD;
      for (let e = 0; e < ec; e++) {
        drawTendril(cvs, nx(ea(e)), ny(ea(e)), nx(eb(e)), ny(eb(e)), cco);
      }

      for (let i = 0; i < nc; i++) {
        const b = (f + i * 2) % 8;
        if (b < 2) put(cvs, nx(i), ny(i), 'o', CO.SETTLED);
        else if (b < 4) put(cvs, nx(i), ny(i), 'O', CO.ACTIVE);
        else if (b < 6) put(cvs, nx(i), ny(i), '@', CO.ACTIVE);
        else put(cvs, nx(i), ny(i), 'O', CO.SETTLED);
      }

      for (let c = 0; c < TITLE.length; c++) put(cvs, TX + c, TY, TITLE.charAt(c), CO.TITLE);
      for (let c = 0; c < SUBTITLE.length; c++) put(cvs, SX + c, SY, SUBTITLE.charAt(c), CO.TITLE);
      for (let c = 0; c < TAGLINE.length; c++) put(cvs, LX + c, LY, TAGLINE.charAt(c), CO.DIM);
      for (let c = 0; c < ver.length; c++) put(cvs, vx + c, SY, ver.charAt(c), CO.DIM);

      write(flush(cvs));
      write('\n');
      await sleep(120);
    }
  } finally {
    audio?.stop();
    process.removeListener('exit', restoreCursor);
    restoreCursor();
    write('\n');
  }
}
