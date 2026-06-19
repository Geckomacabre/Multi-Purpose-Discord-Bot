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
  const H = 375;
  const BG = '#0e0e0e';
  const LEFT_W = Math.round(W * 0.44); // avatar column
  const TEXT_X = LEFT_W + 36;
  const TEXT_MAX_W = W - TEXT_X - 36;
  const FONT_SIZE = 30;
  const LINE_H = FONT_SIZE * 1.45;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // Avatar — clipped to left column
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
      ctx.drawImage(img, sx, sy, sw, sh);
      ctx.restore();

      // Fade avatar into background on right edge
      const fade = ctx.createLinearGradient(LEFT_W - 90, 0, LEFT_W + 10, 0);
      fade.addColorStop(0, 'rgba(14,14,14,0)');
      fade.addColorStop(1, BG);
      ctx.fillStyle = fade;
      ctx.fillRect(LEFT_W - 90, 0, 100, H);
    } catch { /* avatar unavailable */ }
  }

  // Quote text
  ctx.font = `bold ${FONT_SIZE}px Ubuntu`;
  ctx.fillStyle = '#ffffff';
  const lines = wrapText(ctx, text.length > 300 ? text.slice(0, 297) + '…' : text, TEXT_MAX_W);
  const blockH = lines.length * LINE_H;
  let textY = (H - blockH - 70) / 2 + FONT_SIZE;
  for (const line of lines) {
    ctx.fillText(line, TEXT_X, textY);
    textY += LINE_H;
  }

  // Author name
  textY += 10;
  ctx.font = `italic 18px Ubuntu`;
  ctx.fillStyle = '#dddddd';
  ctx.fillText(`- ${authorName}`, TEXT_X, textY);

  // Username handle
  textY += 24;
  ctx.font = `14px Ubuntu`;
  ctx.fillStyle = '#777777';
  ctx.fillText(`@${authorUsername}`, TEXT_X, textY);

  // Watermark
  ctx.font = `11px Ubuntu`;
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  const watermark = 'Make it a Quote';
  ctx.fillText(watermark, W - ctx.measureText(watermark).width - 14, H - 12);

  return Buffer.from(canvas.toBuffer('image/png'));
}
