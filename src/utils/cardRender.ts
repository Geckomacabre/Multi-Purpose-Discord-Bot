import { createCanvas, SKRSContext2D, Canvas } from '@napi-rs/canvas';
import {
  ensureFonts, drawFelt, roundedRect, arcText, goldText, plainTitle, FONT, PALETTE,
} from './casinoRender.js';
import type { Card } from './cards.js';

const CARD_W = 100;
const CARD_H = 140;
const RADIUS = 8;

const RED = '#c4122f';
const BLACK = '#17171b';
const isRedSuit = (s: string) => s === '♥' || s === '♦';

// ── Suit shapes ───────────────────────────────────────────────────────────────
// Drawn as paths (not font glyphs) so pips are crisp and identical everywhere.

function heartPath(ctx: SKRSContext2D, s: number) {
  ctx.moveTo(0, 0.45 * s);
  ctx.bezierCurveTo(-0.1 * s, 0.3 * s, -0.5 * s, 0.05 * s, -0.5 * s, -0.18 * s);
  ctx.bezierCurveTo(-0.5 * s, -0.44 * s, -0.14 * s, -0.52 * s, 0, -0.27 * s);
  ctx.bezierCurveTo(0.14 * s, -0.52 * s, 0.5 * s, -0.44 * s, 0.5 * s, -0.18 * s);
  ctx.bezierCurveTo(0.5 * s, 0.05 * s, 0.1 * s, 0.3 * s, 0, 0.45 * s);
}

function stemPath(ctx: SKRSContext2D, s: number) {
  ctx.moveTo(-0.03 * s, 0.05 * s);
  ctx.quadraticCurveTo(-0.04 * s, 0.38 * s, -0.2 * s, 0.5 * s);
  ctx.lineTo(0.2 * s, 0.5 * s);
  ctx.quadraticCurveTo(0.04 * s, 0.38 * s, 0.03 * s, 0.05 * s);
  ctx.closePath();
}

function drawSuit(ctx: SKRSContext2D, suit: string, x: number, y: number, s: number, flip = false) {
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.rotate(Math.PI);
  ctx.fillStyle = isRedSuit(suit) ? RED : BLACK;
  ctx.beginPath();
  if (suit === '♥') heartPath(ctx, s);
  else if (suit === '♦') {
    ctx.moveTo(0, -0.52 * s);
    ctx.quadraticCurveTo(0.14 * s, -0.2 * s, 0.4 * s, 0);
    ctx.quadraticCurveTo(0.14 * s, 0.2 * s, 0, 0.52 * s);
    ctx.quadraticCurveTo(-0.14 * s, 0.2 * s, -0.4 * s, 0);
    ctx.quadraticCurveTo(-0.14 * s, -0.2 * s, 0, -0.52 * s);
  } else if (suit === '♠') {
    ctx.save();
    ctx.translate(0, -0.06 * s);
    ctx.scale(1, -0.9);
    heartPath(ctx, s);
    ctx.restore();
    stemPath(ctx, s);
  } else {
    for (const [cx, cy] of [[0, -0.25], [-0.25, 0.05], [0.25, 0.05]] as const) {
      ctx.moveTo(cx * s + 0.22 * s, cy * s);
      ctx.arc(cx * s, cy * s, 0.22 * s, 0, Math.PI * 2);
    }
    ctx.moveTo(0, -0.1 * s);
    ctx.arc(0, -0.02 * s, 0.1 * s, 0, Math.PI * 2);
    stemPath(ctx, s);
  }
  ctx.fill();
  ctx.restore();
}

