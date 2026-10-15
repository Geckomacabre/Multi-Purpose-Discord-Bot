import { createCanvas, SKRSContext2D, Canvas } from '@napi-rs/canvas';

/**
 * A spinning drum seen through a window — the slot reels and the High Roll
 * odometer counters both use it. Cells sit `cellAngle` radians apart on a
 * cylinder of `radius`, so neighbours above and below the centre line appear
 * foreshortened, and fast movement swaps in pre-streaked sprites.
 */

// Streak lengths (px) baked into sprites. Quantised so each symbol is
// streaked at most a few times, then reused for every frame.
export const BLUR_LEVELS = [0, 24, 56, 110];

const streakCache = new Map<string, Canvas>();

/** `src` smeared vertically over `blur` px; cached under `key`. */
export function streaked(src: Canvas, blur: number, key: string): Canvas {
  if (blur === 0) return src;
  const k = `${key}:${blur}`;
  const hit = streakCache.get(k);
  if (hit) return hit;
  const c = createCanvas(src.width, src.height + blur);
  const ctx = c.getContext('2d');
  // Many faint copies along the streak; the overlap in the middle gives the
  // soft-ended smear of a real spinning drum rather than visible ghosts.
  const n = Math.ceil(blur / 2.5);
  ctx.globalAlpha = Math.min(1, 3 / n);
  for (let i = 0; i <= n; i++) ctx.drawImage(src, 0, (i / n) * blur);
  streakCache.set(k, c);
  return c;
}

/** Picks a streak level for a drum moving `pxPerFrame` along its surface. */
export function blurLevel(pxPerFrame: number): number {
  const px = Math.abs(pxPerFrame);
  if (px < 14) return 0;
  if (px < 45) return 1;
  if (px < 95) return 2;
  return 3;
}

export interface DrumOptions {
  x: number; y: number; w: number; h: number;
  radius: number;
  cellAngle: number;
  /** Position in cells; integer = cell `pos` centred on the line. */
  pos: number;
  /** Cells moved since the previous frame (drives motion blur). */
  velocity: number;
  /** Sprite for cell `j`, already streaked by `blur` px. */
  sprite: (j: number, blur: number) => Canvas;
}

export function drawDrum(ctx: SKRSContext2D, o: DrumOptions) {
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const blur = BLUR_LEVELS[blurLevel(o.velocity * o.radius * o.cellAngle)]!;
  ctx.save();
  ctx.beginPath();
  ctx.rect(o.x, o.y, o.w, o.h);
  ctx.clip();
  const centre = Math.floor(o.pos);
  for (let j = centre - 2; j <= centre + 2; j++) {
    const theta = (o.pos - j) * o.cellAngle;
    if (Math.abs(theta) > 1.45) continue;
    const s = o.sprite(j, blur);
    const scaleY = Math.cos(theta);
    const y = cy + Math.sin(theta) * o.radius;
    const h = s.height * scaleY;
    ctx.drawImage(s, cx - s.width / 2, y - h / 2, s.width, h);
  }
  ctx.restore();
}

/** Top/bottom falloff and side shading that make a flat strip read as a drum. */
export function drumShading(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, depth = 0.92) {
  const sh = ctx.createLinearGradient(0, y, 0, y + h);
  sh.addColorStop(0, `rgba(10,6,4,${depth})`);
  sh.addColorStop(0.22, 'rgba(10,6,4,0.25)');
  sh.addColorStop(0.42, 'rgba(10,6,4,0)');
  sh.addColorStop(0.58, 'rgba(10,6,4,0)');
  sh.addColorStop(0.78, 'rgba(10,6,4,0.25)');
  sh.addColorStop(1, `rgba(10,6,4,${depth})`);
  ctx.fillStyle = sh;
  ctx.fillRect(x, y, w, h);
  const sx = ctx.createLinearGradient(x, 0, x + w, 0);
  sx.addColorStop(0, 'rgba(0,0,0,0.28)');
  sx.addColorStop(0.15, 'rgba(0,0,0,0)');
  sx.addColorStop(0.85, 'rgba(0,0,0,0)');
  sx.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = sx;
  ctx.fillRect(x, y, w, h);
}
