import { createCanvas, SKRSContext2D, Canvas } from '@napi-rs/canvas';
import {
  ensureFonts, roundedRect, encodeGif, grabFrame, brass, goldText, drawVignette, FONT,
} from './casinoRender.js';

// 10 bounces -> 11 buckets. Fewer rows than a "classic" 12 on purpose: the
// binomial gets sharper with every extra row, and at 12 the middle three
// buckets swallowed 61% of all drops, so anything good was unreachable.
export const ROWS = 10;
const HALF_UNITS = 2 * ROWS;             // ball x lives on 0..20 half-units
const START_X = ROWS;                    // enters dead centre

const W = 480;
const H = 600;
const PAD_X = 30;
const TOP_Y = 70;
const BUCKET_H = 50;
const BUCKET_Y = H - BUCKET_H - 20;
const ROW_H = (BUCKET_Y - TOP_Y) / (ROWS + 1);
const UNIT = (W - PAD_X * 2) / HALF_UNITS;
const CHIP_R = 11;

const FPS = 25;
const FRAMES_PER_ROW = 5;                // 10 rows * 5 = 50 frames (~2s)
const HOLD_FRAMES = 22;                  // freeze on the result at the end

const px = (x: number) => PAD_X + x * UNIT;
const py = (row: number) => TOP_Y + row * ROW_H;

// Paint colour per multiplier tier — hot at the edges, cool in the middle.
function bucketColor(mult: number): string {
  if (mult >= 20) return '#b3202a';
  if (mult >= 4) return '#d8661e';
  if (mult >= 2) return '#d9a93a';
  if (mult >= 1) return '#3f8f4f';
  return '#3a4a6b';
}

/**
 * Builds the ball's on-screen path. The landing bucket is decided by the caller
 * (fair binomial RNG) and passed in as `steps` — this only interpolates a
 * smooth, physical-looking descent that is guaranteed to end in that bucket, so
 * the animation can look organic without affecting the odds.
 */
function buildTrajectory(steps: number[]): { x: number; y: number; squash: number }[] {
  const pts: { x: number; y: number; squash: number }[] = [];
  let x = START_X;

  for (let r = 0; r < steps.length; r++) {
    const nx = x + steps[r]!;
    const y0 = r, y1 = r + 1;
    for (let f = 0; f < FRAMES_PER_ROW; f++) {
      const t = f / FRAMES_PER_ROW;
      // Horizontal: ease-out so it darts off the peg then settles.
      const hx = x + (nx - x) * (1 - Math.pow(1 - t, 2.2));
      // Vertical: accelerate under "gravity" across the row.
      const vy = y0 + (y1 - y0) * (t * t * 0.72 + t * 0.28);
      // Squash just after bouncing off a peg, easing back to round. Skipped on
      // the first row — the ball hasn't hit anything yet when it's released.
      const squash = r > 0 && t < 0.3 ? 1 - (0.3 - t) * 0.7 : 1;
      pts.push({ x: hx, y: vy, squash });
    }
    x = nx;
  }

  // Settle into the bucket with a small dampened bounce.
  const restY = ROWS + 0.62;
  const bounce = [0.24, 0.44, 0.30, 0.50, 0.56, 0.60, restY - ROWS];
  for (const b of bounce) pts.push({ x, y: ROWS + b, squash: 1 });
  for (let i = 0; i < HOLD_FRAMES; i++) pts.push({ x, y: restY, squash: 1 });
  return pts;
}

const boardCache = new Map<string, Canvas>();