// Standard pip layouts: [column (-1 left, 0 centre, 1 right), row 0..1].
const PIPS: Record<string, [number, number][]> = {
  '2': [[0, 0], [0, 1]],
  '3': [[0, 0], [0, 0.5], [0, 1]],
  '4': [[-1, 0], [1, 0], [-1, 1], [1, 1]],
  '5': [[-1, 0], [1, 0], [0, 0.5], [-1, 1], [1, 1]],
  '6': [[-1, 0], [1, 0], [-1, 0.5], [1, 0.5], [-1, 1], [1, 1]],
  '7': [[-1, 0], [1, 0], [0, 0.26], [-1, 0.5], [1, 0.5], [-1, 1], [1, 1]],
  '8': [[-1, 0], [1, 0], [0, 0.26], [-1, 0.5], [1, 0.5], [0, 0.74], [-1, 1], [1, 1]],
  '9': [[-1, 0], [1, 0], [-1, 1 / 3], [1, 1 / 3], [0, 0.5], [-1, 2 / 3], [1, 2 / 3], [-1, 1], [1, 1]],
  '10': [[-1, 0], [1, 0], [0, 1 / 6], [-1, 1 / 3], [1, 1 / 3], [-1, 2 / 3], [1, 2 / 3], [0, 5 / 6], [-1, 1], [1, 1]],
};

/** Corner index: rank over a small suit pip. Drawn twice, rotated, like a real deck. */
function drawIndex(ctx: SKRSContext2D, card: Card) {
  ctx.fillStyle = isRedSuit(card.suit) ? RED : BLACK;
  ctx.font = `bold 21px ${FONT.serif}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.save();
  // "10" is two glyphs wide; condense it so it fits the same column.
  if (card.rank === '10') { ctx.translate(INDEX_X, 0); ctx.scale(0.68, 1); ctx.translate(-INDEX_X, 0); }
  ctx.fillText(card.rank, INDEX_X, 6);
  ctx.restore();
  drawSuit(ctx, card.suit, INDEX_X, 38, 12);
}

// Index column and pip grid are kept apart so pips never touch the corners.
const INDEX_X = 13;
const PIP_DX = 18;
const PIP_TOP = 30;
const PIP_SIZE = 19;

/** Simple crown/cap emblem for court cards (K five points, Q three, J a cap). */
function courtEmblem(ctx: SKRSContext2D, rank: string, color: string) {
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (rank === 'K') {
    ctx.moveTo(-18, 8); ctx.lineTo(-20, -8); ctx.lineTo(-10, 0); ctx.lineTo(-5, -12);
    ctx.lineTo(0, -2); ctx.lineTo(5, -12); ctx.lineTo(10, 0); ctx.lineTo(20, -8); ctx.lineTo(18, 8);
  } else if (rank === 'Q') {
    ctx.moveTo(-16, 8); ctx.lineTo(-17, -4); ctx.quadraticCurveTo(-8, 2, 0, -12);
    ctx.quadraticCurveTo(8, 2, 17, -4); ctx.lineTo(16, 8);
  } else {
    ctx.moveTo(-15, 8); ctx.quadraticCurveTo(-16, -10, 0, -10); ctx.quadraticCurveTo(16, -10, 15, 8);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e8c66a';
  ctx.fillRect(-17, 5, 34, 4);
}

const COURT_TINT: Record<string, string> = { K: '#f1e2b0', Q: '#f5dcd6', J: '#d9e3f3' };

function drawCourt(ctx: SKRSContext2D, card: Card) {
  const fx = 25, fy = 22, fw = CARD_W - 50, fh = CARD_H - 44;
  const col = isRedSuit(card.suit) ? RED : BLACK;
  ctx.fillStyle = COURT_TINT[card.rank]!;
  ctx.fillRect(fx, fy, fw, fh);
  // Diagonal hatching, the way court frames are printed.
  ctx.save();
  ctx.beginPath(); ctx.rect(fx, fy, fw, fh); ctx.clip();
  ctx.strokeStyle = 'rgba(160,120,40,0.18)';
  ctx.lineWidth = 1;
  for (let d = -fh; d < fw; d += 6) {
    ctx.beginPath(); ctx.moveTo(fx + d, fy); ctx.lineTo(fx + d + fh, fy + fh); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(fx, fy, fw, fh);

  // Mirrored halves, like a double-headed court card.
  const cx = CARD_W / 2, cy = CARD_H / 2;
  for (const flip of [false, true]) {
    ctx.save();
    ctx.translate(cx, cy);
    if (flip) ctx.rotate(Math.PI);
    ctx.translate(0, -30);
    courtEmblem(ctx, card.rank, col);
    ctx.restore();
  }
  ctx.save();
  ctx.font = `bold 40px ${FONT.serif}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = col;
  ctx.fillText(card.rank, cx, cy + 2);
  ctx.restore();
  drawSuit(ctx, card.suit, fx + 9, fy + 10, 11);
  drawSuit(ctx, card.suit, fx + fw - 9, fy + fh - 10, 11, true);
}

