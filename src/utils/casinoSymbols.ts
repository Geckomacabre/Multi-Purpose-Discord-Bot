import { createCanvas, SKRSContext2D, Canvas } from '@napi-rs/canvas';
import { ensureFonts, FONT } from './casinoRender.js';

/**
 * Vector-drawn fruit-machine symbols, keyed by the emoji the games already use
 * for their logic and chat text. Drawing them (instead of rendering Twemoji)
 * gives the reels and scratch card a consistent, printed look with proper
 * lighting. Every symbol is drawn in a 100×100 box centred on the origin.
 */

type Painter = (ctx: SKRSContext2D) => void;

function radial(ctx: SKRSContext2D, x: number, y: number, r: number, stops: [number, string][]) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/** Dark outline + fill, like screen-printed reel art. */
function inked(ctx: SKRSContext2D, fill: string | CanvasGradient | any, width = 3.2) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = '#1b1208';
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

function shine(ctx: SKRSContext2D, x: number, y: number, rx: number, ry: number, rot = -0.5, a = 0.75) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.fill();
  ctx.restore();
}

function leaf(ctx: SKRSContext2D, x: number, y: number, len: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.42, len, 0);
  ctx.quadraticCurveTo(len * 0.5, len * 0.42, 0, 0);
  const g = ctx.createLinearGradient(0, -len * 0.4, 0, len * 0.4);
  g.addColorStop(0, '#7cc456');
  g.addColorStop(1, '#2f7a2a');
  inked(ctx, g, 2.6);
  ctx.beginPath();
  ctx.moveTo(len * 0.1, 0);
  ctx.lineTo(len * 0.85, 0);
  ctx.strokeStyle = 'rgba(20,60,15,0.7)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();
}

const cherry: Painter = (ctx) => {
  // Stems first so the fruit overlaps them.
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1b1208';
  ctx.lineWidth = 6.5;
  ctx.beginPath();
  ctx.moveTo(-20, 14); ctx.quadraticCurveTo(-12, -18, 8, -36);
  ctx.moveTo(20, 18); ctx.quadraticCurveTo(16, -12, 8, -36);
  ctx.stroke();
  ctx.strokeStyle = '#5f8a2b';
  ctx.lineWidth = 3.2;
  ctx.stroke();
  leaf(ctx, 8, -36, 30, -0.35);
  for (const [x, y] of [[-20, 22], [20, 26]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 19, 0, Math.PI * 2);
    inked(ctx, radial(ctx, x, y, 21, [[0, '#ff6a6a'], [0.45, '#d4141f'], [1, '#6e0710']]));
    shine(ctx, x - 7, y - 7, 5.5, 3.2);
  }
};

const lemon: Painter = (ctx) => {
  ctx.save();
  ctx.rotate(-0.32);
  ctx.beginPath();
  // Lemon: fat ellipse with a nub at each end.
  ctx.moveTo(-42, 0);
  ctx.bezierCurveTo(-38, -6, -34, -28, 0, -30);
  ctx.bezierCurveTo(34, -28, 38, -6, 42, 0);
  ctx.bezierCurveTo(38, 6, 34, 28, 0, 30);
  ctx.bezierCurveTo(-34, 28, -38, 6, -42, 0);
  ctx.closePath();
  inked(ctx, radial(ctx, 0, 0, 44, [[0, '#fff7a6'], [0.5, '#f3d21b'], [1, '#b58a00']]));
  // Pitted peel texture.
  ctx.fillStyle = 'rgba(150,110,0,0.28)';
  for (const [x, y] of [[-14, 8], [6, 14], [18, -2], [-4, -10], [24, 12], [-24, -4], [10, 2]] as const) {
    ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
  }
  shine(ctx, -12, -14, 13, 5, -0.15, 0.7);
  ctx.restore();
  leaf(ctx, 16, -22, 26, -0.9);
};

const bell: Painter = (ctx) => {
  // Clapper peeks out under the rim.
  ctx.beginPath();
  ctx.arc(0, 32, 9, 0, Math.PI * 2);
  inked(ctx, radial(ctx, 0, 32, 10, [[0, '#fff0b0'], [1, '#9a6a12']]));
  ctx.beginPath();
  ctx.moveTo(0, -40);
  ctx.bezierCurveTo(-24, -40, -28, -18, -29, 0);
  ctx.bezierCurveTo(-30, 14, -38, 20, -42, 26);
  ctx.lineTo(42, 26);
  ctx.bezierCurveTo(38, 20, 30, 14, 29, 0);
  ctx.bezierCurveTo(28, -18, 24, -40, 0, -40);
  ctx.closePath();
  const g = ctx.createLinearGradient(-42, 0, 42, 0);
  g.addColorStop(0, '#8a5a0c');
  g.addColorStop(0.25, '#f7d35a');
  g.addColorStop(0.42, '#fff6c9');
  g.addColorStop(0.65, '#e3a92a');
  g.addColorStop(1, '#7a4c08');
  inked(ctx, g);
  // Rim band.
  ctx.beginPath();
  ctx.moveTo(-36, 18); ctx.lineTo(36, 18);
  ctx.strokeStyle = 'rgba(90,55,5,0.65)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // Hanging loop.
  ctx.beginPath();
  ctx.arc(0, -44, 6, 0, Math.PI * 2);
  ctx.lineWidth = 6; ctx.strokeStyle = '#1b1208'; ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = '#e3a92a'; ctx.stroke();
};