/** Lacquered board, brass pegs, slot dividers and painted multiplier tiles. */
function buildBoard(mults: number[]): Canvas {
  const key = mults.join(',');
  const hit = boardCache.get(key);
  if (hit) return hit;
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');

  // Brass frame around a deep-blue lacquered panel
  ctx.fillStyle = brass(ctx, 0, 0, W, H);
  ctx.fillRect(0, 0, W, H);
  roundedRect(ctx, 8, 8, W - 16, H - 16, 8);
  const lacquer = ctx.createLinearGradient(0, 0, 0, H);
  lacquer.addColorStop(0, '#16285e');
  lacquer.addColorStop(1, '#0a1436');
  ctx.fillStyle = lacquer;
  ctx.fill();
  // Diagonal sheen on the lacquer
  const sheen = ctx.createLinearGradient(0, 0, W, H);
  sheen.addColorStop(0, 'rgba(255,255,255,0.07)');
  sheen.addColorStop(0.3, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fill();

  goldText(ctx, 'PLINKO', W / 2, 38, 34, { spacing: 8 });

  // Brass pegs with a little cast shadow
  for (let r = 1; r <= ROWS; r++) {
    for (let hx = START_X - r; hx <= START_X + r; hx += 2) {
      const x = px(hx), y = py(r);
      ctx.beginPath();
      ctx.arc(x + 1.2, y + 1.8, 4.8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 4.8, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(x - 1.4, y - 1.4, 0.4, x, y, 4.8);
      g.addColorStop(0, '#fff3c4');
      g.addColorStop(0.5, '#d8b25a');
      g.addColorStop(1, '#6b4e17');
      ctx.fillStyle = g;
      ctx.fill();
    }
  }

  // Slot dividers between buckets
  const divTop = py(ROWS) + 14;
  for (let k = 0; k <= ROWS + 1; k++) {
    const x = px(k * 2 - 1);
    ctx.fillStyle = brass(ctx, x - 2, 0, x + 2, 0);
    ctx.fillRect(x - 2, divTop, 4, BUCKET_Y + BUCKET_H - divTop);
  }

  // Painted multiplier tiles (unlit)
  for (let k = 0; k <= ROWS; k++) drawTile(ctx, k, mults[k]!, false);
  drawVignette(ctx, W, H, 0.3);
  boardCache.set(key, c);
  return c;
}

function drawTile(ctx: SKRSContext2D, k: number, mult: number, lit: boolean) {
  const cx = px(k * 2);
  const w = UNIT * 2 - 6;
  const col = bucketColor(mult);
  ctx.save();
  roundedRect(ctx, cx - w / 2, BUCKET_Y, w, BUCKET_H, 4);
  if (lit) { ctx.shadowColor = col; ctx.shadowBlur = 18; }
  ctx.fillStyle = col;
  ctx.globalAlpha = lit ? 1 : 0.72;
  ctx.fill();
  ctx.restore();
  if (lit) {
    roundedRect(ctx, cx - w / 2, BUCKET_Y, w, BUCKET_H, 4);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff1c4';
    ctx.stroke();
  }
  ctx.save();
  ctx.font = `${lit ? 19 : 16}px ${FONT.sign}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = lit ? '#ffffff' : 'rgba(246,241,228,0.85)';
  // Narrow tiles: "0.35x" is squeezed horizontally rather than shrunk.
  const label = `${mult}x`;
  const tw = ctx.measureText(label).width;
  const fit = Math.min(1, (w - 6) / tw);
  ctx.translate(cx, BUCKET_Y + BUCKET_H / 2 + 1);
  ctx.scale(fit, 1);
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

/** Red casino chip seen face-on, spinning as it rolls off each peg. */
function drawChip(ctx: SKRSContext2D, x: number, y: number, squash: number, spin: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.save();
  ctx.translate(1.5, 2.5);
  ctx.scale(1 / squash, squash);
  ctx.beginPath();
  ctx.arc(0, 0, CHIP_R, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  ctx.restore();
  ctx.scale(1 / squash, squash);
  ctx.rotate(spin);
  ctx.beginPath();
  ctx.arc(0, 0, CHIP_R, 0, Math.PI * 2);
  ctx.fillStyle = '#c4122f';
  ctx.fill();
  // Edge spots
  ctx.fillStyle = '#f6f1e4';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.fillRect(-1.6, -CHIP_R, 3.2, 3.4);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, CHIP_R * 0.55, 0, Math.PI * 2);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#f6f1e4';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-2.5, -3, 2.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();
  ctx.restore();
}

/** How long the ball falls (incl. its settle bounce) before it comes to rest. */
export const PLINKO_REVEAL_MS = Math.round(((ROWS * FRAMES_PER_ROW + 7) / FPS) * 1000);

/**
 * Renders the whole drop and encodes it as an animated GIF (plays once, then
 * holds on the result). `steps` are the per-row ±1 bounces already decided by
 * the caller's fair RNG.
 */
export async function renderPlinkoGif(steps: number[], mults: number[], bucket: number): Promise<Buffer> {
  ensureFonts();
  const traj = buildTrajectory(steps);
  const board = buildBoard(mults);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const frames: Buffer[] = [];
  const landedAt = traj.length - HOLD_FRAMES - 7;
  for (let i = 0; i < traj.length; i++) {
    const p = traj[i]!;
    ctx.drawImage(board, 0, 0);
    if (i >= landedAt) drawTile(ctx, bucket, mults[bucket]!, true);
    // Spin follows horizontal travel, so it rolls the way it bounces.
    drawChip(ctx, px(p.x), py(p.y), p.squash, (p.x - START_X) * 1.3);
    frames.push(grabFrame(canvas));
  }
  return encodeGif(frames, { fps: FPS, colors: 96, width: W, height: H });
}
