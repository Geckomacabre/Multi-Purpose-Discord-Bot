import { createCanvas, GlobalFonts, SKRSContext2D, Canvas } from '@napi-rs/canvas';
import { spawn } from 'node:child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.resolve(__dirname, '../../assets/fonts');

let fontsReady = false;
/** Registers the fonts the casino renderers draw with (idempotent). */
export function ensureFonts() {
  if (fontsReady) return;
  const reg = (file: string, family: string) => {
    try { GlobalFonts.registerFromPath(path.join(FONTS_DIR, file), family); } catch { /* fall back */ }
  };
  reg('mplus.ttf', 'Casino');
  reg('bold.ttf', 'CasinoB');
  // Futura Extra Black Condensed — signage, marquees, painted felt lettering.
  reg('caption.otf', 'Sign');
  reg('twemoji.otf', 'Twe');
  fontsReady = true;
}

/** Font stacks. DejaVu Serif ships with the Debian base image. */
export const FONT = {
  sign: 'Sign, CasinoB, sans-serif',
  serif: '"DejaVu Serif", serif',
  body: 'CasinoB, sans-serif',
  mono: '"DejaVu Sans Mono", monospace',
};

/** Physical materials shared by every game so the set reads as one casino. */
export const PALETTE = {
  feltLight: '#2f7d4f',
  feltDark: '#0d3a22',
  gold: '#e8c66a',
  goldDeep: '#a07a2c',
  goldLight: '#fff1c4',
  cream: '#f6f1e4',
  ink: '#1a1a1a',
  red: '#b3202a',
  black: '#17181b',
  win: '#7bd88f',
  lose: '#e0525c',
  text: '#f3ead2',
  dim: '#8a9a8f',
};

export function roundedRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ── Textures ──────────────────────────────────────────────────────────────────
// Built once per size and blitted every frame: per-pixel noise is far too slow
// to regenerate per GIF frame, and a static texture also compresses well
// because ffmpeg only re-encodes the pixels that change between frames.

const textureCache = new Map<string, Canvas>();

/** Deterministic PRNG so textures (and therefore GIF palettes) are stable. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fine woven-baize grain: light/dark specks at low alpha. */
function grain(w: number, h: number, strength: number, seed: number): Canvas {
  const key = `grain:${w}x${h}:${strength}:${seed}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const rnd = mulberry32(seed);
  for (let i = 0; i < w * h; i++) {
    const v = rnd();
    // Faint diagonal weave so it reads as cloth rather than TV static.
    const x = i % w, y = (i / w) | 0;
    const weave = ((x + y) % 4 === 0 ? 0.35 : 0) + ((x - y + 4096) % 4 === 0 ? 0.25 : 0);
    const light = v > 0.5;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = light ? 255 : 0;
    img.data[i * 4 + 3] = Math.round((Math.abs(v - 0.5) * 2 * 0.6 + weave * 0.4) * strength * 255);
  }
  ctx.putImageData(img, 0, 0);
  textureCache.set(key, c);
  return c;
}

/** Baize table felt with a spotlight falloff and vignette. */
export function drawFelt(
  ctx: SKRSContext2D, w: number, h: number,
  light: string = PALETTE.feltLight, dark: string = PALETTE.feltDark,
) {
  const key = `felt:${w}x${h}:${light}:${dark}`;
  let felt = textureCache.get(key);
  if (!felt) {
    felt = createCanvas(w, h);
    const f = felt.getContext('2d');
    const g = f.createRadialGradient(w / 2, h * 0.38, Math.min(w, h) * 0.08, w / 2, h * 0.5, Math.max(w, h) * 0.75);
    g.addColorStop(0, light);
    g.addColorStop(1, dark);
    f.fillStyle = g;
    f.fillRect(0, 0, w, h);
    f.drawImage(grain(w, h, 0.11, 7), 0, 0);
    drawVignette(f, w, h, 0.55);
    textureCache.set(key, felt);
  }
  ctx.drawImage(felt, 0, 0);
}

export function drawVignette(ctx: SKRSContext2D, w: number, h: number, strength = 0.5) {
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

/** Kept for older callers: plain felt background. */
export function drawBackground(ctx: SKRSContext2D, w: number, h: number) {
  drawFelt(ctx, w, h);
}

// ── Metals ────────────────────────────────────────────────────────────────────

/** Brushed brass/gold gradient across a box (for frames, plates, rims). */
export function brass(ctx: SKRSContext2D, x0: number, y0: number, x1: number, y1: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#7a5a1c');
  g.addColorStop(0.18, '#e9cf7f');
  g.addColorStop(0.35, '#b98d35');
  g.addColorStop(0.55, '#fbe9a8');
  g.addColorStop(0.75, '#a77d2e');
  g.addColorStop(1, '#6b4e17');
  return g;
}

/** Polished chrome gradient. */
export function chrome(ctx: SKRSContext2D, x0: number, y0: number, x1: number, y1: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#5d6268');
  g.addColorStop(0.2, '#eef1f4');
  g.addColorStop(0.42, '#9aa0a7');
  g.addColorStop(0.6, '#ffffff');
  g.addColorStop(0.8, '#80868d');
  g.addColorStop(1, '#3f4348');
  return g;
}

/** Engraved brass plate with centred text — used for labels like YOU / HOUSE. */
export function drawPlate(
  ctx: SKRSContext2D, cx: number, cy: number, w: number, h: number, label: string, size = 18,
) {
  const x = cx - w / 2, y = cy - h / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  roundedRect(ctx, x, y, w, h, 4);
  ctx.fillStyle = brass(ctx, x, y, x + w, y + h);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(60,40,8,0.7)';
  roundedRect(ctx, x + 2.5, y + 2.5, w - 5, h - 5, 3);
  ctx.stroke();
  engrave(ctx, label, cx, cy + 1, `${size}px ${FONT.sign}`, '#3d2a07');
}

/** Text that looks stamped into metal: dark fill with a light lower edge. */
export function engrave(ctx: SKRSContext2D, text: string, x: number, y: number, font: string, color: string) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,248,220,0.55)';
  ctx.fillText(text, x, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * Gold-leaf lettering as if printed on the felt — a soft drop shadow and a
 * vertical metallic gradient, with letter spacing like casino table prints.
 */
export function goldText(
  ctx: SKRSContext2D, text: string, x: number, y: number, size: number,
  opts: { align?: CanvasTextAlign; spacing?: number; font?: string } = {},
) {
  ctx.save();
  ctx.font = `${size}px ${opts.font ?? FONT.sign}`;
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = 'middle';
  if (opts.spacing) ctx.letterSpacing = `${opts.spacing}px`;
  const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  g.addColorStop(0, '#fff3c9');
  g.addColorStop(0.45, '#e8c66a');
  g.addColorStop(0.55, '#b88a32');
  g.addColorStop(1, '#f0d488');
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = g;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Letters laid along an arc (centre cx,cy, radius r), like a table print. */
export function arcText(
  ctx: SKRSContext2D, text: string, cx: number, cy: number, r: number,
  size: number, color: string, opts: { spread?: number; flip?: boolean; font?: string } = {},
) {
  ctx.save();
  ctx.font = `${size}px ${opts.font ?? FONT.sign}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  const widths = [...text].map(ch => ctx.measureText(ch).width + size * 0.12);
  const total = widths.reduce((a, b) => a + b, 0);
  // Angle per pixel along the arc; `flip` runs the text along the bottom.
  const dir = opts.flip ? -1 : 1;
  let a = -Math.PI / 2 - dir * (total / r) / 2;
  if (opts.flip) a = Math.PI / 2 + (total / r) / 2;
  [...text].forEach((ch, i) => {
    const half = widths[i]! / 2 / r;
    a += dir * half;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.rotate(a + (opts.flip ? -Math.PI / 2 : Math.PI / 2));
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    a += dir * half;
  });
  ctx.restore();
}

