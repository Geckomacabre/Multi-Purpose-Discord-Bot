import { createCanvas, SKRSContext2D, Canvas } from '@napi-rs/canvas';
import { ensureFonts, roundedRect, encodeGif, grabFrame, chrome, brass, drawVignette, FONT } from './casinoRender.js';
import { symbolSprite } from './casinoSymbols.js';
import { drawDrum, drumShading, streaked } from './casinoReel.js';

const W = 560;
const H = 360;

// Reel window
const REELS = 3;
const REEL_W = 146;
const REEL_GAP = 8;
const REELS_W = REEL_W * REELS + REEL_GAP * (REELS - 1);
const REEL_LEFT = (W - REELS_W) / 2;
const WIN_Y = 92;
const WIN_H = 184;
const CY = WIN_Y + WIN_H / 2;

// Cylinder projection: each symbol sits CELL_ANGLE radians apart on a drum of
// radius DRUM_R, so neighbours above/below peek in foreshortened.
const DRUM_R = 152;
const CELL_ANGLE = 0.66;
const SYM = 104;

// Physical reel strip the drums scroll through. Each reel starts at a different
// point so they never blur in lockstep.
const STRIP = ['7️⃣', '🍒', '🍋', '🔔', '🍒', '💎', '🍋', '🍒', '🔔', '🍋'];

const FPS = 25;
// Reels stop left -> right, so the last symbol lands with a beat of suspense.
const STOP_AT = [26, 36, 46];
const SPIN_FRAMES = STOP_AT[REELS - 1]!;
const HOLD_FRAMES = 30;
// After a reel arrives it overshoots slightly and settles back (in cells).
const SETTLE = [0.16, 0.06, 0];

// Marquee bulbs
const BULBS = 15;
const BULB_Y = [14, 70];

let base: Canvas | null = null;
let overlay: Canvas | null = null;