const faceCache = new Map<string, Canvas>();

/** Card face rendered once per rank+suit (shadow is added when placed). */
function cardFace(card: Card): Canvas {
  const key = card.rank + card.suit;
  const hit = faceCache.get(key);
  if (hit) return hit;
  const c = createCanvas(CARD_W, CARD_H);
  const ctx = c.getContext('2d');
  roundedRect(ctx, 0.5, 0.5, CARD_W - 1, CARD_H - 1, RADIUS);
  const paper = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  paper.addColorStop(0, '#fffdf7');
  paper.addColorStop(1, '#efe8d8');
  ctx.fillStyle = paper;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#bfb5a0';
  ctx.stroke();

  drawIndex(ctx, card);
  ctx.save();
  ctx.translate(CARD_W, CARD_H);
  ctx.rotate(Math.PI);
  drawIndex(ctx, card);
  ctx.restore();

  if (card.rank === 'A') {
    drawSuit(ctx, card.suit, CARD_W / 2, CARD_H / 2, card.suit === '♠' ? 58 : 46);
  } else if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') {
    drawCourt(ctx, card);
  } else {
    const layout = PIPS[card.rank] ?? [];
    const span = CARD_H - PIP_TOP * 2;
    for (const [col, row] of layout) {
      drawSuit(ctx, card.suit, CARD_W / 2 + col * PIP_DX, PIP_TOP + row * span, PIP_SIZE, row > 0.5);
    }
  }
  faceCache.set(key, c);
  return c;
}

let backCache: Canvas | null = null;

/** Burgundy lattice back with a white border, like a casino-issue deck. */
function cardBack(): Canvas {
  if (backCache) return backCache;
  const c = createCanvas(CARD_W, CARD_H);
  const ctx = c.getContext('2d');
  roundedRect(ctx, 0.5, 0.5, CARD_W - 1, CARD_H - 1, RADIUS);
  ctx.fillStyle = '#fbf8f0';
  ctx.fill();
  ctx.strokeStyle = '#bfb5a0';
  ctx.lineWidth = 1;
  ctx.stroke();
  const ix = 7, iy = 7, iw = CARD_W - 14, ih = CARD_H - 14;
  roundedRect(ctx, ix, iy, iw, ih, 4);
  ctx.fillStyle = '#7a1420';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(240,200,140,0.45)';
  ctx.lineWidth = 1;
  for (let d = -ih; d < iw + ih; d += 9) {
    ctx.beginPath(); ctx.moveTo(ix + d, iy); ctx.lineTo(ix + d - ih, iy + ih); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ix + d - ih, iy); ctx.lineTo(ix + d, iy + ih); ctx.stroke();
  }
  ctx.restore();
  // Centre medallion
  ctx.beginPath();
  ctx.ellipse(CARD_W / 2, CARD_H / 2, 22, 30, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#7a1420';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#e8c66a';
  ctx.stroke();
  // Gold spade in the medallion.
  ctx.save();
  ctx.translate(CARD_W / 2, CARD_H / 2);
  ctx.fillStyle = '#e8c66a';
  ctx.beginPath();
  ctx.save(); ctx.translate(0, -0.06 * 26); ctx.scale(1, -0.9); heartPath(ctx, 26); ctx.restore();
  stemPath(ctx, 26);
  ctx.fill();
  ctx.restore();
  backCache = c;
  return c;
}

