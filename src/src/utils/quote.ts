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

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 6): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) continue;
    const words = paragraph.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        if (lines.length >= maxLines) return lines;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) {
      lines.push(line);
      if (lines.length >= maxLines) return lines;
    }
  }
  return lines;
}

export async function generateQuote(opts: {
  text: string;
  authorName: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
}): Promise<Buffer> {
  ensureFonts();

  const { text, authorName, authorUsername, authorAvatarUrl } = opts;

  const W = 750;
  const H = 750;
  const BG = '#0e0e0e';
  const LEFT_W = Math.round(W * 0.44); // avatar column width
  const TEXT_CENTER = LEFT_W + Math.round((W - LEFT_W) / 2); // center of right column
  const TEXT_MAX_W = W - LEFT_W - 48;
  const FONT_SIZE = 34;
  const LINE_H = FONT_SIZE * 1.5;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // Avatar — grayscale, clipped to left column
  if (authorAvatarUrl) {
    try {
      const img = await loadImage(authorAvatarUrl.replace(/\?.*$/, '') + '?size=256');
      const scale = Math.max(LEFT_W / img.width, H / img.height);
      const sw = img.width * scale;
      const sh = img.height * scale;
      const sx = (LEFT_W - sw) / 2;
      const sy = (H - sh) / 2;

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, LEFT_W, H);
      ctx.clip();
      ctx.filter = 'grayscale(1)';
      ctx.drawImage(img, sx, sy, sw, sh);
      ctx.filter = 'none';
      ctx.restore();

      // Fade avatar into background on right edge
      const fade = ctx.createLinearGradient(LEFT_W - 100, 0, LEFT_W + 10, 0);
      fade.addColorStop(0, 'rgba(14,14,14,0)');
      fade.addColorStop(1, BG);
      ctx.fillStyle = fade;
      ctx.fillRect(LEFT_W - 100, 0, 110, H);
    } catch { /* avatar unavailable */ }
  }

  // Quote text — centered in right column
  ctx.textAlign = 'center';
  ctx.font = `${FONT_SIZE}px Ubuntu`;
  ctx.fillStyle = '#ffffff';
  const lines = wrapText(ctx, text.length > 300 ? text.slice(0, 297) + '…' : text, TEXT_MAX_W);
  const blockH = lines.length * LINE_H;
  let textY = (H - blockH - 80) / 2 + FONT_SIZE;
  for (const line of lines) {
    ctx.fillText(line, TEXT_CENTER, textY);
    textY += LINE_H;
  }

  // Author name
  textY += 14;
  ctx.font = `italic 20px Ubuntu`;
  ctx.fillStyle = '#dddddd';
  ctx.fillText(`- ${authorName}`, TEXT_CENTER, textY);

  // Username handle
  textY += 28;
  ctx.font = `15px Ubuntu`;
  ctx.fillStyle = '#777777';
  ctx.fillText(`@${authorUsername}`, TEXT_CENTER, textY);

  // Watermark
  ctx.textAlign = 'right';
  ctx.font = `12px Ubuntu`;
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillText('Make it a Quote', W - 14, H - 14);

  return Buffer.from(canvas.toBuffer('image/png'));
}