/** Cabinet body, marquee panel and reel backs — everything behind the symbols. */
function buildBase(): Canvas {
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');

  // Lacquered cabinet
  const body = ctx.createLinearGradient(0, 0, 0, H);
  body.addColorStop(0, '#5a0d14');
  body.addColorStop(0.5, '#7d1520');
  body.addColorStop(1, '#3a070c');
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, W, H);
  // Vertical lacquer sheen
  const sheen = ctx.createLinearGradient(0, 0, W, 0);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.18, 'rgba(255,255,255,0.10)');
  sheen.addColorStop(0.24, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H);

  // Marquee glass
  roundedRect(ctx, 22, 24, W - 44, 36, 6);
  const glass = ctx.createLinearGradient(0, 24, 0, 60);
  glass.addColorStop(0, '#1a0a05');
  glass.addColorStop(1, '#2b1208');
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = brass(ctx, 22, 24, W - 22, 60);
  ctx.stroke();

  // Marquee lettering
  ctx.save();
  ctx.font = `34px ${FONT.sign}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '6px';
  const g = ctx.createLinearGradient(0, 26, 0, 58);
  g.addColorStop(0, '#fff3c9');
  g.addColorStop(0.5, '#e8b93e');
  g.addColorStop(1, '#a8741c');
  ctx.shadowColor = 'rgba(255,170,40,0.55)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = g;
  ctx.fillText('LUCKY  SEVENS', W / 2 + 3, 43);
  ctx.restore();

  // Chrome bezel around the reel window
  const bx = REEL_LEFT - 16, by = WIN_Y - 14, bw = REELS_W + 32, bh = WIN_H + 28;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  roundedRect(ctx, bx, by, bw, bh, 14);
  ctx.fillStyle = chrome(ctx, bx, by, bx + bw * 0.3, by + bh);
  ctx.fill();
  ctx.restore();
  roundedRect(ctx, bx + 6, by + 6, bw - 12, bh - 12, 10);
  ctx.fillStyle = '#0c0c0e';
  ctx.fill();

  // Reel backs (cream drums)
  for (let r = 0; r < REELS; r++) {
    const x = REEL_LEFT + r * (REEL_W + REEL_GAP);
    ctx.fillStyle = '#f4eedf';
    ctx.fillRect(x, WIN_Y, REEL_W, WIN_H);
  }

  // Coin slot / button deck strip under the window
  const dy = WIN_Y + WIN_H + 28;
  roundedRect(ctx, 22, dy, W - 44, H - dy - 14, 6);
  ctx.fillStyle = brass(ctx, 22, dy, W - 22, H - 14);
  ctx.fill();
  roundedRect(ctx, W / 2 - 110, dy + 7, 220, H - dy - 28, 4);
  ctx.fillStyle = '#0a0606';
  ctx.fill();
  return c;
}

/** Drum shading, glass glare and the payline — everything on top of the symbols. */
function buildOverlay(): Canvas {
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  for (let r = 0; r < REELS; r++) {
    drumShading(ctx, REEL_LEFT + r * (REEL_W + REEL_GAP), WIN_Y, REEL_W, WIN_H);
  }
  // Glass glare across the whole window
  ctx.save();
  ctx.beginPath();
  ctx.rect(REEL_LEFT, WIN_Y, REELS_W, WIN_H);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(REEL_LEFT, WIN_Y);
  ctx.lineTo(REEL_LEFT + 150, WIN_Y);
  ctx.lineTo(REEL_LEFT + 60, WIN_Y + WIN_H);
  ctx.lineTo(REEL_LEFT - 90, WIN_Y + WIN_H);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();
  ctx.restore();

  // Payline markers on the bezel
  for (const side of [-1, 1]) {
    const x = side < 0 ? REEL_LEFT - 14 : REEL_LEFT + REELS_W + 14;
    ctx.beginPath();
    ctx.moveTo(x, CY - 9);
    ctx.lineTo(x + side * -12, CY);
    ctx.lineTo(x, CY + 9);
    ctx.closePath();
    ctx.fillStyle = '#d4141f';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#2b0306';
    ctx.stroke();
  }
  return c;
}

/** Reel position (in strip cells) for reel `r` at frame `f`. */
function reelPos(r: number, f: number, final: number): number {
  const stop = STOP_AT[r]!;
  const arrive = stop - SETTLE.length;
  if (f >= stop) return final;
  if (f >= arrive) return final + SETTLE[f - arrive]!;
  const u = f / arrive;
  return final * (1 - Math.pow(1 - u, 2.2));
}

function drawReel(ctx: SKRSContext2D, r: number, pos: number, velocity: number) {
  drawDrum(ctx, {
    x: REEL_LEFT + r * (REEL_W + REEL_GAP), y: WIN_Y, w: REEL_W, h: WIN_H,
    radius: DRUM_R, cellAngle: CELL_ANGLE, pos, velocity,
    sprite: (j, blur) => {
      const sym = STRIP[((j + r * 3) % STRIP.length + STRIP.length) % STRIP.length]!;
      return streaked(symbolSprite(sym, SYM), blur, `sym:${sym}`);
    },
  });
}

function drawBulb(ctx: SKRSContext2D, x: number, y: number, lit: boolean) {
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  if (lit) {
    ctx.save();
    ctx.shadowColor = 'rgba(255,200,90,0.95)';
    ctx.shadowBlur = 12;
    const g = ctx.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 6);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, '#fff1b8');
    g.addColorStop(1, '#f0a62a');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  } else {
    const g = ctx.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 6);
    g.addColorStop(0, '#9a8466');
    g.addColorStop(1, '#4a3420');
    ctx.fillStyle = g;
    ctx.fill();
  }
}

function drawLed(ctx: SKRSContext2D, text: string, color: string) {
  const dy = WIN_Y + WIN_H + 28;
  ctx.save();
  ctx.font = `bold 22px ${FONT.mono}`;
  ctx.letterSpacing = '4px';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;
  ctx.fillText(text, W / 2 + 2, dy + 7 + (H - dy - 28) / 2 + 1);
  ctx.restore();
}

function renderFrames(symbols: string[], win: boolean): Buffer[] {
  base ??= buildBase();
  overlay ??= buildOverlay();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const frames: Buffer[] = [];

  // Final strip position per reel: land the requested symbol on the payline
  // after a few full turns (later reels travel further at similar speed).
  const finals = symbols.map((sym, r) => {
    let idx = STRIP.findIndex((s, i) => STRIP[(i + r * 3) % STRIP.length] === sym);
    if (idx < 0) idx = 0;
    return idx + STRIP.length * (3 + r);
  });

  const total = SPIN_FRAMES + HOLD_FRAMES;
  for (let f = 0; f < total; f++) {
    ctx.drawImage(base, 0, 0);
    for (let r = 0; r < REELS; r++) {
      const pos = reelPos(r, f, finals[r]!);
      const prev = f === 0 ? pos : reelPos(r, f - 1, finals[r]!);
      drawReel(ctx, r, pos, pos - prev);
    }
    ctx.drawImage(overlay, 0, 0);

    const done = f >= SPIN_FRAMES;
    // Payline: thin red line, glowing gold once a winning line lands.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(REEL_LEFT - 2, CY);
    ctx.lineTo(REEL_LEFT + REELS_W + 2, CY);
    if (done && win) {
      ctx.shadowColor = '#ffd25a';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = 'rgba(255,214,90,0.95)';
      ctx.lineWidth = 3;
    } else {
      ctx.strokeStyle = 'rgba(212,20,31,0.75)';
      ctx.lineWidth = 2;
    }
    ctx.stroke();
    ctx.restore();

    // Bulbs chase while spinning; on a win they flash alternately.
    for (let row = 0; row < 2; row++) {
      for (let k = 0; k < BULBS; k++) {
        const x = 30 + k * ((W - 60) / (BULBS - 1));
        let lit: boolean;
        if (!done) lit = (k + row + Math.floor(f / 2)) % 3 === 0;
        else if (win) lit = (k + row + Math.floor((f - SPIN_FRAMES) / 4)) % 2 === 0;
        else lit = true;
        drawBulb(ctx, x, BULB_Y[row]!, lit);
      }
    }

    if (!done) drawLed(ctx, 'GOOD LUCK', '#ff8a3a');
    else if (win) {
      // Blink, but hold steady at the end — the GIF freezes on its last frame.
      const t = f - SPIN_FRAMES;
      if (t >= HOLD_FRAMES - 8 || t % 8 < 5) drawLed(ctx, 'WINNER', '#ffd25a');
    }
    else drawLed(ctx, 'NO WIN', '#ff5a3a');

    drawVignette(ctx, W, H, 0.35);
    frames.push(grabFrame(canvas));
  }
  return frames;
}

/** Time until the last reel stops and the line is readable. */
export const SLOTS_REVEAL_MS = Math.round((SPIN_FRAMES / FPS) * 1000);

/** Animated slots: reels blur, then stop left→right on the given symbols. */
export async function renderSlotsGif(symbols: string[], win: boolean): Promise<Buffer> {
  ensureFonts();
  return encodeGif(renderFrames(symbols, win), { fps: FPS, colors: 160, width: W, height: H });
}
