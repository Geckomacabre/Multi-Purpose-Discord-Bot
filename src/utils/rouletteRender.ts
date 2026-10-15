import { createCanvas, SKRSContext2D, Canvas } from '@napi-rs/canvas';
import { ensureFonts, drawFelt, encodeGif, grabFrame, brass, drawPlate, FONT, PALETTE } from './casinoRender.js';

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
// European wheel order with the zero removed (the game has no zero pocket).
// Zero sat between 26 and 32, so red/black still alternate all the way round.
const ORDER = [
  32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const N = ORDER.length;
const SEG = (Math.PI * 2) / N;

const W = 440;
const H = 500;
const CX = W / 2;
const CY = 218;

// Radii, outside in
const R_RIM = 208;       // wooden bowl rim
const R_TRACK = 190;     // ball track (outer edge)
const R_SLOPE = 166;     // track meets the rotor
const R_NUM = 150;       // number ring outer edge (rotor starts here)
const R_POCKET = 124;    // pockets outer edge
const R_CONE = 100;      // pockets inner edge / cone
const BALL_TRACK = 178;
const BALL_POCKET = 112;
const BALL_R = 7;

const FPS = 25;
const SPIN_FRAMES = 60;
const HOLD_FRAMES = 22;

const pocketColor = (n: number) => (RED.has(n) ? '#b3202a' : '#17181b');

let bowl: Canvas | null = null;
let rotor: Canvas | null = null;

/** Static parts: felt, wooden rim, ball track and the deflector diamonds. */
function buildBowl(): Canvas {
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  drawFelt(ctx, W, H);

  // Drop shadow under the wheel
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  ctx.beginPath();
  ctx.arc(CX, CY, R_RIM, 0, Math.PI * 2);
  ctx.fillStyle = '#2a1406';
  ctx.fill();
  ctx.restore();

  // Wooden rim with grain rings
  const rim = ctx.createRadialGradient(CX - 60, CY - 80, 20, CX, CY, R_RIM);
  rim.addColorStop(0, '#9a5a2a');
  rim.addColorStop(0.85, '#5a2e10');
  rim.addColorStop(1, '#2d1405');
  ctx.beginPath();
  ctx.arc(CX, CY, R_RIM, 0, Math.PI * 2);
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,12,2,0.35)';
  ctx.lineWidth = 1;
  for (let r = R_TRACK + 3; r < R_RIM - 2; r += 3.5) {
    ctx.beginPath();
    ctx.arc(CX, CY, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Ball track: polished, darker, with a highlight ring
  ctx.beginPath();
  ctx.arc(CX, CY, R_TRACK, 0, Math.PI * 2);
  const track = ctx.createRadialGradient(CX, CY, R_SLOPE, CX, CY, R_TRACK);
  track.addColorStop(0, '#1a0c04');
  track.addColorStop(0.6, '#4a2410');
  track.addColorStop(1, '#2a1306');
  ctx.fillStyle = track;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(CX, CY, R_TRACK - 4, Math.PI * 1.1, Math.PI * 1.65);
  ctx.strokeStyle = 'rgba(255,220,170,0.25)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Brass deflectors on the slope
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const r = (R_SLOPE + R_TRACK) / 2 - 4;
    ctx.save();
    ctx.translate(CX + Math.cos(a) * r, CY + Math.sin(a) * r);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(-7, 0); ctx.lineTo(0, -4); ctx.lineTo(7, 0); ctx.lineTo(0, 4);
    ctx.closePath();
    ctx.fillStyle = brass(ctx, -7, -4, 7, 4);
    ctx.fill();
    ctx.restore();
  }

  // Shadow cast by the rim onto the rotor edge
  ctx.beginPath();
  ctx.arc(CX, CY, R_SLOPE, 0, Math.PI * 2);
  ctx.fillStyle = '#0d0603';
  ctx.fill();
  return c;
}

/** The spinning rotor (numbers, pockets, frets, cone, turret) drawn at rest. */
function buildRotor(): Canvas {
  const S = R_NUM * 2 + 4;
  const c = createCanvas(S, S);
  const ctx = c.getContext('2d');
  const o = S / 2;

  for (let i = 0; i < N; i++) {
    const a0 = i * SEG - SEG / 2 - Math.PI / 2;
    const a1 = a0 + SEG;
    // Number ring segment
    ctx.beginPath();
    ctx.arc(o, o, R_NUM, a0, a1);
    ctx.arc(o, o, R_POCKET, a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = pocketColor(ORDER[i]!);
    ctx.fill();
    // Pocket (deeper, so darker)
    ctx.beginPath();
    ctx.arc(o, o, R_POCKET, a0, a1);
    ctx.arc(o, o, R_CONE, a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = RED.has(ORDER[i]!) ? '#7a1018' : '#0b0b0d';
    ctx.fill();
  }

  // Numbers, reading outward
  ctx.font = `17px ${FONT.sign}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f6f1e4';
  for (let i = 0; i < N; i++) {
    const a = i * SEG - Math.PI / 2;
    const r = (R_NUM + R_POCKET) / 2;
    ctx.save();
    ctx.translate(o + Math.cos(a) * r, o + Math.sin(a) * r);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(String(ORDER[i]), 0, 1);
    ctx.restore();
  }

  // Brass frets between pockets and rings around them
  ctx.strokeStyle = '#d8b25a';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < N; i++) {
    const a = i * SEG - SEG / 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(o + Math.cos(a) * R_CONE, o + Math.sin(a) * R_CONE);
    ctx.lineTo(o + Math.cos(a) * R_POCKET, o + Math.sin(a) * R_POCKET);
    ctx.stroke();
  }
  for (const r of [R_POCKET, R_CONE, R_NUM - 1]) {
    ctx.beginPath();
    ctx.arc(o, o, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Wooden cone
  ctx.beginPath();
  ctx.arc(o, o, R_CONE, 0, Math.PI * 2);
  const cone = ctx.createRadialGradient(o - 25, o - 30, 8, o, o, R_CONE);
  cone.addColorStop(0, '#b07a42');
  cone.addColorStop(0.6, '#6e4019');
  cone.addColorStop(1, '#3a1d08');
  ctx.fillStyle = cone;
  ctx.fill();

  // Brass turret: four arms with ball ends around a domed hub
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    const ex = o + Math.cos(a) * 44, ey = o + Math.sin(a) * 44;
    ctx.beginPath();
    ctx.moveTo(o, o);
    ctx.lineTo(ex, ey);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#a07a2c';
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#f0d488';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ex, ey, 6, 0, Math.PI * 2);
    const knob = ctx.createRadialGradient(ex - 2, ey - 2, 0.5, ex, ey, 6);
    knob.addColorStop(0, '#fff3c4');
    knob.addColorStop(1, '#8a6420');
    ctx.fillStyle = knob;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(o, o, 15, 0, Math.PI * 2);
  const hub = ctx.createRadialGradient(o - 5, o - 6, 1, o, o, 15);
  hub.addColorStop(0, '#fff3c4');
  hub.addColorStop(0.5, '#d8b25a');
  hub.addColorStop(1, '#6b4e17');
  ctx.fillStyle = hub;
  ctx.fill();
  return c;
}

function drawBall(ctx: SKRSContext2D, angle: number, r: number) {
  const x = CX + Math.cos(angle - Math.PI / 2) * r;
  const y = CY + Math.sin(angle - Math.PI / 2) * r;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetX = 1.5;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.arc(x, y, BALL_R, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(x - 2.5, y - 2.5, 0.5, x, y, BALL_R);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.6, '#ece6d8');
  g.addColorStop(1, '#a9a294');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

/** Brass result plaque: coloured number chip plus the colour name. */
function drawResult(ctx: SKRSContext2D, result: number) {
  const y = H - 46;
  drawPlate(ctx, CX + 24, y, 170, 44, RED.has(result) ? 'RED' : 'BLACK', 26);
  // Number chip overlapping the plate's left end
  const cx = CX - 70;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.arc(cx, y, 30, 0, Math.PI * 2);
  ctx.fillStyle = pocketColor(result);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = PALETTE.gold;
  ctx.stroke();
  ctx.font = `30px ${FONT.sign}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(result), cx, y + 2);
}

function renderFrames(result: number): Buffer[] {
  bowl ??= buildBowl();
  rotor ??= buildRotor();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const frames: Buffer[] = [];

  const idx = ORDER.indexOf(result);
  // Rotor angle that puts the result pocket at the top when the spin ends.
  const finalRot = -idx * SEG;
  const wheelTurns = 1.5;   // rotor turns before settling
  const ballTurns = 7;      // ball laps (opposite direction), slowing faster

  const total = SPIN_FRAMES + HOLD_FRAMES;
  for (let i = 0; i < total; i++) {
    const t = Math.min(1, i / SPIN_FRAMES);
    const wheelEase = 1 - Math.pow(1 - t, 2);
    const ballEase = 1 - Math.pow(1 - t, 3.2);
    const rot = finalRot - (1 - wheelEase) * wheelTurns * Math.PI * 2;

    ctx.drawImage(bowl, 0, 0);
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(rot);
    ctx.drawImage(rotor, -rotor.width / 2, -rotor.height / 2);
    ctx.restore();

    // The ball laps the track, then drops into the rotor and rides the result
    // pocket. `pocketAngle` is where that pocket is right now (0 = top).
    const pocketAngle = rot + idx * SEG;
    const orbit = (1 - ballEase) * ballTurns * Math.PI * 2;
    const DROP = 0.62, LOCK = 0.82;
    let angle: number, radius: number;
    if (t < DROP) {
      angle = orbit;
      radius = BALL_TRACK;
    } else {
      const p = Math.min(1, (t - DROP) / (LOCK - DROP));
      const w = p * p * (3 - 2 * p);
      angle = orbit * (1 - w) + pocketAngle * w;
      // Falls inward, rattling over a couple of frets on the way.
      const bounce = Math.abs(Math.sin(p * Math.PI * 3)) * (1 - p) * 10;
      radius = BALL_POCKET + (BALL_TRACK - BALL_POCKET) * Math.pow(1 - p, 2) + bounce;
    }
    drawBall(ctx, angle, radius);

    if (i >= SPIN_FRAMES) drawResult(ctx, result);
    frames.push(grabFrame(canvas));
  }
  return frames;
}

/** How long the wheel spins before the ball settles into its pocket. */
export const ROULETTE_REVEAL_MS = Math.round((SPIN_FRAMES / FPS) * 1000);

/** Animated roulette: wheel + ball spin and settle on `result` (1–36). */
export async function renderRouletteGif(result: number): Promise<Buffer> {
  ensureFonts();
  return encodeGif(renderFrames(result), { fps: FPS, colors: 128, width: W, height: H });
}
