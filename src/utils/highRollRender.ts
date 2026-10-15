import { createCanvas, SKRSContext2D, Canvas } from '@napi-rs/canvas';
import {
  ensureFonts, drawFelt, roundedRect, encodeGif, grabFrame, brass, drawPlate, goldText, FONT, PALETTE,
} from './casinoRender.js';
import { drawDrum, drumShading, streaked } from './casinoReel.js';

const W = 560;
const H = 300;

// Each side is a three-drum mechanical counter (000–100), like an odometer.
const DRUMS = 3;
const DRUM_W = 50;
const DRUM_GAP = 4;
const DRUM_H = 104;
const DRUM_R = 70;
const CELL_ANGLE = 0.95;
const COUNTER_W = DRUMS * DRUM_W + (DRUMS - 1) * DRUM_GAP;
const COUNTER_Y = 92;
const SIDE_X = [W * 0.27, W * 0.73];          // centre x of each counter
const DIGIT = 64;                               // digit sprite height

const FPS = 25;
// Drums stop hundreds → tens → units; the house finishes last for suspense.
const STOP_AT = [[14, 19, 24], [21, 27, 34]];
const SPIN_FRAMES = 34;
const HOLD_FRAMES = 24;
const SETTLE = [0.14, 0.05, 0];

const digitCache = new Map<number, Canvas>();

/** Black condensed numeral on a transparent cell, like a printed counter wheel. */
function digitSprite(d: number): Canvas {
  const hit = digitCache.get(d);
  if (hit) return hit;
  const c = createCanvas(DRUM_W, DIGIT);
  const ctx = c.getContext('2d');
  ctx.font = `56px ${FONT.sign}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#16120c';
  ctx.fillText(String(d), DRUM_W / 2 + 2, DIGIT / 2 + 3);
  digitCache.set(d, c);
  return c;
}

let base: Canvas | null = null;

/** Felt, title print, both counter housings and their name plates. */
function buildBase(): Canvas {
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  drawFelt(ctx, W, H);
  goldText(ctx, 'HIGH ROLL', W / 2, 40, 36, { spacing: 6 });

  for (const [s, cx] of SIDE_X.entries()) {
    const x = cx - COUNTER_W / 2;
    const bx = x - 14, by = COUNTER_Y - 12, bw = COUNTER_W + 28, bh = DRUM_H + 24;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    roundedRect(ctx, bx, by, bw, bh, 10);
    ctx.fillStyle = brass(ctx, bx, by, bx + bw, by + bh);
    ctx.fill();
    ctx.restore();
    roundedRect(ctx, bx + 6, by + 6, bw - 12, bh - 12, 6);
    ctx.fillStyle = '#0c0a08';
    ctx.fill();
    for (let d = 0; d < DRUMS; d++) {
      ctx.fillStyle = '#efe7d2';
      ctx.fillRect(x + d * (DRUM_W + DRUM_GAP), COUNTER_Y, DRUM_W, DRUM_H);
    }
    drawPlate(ctx, cx, COUNTER_Y + DRUM_H + 38, 120, 30, s === 0 ? 'YOU' : 'HOUSE', 19);
  }
  goldText(ctx, 'VS', W / 2, COUNTER_Y + DRUM_H / 2, 30, { spacing: 2 });
  return c;
}

function drumPos(stop: number, f: number, final: number): number {
  const arrive = stop - SETTLE.length;
  if (f >= stop) return final;
  if (f >= arrive) return final + SETTLE[f - arrive]!;
  const u = f / arrive;
  return final * (1 - Math.pow(1 - u, 2));
}

/** Small indicator lamp above a counter: lit green/gold for the winner. */
function lamp(ctx: SKRSContext2D, x: number, y: number, color: string | null) {
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  if (color) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    const g = ctx.createRadialGradient(x - 2, y - 2, 0.5, x, y, 7);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  } else {
    ctx.fillStyle = '#3a2d1a';
    ctx.fill();
  }
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#a07a2c';
  ctx.stroke();
}

function renderFrames(player: number, house: number): Buffer[] {
  base ??= buildBase();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const frames: Buffer[] = [];
  const win = player > house, tie = player === house;

  const digits = (v: number) => [Math.floor(v / 100) % 10, Math.floor(v / 10) % 10, v % 10];
  const finals = [player, house].map((v, s) =>
    digits(v).map((d, i) => d + 10 * (3 + i + s)));

  for (let f = 0; f < SPIN_FRAMES + HOLD_FRAMES; f++) {
    ctx.drawImage(base, 0, 0);
    for (const [s, cx] of SIDE_X.entries()) {
      const x0 = cx - COUNTER_W / 2;
      for (let d = 0; d < DRUMS; d++) {
        const final = finals[s]![d]!;
        const stop = STOP_AT[s]![d]!;
        const pos = drumPos(stop, f, final);
        const prev = f === 0 ? pos : drumPos(stop, f - 1, final);
        const x = x0 + d * (DRUM_W + DRUM_GAP);
        drawDrum(ctx, {
          x, y: COUNTER_Y, w: DRUM_W, h: DRUM_H, radius: DRUM_R, cellAngle: CELL_ANGLE,
          pos, velocity: pos - prev,
          sprite: (j, blur) => {
            const n = ((j % 10) + 10) % 10;
            return streaked(digitSprite(n), blur, `digit:${n}`);
          },
        });
        drumShading(ctx, x, COUNTER_Y, DRUM_W, DRUM_H, 0.85);
      }
      // Reading line across the counter window
      ctx.fillStyle = 'rgba(179,32,42,0.55)';
      ctx.fillRect(x0 - 4, COUNTER_Y + DRUM_H / 2 - 1, COUNTER_W + 8, 2);
    }

    const done = f >= SPIN_FRAMES;
    const lampColor = (s: number) => {
      if (!done) return null;
      if (tie) return PALETTE.gold;
      return (s === 0) === win ? '#7bd88f' : null;
    };
    SIDE_X.forEach((cx, s) => lamp(ctx, cx, COUNTER_Y - 26, lampColor(s)));

    if (done) {
      const text = tie ? 'PUSH' : win ? 'YOU WIN' : 'HOUSE WINS';
      goldText(ctx, text, W / 2, H - 22, 28, { spacing: 3 });
    }
    frames.push(grabFrame(canvas));
  }
  return frames;
}

/** How long the counters spin before locking on the final rolls. */
export const HIGHROLL_REVEAL_MS = Math.round((SPIN_FRAMES / FPS) * 1000);

/** Animated High Roll: two mechanical counters spin, then lock on the given values. */
export async function renderHighRollGif(player: number, bot: number): Promise<Buffer> {
  ensureFonts();
  return encodeGif(renderFrames(player, bot), { fps: FPS, colors: 96, width: W, height: H });
}