/** Strips leading emoji/symbols callers put on titles ('🃏 BLACKJACK' → 'BLACKJACK'). */
export function plainTitle(title: string): string {
  return title.replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

// ── GIF encoding ──────────────────────────────────────────────────────────────

export interface GifOptions {
  fps?: number;
  /** false (default) plays once and holds the last frame; true loops forever. */
  loop?: boolean;
  colors?: number;
  /** Set when frames are raw RGBA from `grabFrame` rather than PNG buffers. */
  width?: number;
  height?: number;
}

/**
 * Raw RGBA copy of the canvas. Much cheaper than PNG-encoding every frame
 * (PNG was ~2/3 of total render time), and ffmpeg reads it directly.
 */
export function grabFrame(canvas: Canvas): Buffer {
  // Copy out of native memory: piping the canvas-owned buffer straight to
  // ffmpeg's stdin fails with EFAULT once the write goes async.
  return Buffer.from(canvas.data());
}

/**
 * Pipes frames through ffmpeg (already in the image) into a palette-
 * optimised GIF. Shared by every casino game renderer. Ordered (bayer)
 * dithering keeps static areas identical between frames, so ffmpeg's
 * rectangle diffing only stores what actually moves.
 */
export function encodeGif(frames: Buffer[], opts: GifOptions = {}): Promise<Buffer> {
  const { fps = 25, loop = false, colors = 128, width, height } = opts;
  const input = width && height
    ? ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`]
    : ['-f', 'image2pipe', '-vcodec', 'png'];
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-y', ...input, '-r', String(fps), '-i', 'pipe:0',
      '-filter_complex',
      `[0:v] split [a][b];[a] palettegen=max_colors=${colors}:stats_mode=full [p];[b][p] paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
      '-loop', loop ? '0' : '-1', '-f', 'gif', 'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    const out: Buffer[] = [];
    let err = '';
    ff.stdout.on('data', (c) => out.push(c));
    ff.stderr.on('data', (c) => { err += c.toString(); });
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code === 0 && out.length) resolve(Buffer.concat(out));
      else reject(new Error(`ffmpeg exited ${code}: ${err.slice(-300)}`));
    });

    for (const f of frames) ff.stdin.write(f);
    ff.stdin.end();
  });
}