const diamond: Painter = (ctx) => {
  // Brilliant cut, side view: table + crown facets over a pavilion.
  const T = -30, G = -12, B = 40;            // table, girdle, culet y
  const facets: [number[], string][] = [
    [[-24, T, 24, T, 42, G, -42, G], '#bfefff'],
    [[-24, T, -10, G, -42, G], '#8fdcff'],
    [[24, T, 42, G, 10, G], '#5fb9f0'],
    [[-24, T, 24, T, 10, G, -10, G], '#e8fbff'],
    [[-42, G, -10, G, 0, B], '#5cc0f5'],
    [[-10, G, 10, G, 0, B], '#a6e6ff'],
    [[10, G, 42, G, 0, B], '#2c86cf'],
  ];
  for (const [p, c] of facets) {
    ctx.beginPath();
    ctx.moveTo(p[0]!, p[1]!);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i]!, p[i + 1]!);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(20,60,110,0.55)';
    ctx.stroke();
  }
  // Outer ink outline over the whole stone.
  ctx.beginPath();
  ctx.moveTo(-24, T); ctx.lineTo(24, T); ctx.lineTo(42, G); ctx.lineTo(0, B); ctx.lineTo(-42, G);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = '#0f2440';
  ctx.stroke();
  // Sparkle.
  ctx.save();
  ctx.translate(-16, -22);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -9); ctx.lineTo(2, -2); ctx.lineTo(9, 0); ctx.lineTo(2, 2);
  ctx.lineTo(0, 9); ctx.lineTo(-2, 2); ctx.lineTo(-9, 0); ctx.lineTo(-2, -2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const seven: Painter = (ctx) => {
  ctx.font = `104px ${FONT.sign}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // Classic reel "7": red with a gold keyline inside a heavy black outline.
  ctx.lineWidth = 11;
  ctx.strokeStyle = '#1b1208';
  ctx.strokeText('7', 2, 6);
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#f2c94c';
  ctx.strokeText('7', 2, 6);
  const g = ctx.createLinearGradient(0, -44, 0, 50);
  g.addColorStop(0, '#ff5a4e');
  g.addColorStop(0.5, '#d0101c');
  g.addColorStop(1, '#7c0610');
  ctx.fillStyle = g;
  ctx.fillText('7', 2, 6);
};

const grape: Painter = (ctx) => {
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -30); ctx.quadraticCurveTo(4, -40, 12, -44);
  ctx.lineWidth = 6.5; ctx.strokeStyle = '#1b1208'; ctx.stroke();
  ctx.lineWidth = 3.2; ctx.strokeStyle = '#6b4a22'; ctx.stroke();
  leaf(ctx, 4, -34, 28, -2.6);
  const r = 11.5;
  const berries: [number, number][] = [
    [-22, -18], [0, -20], [22, -18],
    [-11, 0], [11, 0], [-30, 2], [30, 2],
    [-18, 19], [0, 20], [18, 19],
    [-8, 37], [8, 37],
  ];
  for (const [x, y] of berries) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    inked(ctx, radial(ctx, x, y, r * 1.1, [[0, '#c590ff'], [0.5, '#6d2fb8'], [1, '#2c0b55']]), 2.6);
    shine(ctx, x - 4, y - 4, 3, 1.8, -0.5, 0.7);
  }
};

const star: Painter = (ctx) => {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 44 : 19;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r + 3);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(-30, -40, 30, 40);
  g.addColorStop(0, '#fff3b0');
  g.addColorStop(0.45, '#f6c431');
  g.addColorStop(1, '#a86b06');
  inked(ctx, g);
  // Bevel: light the upper-left arm faces.
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(0, 3);
  for (const i of [0, 8, 9]) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 44 : 19;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r + 3);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fill();
  ctx.restore();
};

const PAINTERS: Record<string, Painter> = {
  '🍒': cherry,
  '🍋': lemon,
  '🔔': bell,
  '💎': diamond,
  '7️⃣': seven,
  '7': seven,
  '🍇': grape,
  '⭐': star,
};

/** Draws `symbol` centred at (cx, cy), fitting a `size`-pixel box. */
export function drawSymbol(ctx: SKRSContext2D, symbol: string, cx: number, cy: number, size: number) {
  ensureFonts();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 100, size / 100);
  const paint = PAINTERS[symbol];
  if (paint) paint(ctx);
  else {
    // Unknown symbol: fall back to the emoji glyph so nothing renders blank.
    ctx.font = `80px Twe, ${FONT.body}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, 0, 4);
  }
  ctx.restore();
}

const spriteCache = new Map<string, Canvas>();

/**
 * Pre-rendered symbol on a transparent square canvas. Reels draw each symbol
 * many times per frame (motion blur), so blitting a sprite beats re-running
 * the vector paths.
 */
export function symbolSprite(symbol: string, size: number): Canvas {
  const key = `${symbol}@${size}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const c = createCanvas(size, size);
  drawSymbol(c.getContext('2d'), symbol, size / 2, size / 2, size * 0.92);
  spriteCache.set(key, c);
  return c;
}
