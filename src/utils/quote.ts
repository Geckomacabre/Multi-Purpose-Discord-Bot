import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.resolve(__dirname, '../../assets/fonts');

let fontsRegistered = false;
function ensureFonts() {
  if (fontsRegistered) return;
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Ubuntu.ttf'), 'Ubuntu');
  fontsRegistered = true;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) { lines.push(''); continue; }
    const words = paragraph.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export async function generateQuote(opts: {
  text: string;
  authorName: string;
  authorAvatarUrl: string | null;
  guildName?: string;
}): Promise<Buffer> {
  ensureFonts();

  const { text, authorName, authorAvatarUrl, guildName } = opts;
  const WIDTH = 820;
  const PADDING = 64;
  const FONT_SIZE = 26;
  const LINE_HEIGHT = FONT_SIZE * 1.55;
  const AVATAR_SIZE = 52;

  // Measure wrapped lines
  const probe = createCanvas(WIDTH, 100).getContext('2d');
  probe.font = `${FONT_SIZE}px Ubuntu`;
  const displayText = text.length > 800 ? text.slice(0, 797) + '…' : text;
  const lines = wrapText(probe, displayText, WIDTH - PADDING * 2);

  const textBlockHeight = lines.length * LINE_HEIGHT;
  const HEIGHT = Math.max(260, PADDING + 60 + textBlockHeight + PADDING + 20 + AVATAR_SIZE + PADDING);

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, '#1a1a2e');
  bg.addColorStop(1, '#0f3460');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Accent left bar
  ctx.fillStyle = '#e94560';
  ctx.fillRect(0, 0, 6, HEIGHT);

  // Decorative opening quote mark
  ctx.font = `bold 110px Ubuntu`;
  ctx.fillStyle = 'rgba(233, 69, 96, 0.25)';
  ctx.fillText('“', PADDING - 8, PADDING + 68);

  // Quote text
  ctx.font = `${FONT_SIZE}px Ubuntu`;
  ctx.fillStyle = '#f0f0f0';
  let y = PADDING + 72;
  for (const line of lines) {
    ctx.fillText(line, PADDING, y);
    y += LINE_HEIGHT;
  }

  // Divider
  const divY = HEIGHT - PADDING - AVATAR_SIZE - 16;
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING, divY);
  ctx.lineTo(WIDTH - PADDING, divY);
  ctx.stroke();

  // Avatar (circular)
  const avX = PADDING;
  const avY = divY + 14;
  if (authorAvatarUrl) {
    try {
      const img = await loadImage(authorAvatarUrl + '?size=64');
      ctx.save();
      ctx.beginPath();
      ctx.arc(avX + AVATAR_SIZE / 2, avY + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, avX, avY, AVATAR_SIZE, AVATAR_SIZE);
      ctx.restore();
    } catch { /* avatar unavailable */ }
  }

  const textX = avX + (authorAvatarUrl ? AVATAR_SIZE + 14 : 0);

  ctx.font = `bold 18px Ubuntu`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`— ${authorName}`, textX, avY + 22);

  if (guildName) {
    ctx.font = `14px Ubuntu`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(guildName, textX, avY + 42);
  }

  return Buffer.from(canvas.toBuffer('image/png'));
}
