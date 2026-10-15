import { createCanvas, SKRSContext2D, Canvas } from '@napi-rs/canvas';
import { ensureFonts, drawFelt, encodeGif, grabFrame, goldText, arcText } from './casinoRender.js';

const W = 400;
const H = 300;
const CX = W / 2;
const COIN_R = 64;
const THICK = 9;           // edge thickness, visible as the coin turns
const GROUND_Y = 138;      // coin's resting centre
const SHADOW_Y = 222;      // ground shadow, clear of the coin
const LABEL_Y = H - 30;    // result text
const TOSS_H = 62;         // arc height (keeps the coin fully on-canvas)

const FPS = 25;
const SPIN_FRAMES = 42;   // toss + spin
const HOLD_FRAMES = 20;   // freeze on the result
const HALF_TURNS = 9;

type Side = 'heads' | 'tails';

// Only two possible outcomes, so each GIF is rendered once and reused forever —
// no per-flip render cost.
const cache = new Map<Side, Buffer>();

// Faces are drawn larger than needed so the toss's slight zoom stays sharp.
const SPRITE_R = Math.ceil(COIN_R * 1.2);
const faces = new Map<Side, Canvas>();

/** Raised relief: dark lower-right edge, light upper-left edge, metal body. */
function emboss(ctx: SKRSContext2D, path: () => void, base: string) {
  for (const [dx, dy, col] of [[1.4, 1.6, 'rgba(70,45,5,0.85)'], [-1, -1, 'rgba(255,250,215,0.9)'], [0, 0, base]] as const) {
    ctx.save();
    ctx.translate(dx, dy);
    ctx.beginPath();
    path();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.restore();
  }
}

function crown(ctx: SKRSContext2D) {
  ctx.moveTo(-26, 14); ctx.lineTo(-30, -12); ctx.lineTo(-15, 0); ctx.lineTo(-8, -20);
  ctx.lineTo(0, -4); ctx.lineTo(8, -20); ctx.lineTo(15, 0); ctx.lineTo(30, -12); ctx.lineTo(26, 14);
  ctx.closePath();
  ctx.rect(-27, 17, 54, 7);
  // Jewels on the crown's points.
  for (const [x, y] of [[-30, -14], [-8, -22], [8, -22], [30, -14]] as const) {
    ctx.moveTo(x + 3.6, y);
    ctx.arc(x, y, 3.6, 0, Math.PI * 2);
  }
}

function wreath(ctx: SKRSContext2D) {
  // Leaf points are rotated by hand: building this path with a
  // save/rotate/restore per leaf rendered only a few of the leaves.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const a = Math.PI / 2 + side * (0.35 + i * 0.32);
      const ox = Math.cos(a) * 30, oy = Math.sin(a) * 30;
      // Leaves lie along the ring, tilted slightly outward.
      const rot = a + side * (Math.PI / 2 + 0.35);
      const c = Math.cos(rot), s = Math.sin(rot);
      const p = (x: number, y: number): [number, number] => [ox + x * c - y * s, oy + x * s + y * c];
      ctx.moveTo(...p(-8, 0));
      ctx.quadraticCurveTo(...p(0, -5), ...p(8, 0));
      ctx.quadraticCurveTo(...p(0, 5), ...p(-8, 0));
    }
  }
  // Star in the middle of the wreath.
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 16 : 7;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

