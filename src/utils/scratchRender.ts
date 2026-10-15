import { createCanvas, SKRSContext2D } from '@napi-rs/canvas';
import { ensureFonts, drawFelt, roundedRect, FONT } from './casinoRender.js';
import { drawSymbol } from './casinoSymbols.js';

const CELL = 92;
const GAP = 8;
const GRID = CELL * 3 + GAP * 2;
const TICKET_PAD = 22;
const HEADER_H = 92;
const FOOTER_H = 56;
const MARGIN = 18;                           // felt visible around the ticket
const TICKET_W = GRID + TICKET_PAD * 2;
const TICKET_H = HEADER_H + GRID + FOOTER_H + TICKET_PAD;
const W = TICKET_W + MARGIN * 2;
const H = TICKET_H + MARGIN * 2;

/** Small deterministic PRNG so every card's scratch edges look hand-done but stable. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/**
 * One revealed cell: the printed symbol on ticket paper, with the silver
 * latex scratched away in a ragged blob and remnants left at the edges.
 */
function drawCell(ctx: SKRSContext2D, x: number, y: number, symbol: string, seed: number) {
  const rand = rng(seed);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, CELL, CELL);
  ctx.clip();
  ctx.fillStyle = '#fbf6e6';
  ctx.fillRect(x, y, CELL, CELL);
  drawSymbol(ctx, symbol, x + CELL / 2, y + CELL / 2 + 1, CELL * 0.66);

  // Silver layer with the scratched-off area cut out (even-odd fill).
  ctx.beginPath();
  ctx.rect(x, y, CELL, CELL);
  const pts = 30;
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const r = CELL * (0.47 + rand() * 0.1);
    const px = x + CELL / 2 + Math.cos(a) * r;
    const py = y + CELL / 2 + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const silver = ctx.createLinearGradient(x, y, x + CELL, y + CELL);
  silver.addColorStop(0, '#d9dde2');
  silver.addColorStop(0.5, '#a9b0b8');
  silver.addColorStop(1, '#cfd4da');
  ctx.fillStyle = silver;
  ctx.fill('evenodd');

  // Flecks of latex left inside the scratched area.
  ctx.fillStyle = 'rgba(160,168,176,0.85)';
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const r = CELL * (0.36 + rand() * 0.1);
    ctx.beginPath();
    ctx.arc(x + CELL / 2 + Math.cos(a) * r, y + CELL / 2 + Math.sin(a) * r, 1 + rand() * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(120,90,40,0.5)';
  ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
}

/** Hand-drawn red marker ring around a winning cell — two slightly-off passes. */
function circleWinner(ctx: SKRSContext2D, x: number, y: number, seed: number) {
  const rand = rng(seed * 7 + 3);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(200,16,40,0.85)';
  ctx.lineWidth = 3.4;
  const cx = x + CELL / 2, cy = y + CELL / 2;
  ctx.beginPath();
  const start = rand() * Math.PI * 2;
  const sweep = Math.PI * 2 + 0.5;          // overshoots, like a real pen loop
  for (let i = 0; i <= 40; i++) {
    const a = start + (i / 40) * sweep;
    const r = CELL * 0.44 + Math.sin(a * 3 + seed) * 2.5 + (i / 40) * 3;
    const px = cx + Math.cos(a) * r * 1.04;
    const py = cy + Math.sin(a) * r * 0.96;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Renders the finished scratch card: a printed ticket with all nine cells
 * scratched and every cell of the winning match circled in marker. Static
 * PNG — the scratching itself is already interactive via the buttons, so this
 * is the payoff image rather than an animation (which would mean re-uploading
 * on all nine clicks).
 */
export function renderScratchCard(symbols: string[], winningEmoji: string | null, matchNeeded = 4): Buffer {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawFelt(ctx, W, H);

  const tx = MARGIN, ty = MARGIN;
  // Ticket stock with a drop shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 5;
  roundedRect(ctx, tx, ty, TICKET_W, TICKET_H, 10);
  ctx.fillStyle = '#f3e9cf';
  ctx.fill();
  ctx.restore();

  // Printed guilloche-style background lines
  ctx.save();
  roundedRect(ctx, tx, ty, TICKET_W, TICKET_H, 10);
  ctx.clip();
  ctx.strokeStyle = 'rgba(180,130,60,0.16)';
  ctx.lineWidth = 1;
  for (let i = -TICKET_H; i < TICKET_W; i += 7) {
    ctx.beginPath();
    for (let s = 0; s <= TICKET_H; s += 6) {
      const xx = tx + i + s * 0.6 + Math.sin(s / 14) * 4;
      if (s === 0) ctx.moveTo(xx, ty + s); else ctx.lineTo(xx, ty + s);
    }
    ctx.stroke();
  }

  // Header band
  const band = ctx.createLinearGradient(0, ty, 0, ty + HEADER_H - 16);
  band.addColorStop(0, '#c4122f');
  band.addColorStop(1, '#8a0b1f');
  ctx.fillStyle = band;
  ctx.fillRect(tx, ty, TICKET_W, HEADER_H - 16);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.font = `36px ${FONT.sign}`;
  ctx.letterSpacing = '4px';
  ctx.fillStyle = '#5a0612';
  ctx.fillText('LUCKY SCRATCH', W / 2 + 2, ty + 32 + 2);
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText('LUCKY SCRATCH', W / 2, ty + 32);
  ctx.font = `15px ${FONT.sign}`;
  ctx.letterSpacing = '3px';
  ctx.fillStyle = '#fff4d6';
  ctx.fillText(`MATCH ${matchNeeded} SYMBOLS TO WIN`, W / 2, ty + 61);
  ctx.restore();

  const gx = tx + TICKET_PAD;
  const gy = ty + HEADER_H;
  // Panel border around the play area
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#8a0b1f';
  ctx.strokeRect(gx - 6, gy - 6, GRID + 12, GRID + 12);

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const i = r * 3 + c;
      drawCell(ctx, gx + c * (CELL + GAP), gy + r * (CELL + GAP), symbols[i] ?? '❓', i * 97 + 11);
    }
  }
  if (winningEmoji !== null) {
    symbols.forEach((s, i) => {
      if (s !== winningEmoji) return;
      circleWinner(ctx, gx + (i % 3) * (CELL + GAP), gy + Math.floor(i / 3) * (CELL + GAP), i + 1);
    });
  }

  // Footer: small print, serial and barcode
  const fy = gy + GRID + 18;
  ctx.save();
  ctx.font = `bold 10px ${FONT.mono}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(70,40,10,0.75)';
  const serial = symbols.reduce((h, s, i) => (h * 31 + s.codePointAt(0)! + i) >>> 0, 7) % 1_000_000;
  ctx.fillText(`No. ${String(serial).padStart(6, '0')}`, gx, fy + 10);
  ctx.fillText('VOID IF TORN OR ALTERED', gx, fy + 24);
  // Barcode
  const rand = rng(serial);
  let bx = gx + GRID - 110;
  ctx.fillStyle = '#2a1a08';
  while (bx < gx + GRID) {
    const w = 1 + Math.floor(rand() * 3);
    ctx.fillRect(bx, fy, w, 30);
    bx += w + 1 + Math.floor(rand() * 2);
  }
  ctx.restore();

  // JPEG: the felt grain makes PNG ~5x larger for no visible gain.
  return canvas.toBuffer('image/jpeg', 90) as unknown as Buffer;
}