/** Places a card with a soft shadow; `dim`/`glow` mark discards and keeps. */
function placeCard(
  ctx: SKRSContext2D, x: number, y: number, face: Canvas,
  opts: { dim?: boolean; glow?: boolean; shadow?: string } = {},
) {
  ctx.save();
  ctx.shadowColor = opts.shadow ?? 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 3;
  ctx.drawImage(face, x, y);
  ctx.restore();
  if (opts.dim) {
    roundedRect(ctx, x, y, CARD_W, CARD_H, RADIUS);
    ctx.fillStyle = 'rgba(10,20,15,0.5)';
    ctx.fill();
  }
  if (opts.glow) {
    roundedRect(ctx, x - 2, y - 2, CARD_W + 4, CARD_H + 4, RADIUS + 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = PALETTE.gold;
    ctx.stroke();
  }
}

export interface HandRow {
  label: string;
  cards: Card[];
  /** Index-aligned flags: dim (not held) / glow (held or winning). */
  dim?: boolean[];
  glow?: boolean[];
  /** Render the card at this index face-down (dealer's hole card). */
  hideFrom?: number;
  /** Small text after the label, e.g. the hand value. */
  note?: string;
}

/** Card x positions for a row, overlapped like a dealt hand if `fan`. */
function rowLayout(n: number, W: number, fan: boolean, maxW: number): number[] {
  const step = fan ? Math.min(66, (maxW - CARD_W) / Math.max(n - 1, 1)) : CARD_W + 12;
  const width = CARD_W + step * Math.max(n - 1, 0);
  const x0 = (W - width) / 2;
  return Array.from({ length: n }, (_, i) => x0 + i * step);
}

/** Dark value pill (e.g. "17") with a gold rim, sat beside a hand label. */
function valuePill(ctx: SKRSContext2D, text: string, x: number, y: number) {
  ctx.save();
  ctx.font = `20px ${FONT.sign}`;
  const w = Math.max(34, ctx.measureText(text).width + 18);
  roundedRect(ctx, x, y - 13, w, 26, 13);
  ctx.fillStyle = 'rgba(8,20,12,0.82)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = PALETTE.gold;
  ctx.stroke();
  ctx.fillStyle = PALETTE.cream;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + 1);
  ctx.restore();
}

function rowLabel(ctx: SKRSContext2D, row: HandRow, W: number, y: number) {
  ctx.save();
  ctx.font = `20px ${FONT.sign}`;
  ctx.letterSpacing = '3px';
  const label = row.label.toUpperCase();
  const lw = ctx.measureText(label).width;
  ctx.restore();
  const pillW = row.note ? 50 : 0;
  const x = W / 2 - (lw + (row.note ? pillW + 10 : 0)) / 2;
  goldText(ctx, label, x, y, 20, { align: 'left', spacing: 3 });
  if (row.note) valuePill(ctx, row.note, x + lw + 10, y);
}

/** Blackjack table: dealer across the top, player at the bottom, rules printed between. */
function renderFelt(rows: HandRow[], title: string, footer?: string): Buffer {
  const W = 640;
  const LABEL_H = 34;
  const ROW_H = LABEL_H + CARD_H + 14;
  const PRINT_H = rows.length > 1 ? 96 : 54;
  const H = 20 + rows.length * ROW_H + PRINT_H + (footer ? 40 : 0);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawFelt(ctx, W, H);

  const name = plainTitle(title).toUpperCase();
  const drawRow = (row: HandRow, cardsY: number, labelY: number) => {
    rowLabel(ctx, row, W, labelY);
    const xs = rowLayout(row.cards.length, W, true, W - 80);
    row.cards.forEach((card, i) => {
      const hidden = row.hideFrom !== undefined && i >= row.hideFrom;
      placeCard(ctx, xs[i]!, cardsY, hidden ? cardBack() : cardFace(card), {
        dim: row.dim?.[i], glow: row.glow?.[i],
      });
    });
  };

  if (rows.length > 1) {
    // Dealer side: label above the cards.
    drawRow(rows[0]!, 20 + LABEL_H, 20 + LABEL_H / 2);
    // Table print: concentric arcs centred far above the canvas.
    const midY = 20 + ROW_H + PRINT_H / 2;
    const R = 900;
    const arcCY = midY - R;
    ctx.save();
    ctx.strokeStyle = 'rgba(232,198,106,0.55)';
    ctx.lineWidth = 1.5;
    for (const dr of [-30, 34]) {
      ctx.beginPath();
      ctx.arc(W / 2, arcCY, R + dr, Math.PI / 2 - 0.3, Math.PI / 2 + 0.3);
      ctx.stroke();
    }
    ctx.restore();
    arcText(ctx, `${name} PAYS 3 TO 2`, W / 2, arcCY, R - 8, 24, PALETTE.gold, { flip: true });
    arcText(ctx, 'DEALER STANDS ON ALL 17s', W / 2, arcCY, R + 18, 15, 'rgba(246,241,228,0.8)', { flip: true });
    // Player side: label below the cards.
    for (const [i, row] of rows.slice(1).entries()) {
      const top = 20 + ROW_H + PRINT_H + i * ROW_H;
      drawRow(row, top, top + CARD_H + 22);
    }
  } else {
    goldText(ctx, name, W / 2, 20 + PRINT_H / 2, 30, { spacing: 4 });
    drawRow(rows[0]!, 20 + PRINT_H + LABEL_H, 20 + PRINT_H + LABEL_H / 2);
  }

  if (footer) goldText(ctx, footer, W / 2, H - 24, 22, { spacing: 1 });
  // JPEG, not PNG: the felt grain is incompressible noise to PNG (~530 KB vs
  // ~70 KB), and a fresh table is uploaded on every hit/stand.
  return canvas.toBuffer('image/jpeg', 90) as unknown as Buffer;
}