function coinFace(side: Side): Canvas {
  const hit = faces.get(side);
  if (hit) return hit;
  const S = SPRITE_R * 2;
  const c = createCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.translate(SPRITE_R, SPRITE_R);
  ctx.scale(SPRITE_R / COIN_R, SPRITE_R / COIN_R);
  const R = COIN_R;

  // Rim
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  const rim = ctx.createLinearGradient(-R, -R, R, R);
  rim.addColorStop(0, '#fff0b5');
  rim.addColorStop(0.45, '#d9a93a');
  rim.addColorStop(1, '#7a520f');
  ctx.fillStyle = rim;
  ctx.fill();

  // Field (recessed: shaded opposite to the rim)
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.86, 0, Math.PI * 2);
  const field = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R * 0.9);
  field.addColorStop(0, '#f6d77a');
  field.addColorStop(0.7, '#d4a137');
  field.addColorStop(1, '#a8771c');
  ctx.fillStyle = field;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(90,60,10,0.6)';
  ctx.stroke();

  // Denticles just inside the rim
  ctx.fillStyle = 'rgba(120,80,15,0.55)';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(0, -6);
  emboss(ctx, () => (side === 'heads' ? crown(ctx) : wreath(ctx)), '#e9bd52');
  ctx.restore();
  arcText(ctx, side === 'heads' ? 'HEADS' : 'TAILS', 0, 0, R * 0.62, 13, 'rgba(95,62,8,0.9)', { flip: true });

  // Specular sheen across the face
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  const sheen = ctx.createLinearGradient(-R, -R, R * 0.4, R * 0.4);
  sheen.addColorStop(0, 'rgba(255,255,255,0.35)');
  sheen.addColorStop(0.35, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fill();

  faces.set(side, c);
  return c;
}

/**
 * Draws the coin turned by `theta` about its vertical axis: the near face
 * foreshortened horizontally, with the reeded edge visible beside it.
 */
function drawCoin(ctx: SKRSContext2D, cx: number, cy: number, theta: number, scale: number, side: Side) {
  const cos = Math.cos(theta), sin = Math.sin(theta);
  const rx = COIN_R * scale * Math.max(0.035, Math.abs(cos));
  const ry = COIN_R * scale;
  const edge = THICK * scale * sin;

  // Edge: a stack of ellipses from the far face to the near face.
  const steps = 8;
  for (let k = 0; k <= steps; k++) {
    const x = cx - edge / 2 + (edge * k) / steps;
    ctx.beginPath();
    ctx.ellipse(x, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = k % 2 ? '#8a5f14' : '#b3832a';
    ctx.fill();
  }
  const sprite = coinFace(side);
  ctx.drawImage(sprite, cx + edge / 2 - rx * (SPRITE_R / COIN_R), cy - ry * (SPRITE_R / COIN_R),
    rx * 2 * (SPRITE_R / COIN_R), ry * 2 * (SPRITE_R / COIN_R));
}

function renderFrames(result: Side): Buffer[] {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const frames: Buffer[] = [];
  const other: Side = result === 'heads' ? 'tails' : 'heads';
  // Whichever face points at the camera when the spin ends must be `result`.
  const endSign = Math.sign(Math.cos(Math.PI * HALF_TURNS)) || 1;

  for (let i = 0; i < SPIN_FRAMES + HOLD_FRAMES; i++) {
    const spinning = i < SPIN_FRAMES;
    const t = spinning ? i / SPIN_FRAMES : 1;
    drawFelt(ctx, W, H);

    const lift = Math.sin(Math.PI * t);
    const cy = GROUND_Y - lift * TOSS_H;
    // Shadow spreads and fades as the coin rises.
    ctx.beginPath();
    ctx.ellipse(CX, SHADOW_Y, 52 - lift * 16, 10 - lift * 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0,0,0,${0.42 - lift * 0.22})`;
    ctx.fill();

    // Spin eases out so it slows into its final face.
    const eased = 1 - Math.pow(1 - t, 2.4);
    const theta = eased * Math.PI * HALF_TURNS;
    const showing = Math.cos(theta) * endSign >= 0 ? result : other;
    drawCoin(ctx, CX, cy, theta, 1 + lift * 0.14, showing);

    if (!spinning) goldText(ctx, result.toUpperCase(), CX, LABEL_Y, 34, { spacing: 5 });
    frames.push(grabFrame(canvas));
  }
  return frames;
}

/** How long the coin is in the air before it lands face-up on the result. */
export const FLIP_REVEAL_MS = Math.round((SPIN_FRAMES / FPS) * 1000);

/** Animated coin flip landing on `result`. Cached — only two outcomes exist. */
export async function renderCoinFlipGif(result: Side): Promise<Buffer> {
  const hit = cache.get(result);
  if (hit) return hit;
  ensureFonts();
  const gif = await encodeGif(renderFrames(result), { fps: FPS, colors: 96, width: W, height: H });
  cache.set(result, gif);
  return gif;
}