/**
 * Video poker cabinet screen: royal-blue CRT, yellow title, HELD tags over
 * kept cards — the look of a real bar-top machine rather than a felt table.
 */
function renderMachine(rows: HandRow[], title: string, footer?: string): Buffer {
  const row = rows[0]!;
  const n = Math.max(row.cards.length, 1);
  const GAP = 12;
  const W = Math.max(n * CARD_W + (n - 1) * GAP + 64, 420);
  const H = 300 + (footer ? 34 : 0);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createRadialGradient(W / 2, H * 0.45, 40, W / 2, H / 2, W * 0.75);
  bg.addColorStop(0, '#1d3fd1');
  bg.addColorStop(1, '#071a6b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // CRT scanlines
  ctx.fillStyle = 'rgba(0,0,30,0.16)';
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);

  // Title: yellow with a red drop, like machine attract-mode text.
  ctx.save();
  ctx.font = `38px ${FONT.sign}`;
  ctx.letterSpacing = '4px';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c40d1d';
  ctx.fillText(plainTitle(title).toUpperCase(), W / 2 + 2, 38);
  ctx.fillStyle = '#ffe14d';
  ctx.fillText(plainTitle(title).toUpperCase(), W / 2, 35);
  ctx.restore();

  const holdPhase = row.dim !== undefined;
  const x0 = (W - (n * CARD_W + (n - 1) * GAP)) / 2;
  const cardsY = 100;
  row.cards.forEach((card, i) => {
    const x = x0 + i * (CARD_W + GAP);
    placeCard(ctx, x, cardsY, cardFace(card), { shadow: 'rgba(0,0,20,0.6)' });
    if (holdPhase && row.glow?.[i]) {
      ctx.save();
      ctx.font = `24px ${FONT.sign}`;
      ctx.letterSpacing = '3px';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowOffsetY = 2;
      ctx.fillText('HELD', x + CARD_W / 2 + 2, cardsY - 20);
      ctx.restore();
    }
    // Card position number under each card, as on the machine's button row.
    ctx.save();
    ctx.font = `16px ${FONT.sign}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,225,77,0.7)';
    ctx.fillText(String(i + 1), x + CARD_W / 2, cardsY + CARD_H + 20);
    ctx.restore();
  });

  if (footer) {
    ctx.save();
    ctx.font = `26px ${FONT.sign}`;
    ctx.letterSpacing = '2px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#c40d1d';
    ctx.fillText(footer.toUpperCase(), W / 2 + 2, H - 30);
    ctx.fillStyle = '#ffe14d';
    ctx.fillText(footer.toUpperCase(), W / 2, H - 32);
    ctx.restore();
  }
  return canvas.toBuffer('image/png') as unknown as Buffer;
}

/**
 * Renders one or two hands as a table image. Blackjack uses the felt table
 * (dealer/player rows); video poker uses the machine screen. Static PNG —
 * these games are interactive, so a frame is drawn per decision rather than
 * baking one animation up front.
 */
export function renderTable(
  rows: HandRow[], title: string, footer?: string, style: 'felt' | 'machine' = 'felt',
): Buffer {
  ensureFonts();
  return style === 'machine' ? renderMachine(rows, title, footer) : renderFelt(rows, title, footer);
}
