import sharp from 'sharp';
import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';
import path from 'path';
import { ASSETS_DIR, FONTS_DIR, IMAGES_DIR } from './index';

let fontsLoaded = false;
function ensureFonts() {
  if (fontsLoaded) return;
  fontsLoaded = true;
  const fontFiles: Array<[string, string]> = [
    ['caption.otf', 'Caption'],
    ['caption2.ttf', 'Caption2'],
    ['Ubuntu.ttf', 'Ubuntu'],
    ['Circular.ttf', 'Circular'],
    ['hbc.ttf', 'HBC'],
    ['reddit.ttf', 'Reddit'],
    ['whisper.otf', 'Whisper'],
  ];
  for (const [file, name] of fontFiles) {
    try { GlobalFonts.registerFromPath(path.join(FONTS_DIR, file), name); } catch {}
  }
}

async function loadAsset(name: string): Promise<Buffer> {
  return Bun.file(path.join(IMAGES_DIR, name)).bytes().then(b => Buffer.from(b));
}

interface FrameInfo { width: number; height: number; pages: number; delays: number[] }

async function getFrameInfo(buffer: Buffer): Promise<FrameInfo> {
  const meta = await sharp(buffer, { animated: true }).metadata();
  const pages = meta.pages ?? 1;
  const delays = (meta.delay as number[] | undefined) ?? Array(pages).fill(50);
  return { width: meta.width ?? 0, height: Math.round((meta.height ?? 0) / pages), pages, delays };
}

async function extractFrames(buffer: Buffer, info: FrameInfo): Promise<Buffer[]> {
  const frames: Buffer[] = [];
  for (let i = 0; i < info.pages; i++) {
    const frame = await sharp(buffer, { animated: false, page: i })
      .ensureAlpha().toBuffer();
    frames.push(frame);
  }
  return frames;
}

async function buildAnimatedGif(frames: Buffer[], width: number, height: number, delay: number | number[]): Promise<Buffer> {
  const delays = typeof delay === 'number' ? Array(frames.length).fill(delay) : delay;
  const composite = frames.map((f, i) => ({ input: f, left: 0, top: i * height }));
  const totalH = height * frames.length;
  const base = sharp({
    create: { width, height: totalH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(composite);
  return (base.gif({ delay: delays, loop: 0 }) as any).withMetadata({ pageHeight: height }).toBuffer();
}

async function processEachFrame(
  buffer: Buffer,
  fn: (frame: Buffer, w: number, h: number, i: number) => Promise<Buffer>
): Promise<Buffer> {
  const info = await getFrameInfo(buffer);
  const frames = await extractFrames(buffer, info);
  const processed = await Promise.all(frames.map((f, i) => fn(f, info.width, info.height, i)));
  if (info.pages === 1) return processed[0]!;
  return buildAnimatedGif(processed, info.width, info.height, info.delays);
}

// ─── Simple sharp effects ────────────────────────────────────────────────────

export async function blur(buffer: Buffer): Promise<Buffer> {
  return processEachFrame(buffer, async (f, w, h) =>
    sharp(f, { raw: { width: w, height: h, channels: 4 } }).blur(10).png().toBuffer()
  );
}

export async function sharpenEffect(buffer: Buffer): Promise<Buffer> {
  return processEachFrame(buffer, async (f, w, h) =>
    sharp(f, { raw: { width: w, height: h, channels: 4 } }).sharpen({ sigma: 3 }).png().toBuffer()
  );
}

export async function grayscale(buffer: Buffer): Promise<Buffer> {
  return processEachFrame(buffer, async (f, w, h) =>
    sharp(f, { raw: { width: w, height: h, channels: 4 } }).grayscale().png().toBuffer()
  );
}

export async function invert(buffer: Buffer): Promise<Buffer> {
  return processEachFrame(buffer, async (f, w, h) =>
    sharp(f, { raw: { width: w, height: h, channels: 4 } }).negate({ alpha: false }).png().toBuffer()
  );
}

export async function sepia(buffer: Buffer): Promise<Buffer> {
  return processEachFrame(buffer, async (f, w, h) =>
    sharp(f, { raw: { width: w, height: h, channels: 4 } })
      .recomb([
        [0.393, 0.769, 0.189],
        [0.349, 0.686, 0.168],
        [0.272, 0.534, 0.131],
      ]).png().toBuffer()
  );
}

export async function hue(buffer: Buffer, degrees: number): Promise<Buffer> {
  return processEachFrame(buffer, async (f, w, h) =>
    sharp(f, { raw: { width: w, height: h, channels: 4 } })
      .modulate({ hue: degrees }).png().toBuffer()
  );
}

export async function flip(buffer: Buffer): Promise<Buffer> {
  return processEachFrame(buffer, async (f, w, h) =>
    sharp(f, { raw: { width: w, height: h, channels: 4 } }).flip().png().toBuffer()
  );
}

export async function flop(buffer: Buffer): Promise<Buffer> {
  return processEachFrame(buffer, async (f, w, h) =>
    sharp(f, { raw: { width: w, height: h, channels: 4 } }).flop().png().toBuffer()
  );
}

export async function rotate(buffer: Buffer, degrees: number): Promise<Buffer> {
  return processEachFrame(buffer, async (f, w, h) =>
    sharp(f, { raw: { width: w, height: h, channels: 4 } })
      .rotate(degrees, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
  );
}

export async function crop(buffer: Buffer): Promise<Buffer> {
  return processEachFrame(buffer, async (f, w, h) => {
    const size = Math.min(w, h);
    const left = Math.floor((w - size) / 2);
    const top = Math.floor((h - size) / 2);
    return sharp(f, { raw: { width: w, height: h, channels: 4 } })
      .extract({ left, top, width: size, height: size }).png().toBuffer();
  });
}

export async function circle(buffer: Buffer): Promise<Buffer> {
  return processEachFrame(buffer, async (f, w, h) => {
    const size = Math.min(w, h);
    const mask = Buffer.from(
      `<svg><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" /></svg>`
    );
    const left = Math.floor((w - size) / 2);
    const top = Math.floor((h - size) / 2);
    return sharp(f, { raw: { width: w, height: h, channels: 4 } })
      .extract({ left, top, width: size, height: size })
      .composite([{ input: mask, blend: 'dest-in' }])
      .png().toBuffer();
  });
}

export async function jpeg(buffer: Buffer): Promise<Buffer> {
  return processEachFrame(buffer, async (f, w, h) =>
    sharp(f, { raw: { width: w, height: h, channels: 4 } })
      .jpeg({ quality: 1 }).toBuffer()
  );
}

export async function pixelate(buffer: Buffer, amount = 16): Promise<Buffer> {
  return processEachFrame(buffer, async (f, w, h) => {
    const small = Math.max(1, Math.round(w / amount));
    const smallH = Math.max(1, Math.round(h / amount));
    return sharp(f, { raw: { width: w, height: h, channels: 4 } })
      .resize(small, smallH, { kernel: 'nearest' })
      .resize(w, h, { kernel: 'nearest' })
      .png().toBuffer();
  });
}

export async function tile(buffer: Buffer): Promise<Buffer> {
  const info = await getFrameInfo(buffer);
  const frames = await extractFrames(buffer, info);
  const processed = await Promise.all(frames.map(async (f) => {
    const w = info.width; const h = info.height;
    const half = await sharp(f, { raw: { width: w, height: h, channels: 4 } })
      .resize(Math.floor(w / 2), Math.floor(h / 2)).toBuffer();
    const hw = Math.floor(w / 2); const hh = Math.floor(h / 2);
    return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } } })
      .composite([
        { input: half, left: 0, top: 0 },
        { input: half, left: hw, top: 0 },
        { input: half, left: 0, top: hh },
        { input: half, left: hw, top: hh },
      ]).png().toBuffer();
  }));
  if (info.pages === 1) return processed[0]!;
  return buildAnimatedGif(processed, info.width, info.height, info.delays);
}

export async function deepfry(buffer: Buffer): Promise<Buffer> {
  return processEachFrame(buffer, async (f, w, h) => {
    const { data, info: ri } = await sharp(f, { raw: { width: w, height: h, channels: 4 } })
      .raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, (data[i]! * 1.3 - 76.5) * 1.5));
      data[i + 1] = Math.min(255, Math.max(0, (data[i + 1]! * 1.3 - 76.5) * 1.5));
      data[i + 2] = Math.min(255, Math.max(0, (data[i + 2]! * 1.3 - 76.5) * 1.5));
    }
    return sharp(data, { raw: { width: ri.width, height: ri.height, channels: 4 } })
      .jpeg({ quality: 1 }).toBuffer();
  });
}

export async function wide(buffer: Buffer): Promise<Buffer> {
  return processEachFrame(buffer, async (f, w, h) =>
    sharp(f, { raw: { width: w, height: h, channels: 4 } })
      .resize(Math.min(Math.round(w * 2.5), 4096), h).png().toBuffer()
  );
}

export async function squish(buffer: Buffer): Promise<Buffer> {
  return processEachFrame(buffer, async (f, w, h) =>
    sharp(f, { raw: { width: w, height: h, channels: 4 } })
      .resize(w, Math.round(h * 0.4)).png().toBuffer()
  );
}

export async function stretch(buffer: Buffer): Promise<Buffer> {
  return processEachFrame(buffer, async (f, w, h) =>
    sharp(f, { raw: { width: w, height: h, channels: 4 } })
      .resize(512, 512).png().toBuffer()
  );
}

export async function vignette(buffer: Buffer): Promise<Buffer> {
  const vigAsset = await loadAsset('vignette.png');
  return processEachFrame(buffer, async (f, w, h) => {
    const vig = await sharp(vigAsset).resize(w, h).ensureAlpha().toBuffer();
    return sharp(f, { raw: { width: w, height: h, channels: 4 } })
      .composite([{ input: vig, blend: 'multiply' }]).png().toBuffer();
  });
}

export async function watermark(buffer: Buffer, watermarkName: string): Promise<Buffer> {
  const wmAsset = await loadAsset(watermarkName);
  return processEachFrame(buffer, async (f, w, h) => {
    const wm = await sharp(wmAsset).resize(Math.round(w * 0.3)).toBuffer();
    return sharp(f, { raw: { width: w, height: h, channels: 4 } })
      .composite([{ input: wm, gravity: 'southeast' }]).png().toBuffer();
  });
}

export async function wall(buffer: Buffer): Promise<Buffer> {
  return processEachFrame(buffer, async (f, w, h) => {
    const tiles = 4;
    const tw = Math.floor(w / tiles);
    const th = Math.floor(h / tiles);
    const small = await sharp(f, { raw: { width: w, height: h, channels: 4 } })
      .resize(tw, th).toBuffer();
    const composites = [];
    for (let row = 0; row < tiles; row++) {
      for (let col = 0; col < tiles; col++) {
        composites.push({ input: small, left: col * tw, top: row * th });
      }
    }
    return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } } })
      .composite(composites).png().toBuffer();
  });
}

// ─── Mirror effects (haah/hooh/waaw/woow) ───────────────────────────────────

export async function mirror(buffer: Buffer, mode: 'haah' | 'hooh' | 'waaw' | 'woow'): Promise<Buffer> {
  return processEachFrame(buffer, async (f, w, h) => {
    const img = sharp(f, { raw: { width: w, height: h, channels: 4 } });
    if (mode === 'haah') {
      const half = await img.extract({ left: 0, top: 0, width: Math.floor(w / 2), height: h }).toBuffer();
      const flipped = await sharp(half).flop().toBuffer();
      return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } } })
        .composite([{ input: half, left: 0, top: 0 }, { input: flipped, left: Math.floor(w / 2), top: 0 }])
        .png().toBuffer();
    } else if (mode === 'woow') {
      const half = await img.extract({ left: Math.floor(w / 2), top: 0, width: Math.floor(w / 2), height: h }).toBuffer();
      const flipped = await sharp(half).flop().toBuffer();
      return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } } })
        .composite([{ input: flipped, left: 0, top: 0 }, { input: half, left: Math.floor(w / 2), top: 0 }])
        .png().toBuffer();
    } else if (mode === 'hooh') {
      const half = await img.extract({ left: 0, top: 0, width: w, height: Math.floor(h / 2) }).toBuffer();
      const flipped = await sharp(half).flip().toBuffer();
      return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } } })
        .composite([{ input: half, left: 0, top: 0 }, { input: flipped, left: 0, top: Math.floor(h / 2) }])
        .png().toBuffer();
    } else {
      const half = await img.extract({ left: 0, top: Math.floor(h / 2), width: w, height: Math.floor(h / 2) }).toBuffer();
      const flipped = await sharp(half).flip().toBuffer();
      return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } } })
        .composite([{ input: flipped, left: 0, top: 0 }, { input: half, left: 0, top: Math.floor(h / 2) }])
        .png().toBuffer();
    }
  });
}

// ─── Distortion effects (pixel-level math) ──────────────────────────────────

export async function swirl(buffer: Buffer): Promise<Buffer> {
  return processEachFrame(buffer, async (f, w, h) => {
    const { data, info: ri } = await sharp(f, { raw: { width: w, height: h, channels: 4 } })
      .raw().toBuffer({ resolveWithObject: true });
    const out = Buffer.alloc(data.length);
    const cx = w / 2; const cy = h / 2;
    const size = Math.sqrt(cx * cx + cy * cy);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx; const dy = y - cy;
        const mag = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const deg = Math.pow(1 - mag / size, 2) * Math.PI;
        const newAngle = angle + deg;
        const srcX = Math.round(cx + mag * Math.cos(newAngle));
        const srcY = Math.round(cy + mag * Math.sin(newAngle));
        const dst = (y * w + x) * 4;
        if (srcX >= 0 && srcX < w && srcY >= 0 && srcY < h) {
          const src = (srcY * w + srcX) * 4;
          out[dst] = data[src]!; out[dst + 1] = data[src + 1]!;
          out[dst + 2] = data[src + 2]!; out[dst + 3] = data[src + 3]!;
        }
      }
    }
    return sharp(out, { raw: { width: ri.width, height: ri.height, channels: 4 } }).png().toBuffer();
  });
}

export async function explode(buffer: Buffer): Promise<Buffer> {
  const mapBuf = await loadAsset('linearexplode.png');
  return processEachFrame(buffer, async (f, w, h) => {
    const { data, info: ri } = await sharp(f, { raw: { width: w, height: h, channels: 4 } }).raw().toBuffer({ resolveWithObject: true });
    const { data: mapData } = await sharp(mapBuf).resize(w, h).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const out = Buffer.alloc(data.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const mi = (y * w + x) * 4;
        const dx = ((mapData[mi]! / 255) * 2 - 1) * (w / 2);
        const dy = ((mapData[mi + 1]! / 255) * 2 - 1) * (h / 2);
        const srcX = Math.round(x + dx); const srcY = Math.round(y + dy);
        const dst = (y * w + x) * 4;
        if (srcX >= 0 && srcX < w && srcY >= 0 && srcY < h) {
          const src = (srcY * w + srcX) * 4;
          out[dst] = data[src]!; out[dst + 1] = data[src + 1]!;
          out[dst + 2] = data[src + 2]!; out[dst + 3] = data[src + 3]!;
        }
      }
    }
    return sharp(out, { raw: { width: ri.width, height: ri.height, channels: 4 } }).png().toBuffer();
  });
}

export async function implode(buffer: Buffer): Promise<Buffer> {
  const mapBuf = await loadAsset('linearimplode.png');
  return processEachFrame(buffer, async (f, w, h) => {
    const { data, info: ri } = await sharp(f, { raw: { width: w, height: h, channels: 4 } }).raw().toBuffer({ resolveWithObject: true });
    const { data: mapData } = await sharp(mapBuf).resize(w, h).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const out = Buffer.alloc(data.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const mi = (y * w + x) * 4;
        const dx = ((mapData[mi]! / 255) * 2 - 1) * (w / 2);
        const dy = ((mapData[mi + 1]! / 255) * 2 - 1) * (h / 2);
        const srcX = Math.round(x + dx); const srcY = Math.round(y + dy);
        const dst = (y * w + x) * 4;
        if (srcX >= 0 && srcX < w && srcY >= 0 && srcY < h) {
          const src = (srcY * w + srcX) * 4;
          out[dst] = data[src]!; out[dst + 1] = data[src + 1]!;
          out[dst + 2] = data[src + 2]!; out[dst + 3] = data[src + 3]!;
        }
      }
    }
    return sharp(out, { raw: { width: ri.width, height: ri.height, channels: 4 } }).png().toBuffer();
  });
}

export async function magik(buffer: Buffer): Promise<Buffer> {
  return processEachFrame(buffer, async (f, w, h) => {
    const size = Math.min(w, h, 350);
    const resized = await sharp(f, { raw: { width: w, height: h, channels: 4 } })
      .resize(size, size).png().toBuffer();
    const small = await sharp(resized).resize(Math.round(size / 2), Math.round(size / 2))
      .modulate({ saturation: 2 }).toBuffer();
    return sharp(small).resize(size, size, { kernel: 'lanczos3' })
      .modulate({ saturation: 3 }).sharpen({ sigma: 3 }).png().toBuffer();
  });
}

export async function flag(buffer: Buffer, flagName: string): Promise<Buffer> {
  const flagAsset = await loadAsset(flagName);
  return processEachFrame(buffer, async (f, w, h) => {
    const flagResized = await sharp(flagAsset).resize(w, h).ensureAlpha().toBuffer();
    const { data: fd } = await sharp(flagResized).raw().toBuffer({ resolveWithObject: true });
    for (let i = 3; i < fd.length; i += 4) fd[i] = Math.round(fd[i]! * 0.5);
    const tinted = await sharp(fd, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
    return sharp(f, { raw: { width: w, height: h, channels: 4 } })
      .composite([{ input: tinted, blend: 'over' }]).png().toBuffer();
  });
}

export async function globe(buffer: Buffer): Promise<Buffer> {
  const sphereMap = await loadAsset('spheremap.png');
  const specDiff = await loadAsset('globespecdiff.png');
  return processEachFrame(buffer, async (f, w, h) => {
    const size = Math.min(w, h);
    const sphere = await sharp(sphereMap).resize(size, size).ensureAlpha().toBuffer();
    const sd = await sharp(specDiff).resize(size, size).ensureAlpha().toBuffer();
    const squareCropped = await sharp(f, { raw: { width: w, height: h, channels: 4 } })
      .resize(size, size).toBuffer();
    return sharp(squareCropped)
      .composite([{ input: sphere, blend: 'multiply' }, { input: sd, blend: 'screen' }])
      .png().toBuffer();
  });
}

// ─── Animation effects ───────────────────────────────────────────────────────

export async function spin(buffer: Buffer): Promise<Buffer> {
  const info = await getFrameInfo(buffer);
  const frame0 = await sharp(buffer, { animated: false, page: 0 }).ensureAlpha().toBuffer();
  const { width: w, height: h } = info;
  const frames: Buffer[] = [];
  const nFrames = info.pages > 1 ? info.pages : 30;
  for (let i = 0; i < nFrames; i++) {
    const angle = (i / nFrames) * 360;
    const src = info.pages > 1
      ? await sharp(buffer, { animated: false, page: i }).ensureAlpha().toBuffer()
      : frame0;
    const rotated = await sharp(src).rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .resize(w, h).png().toBuffer();
    frames.push(rotated);
  }
  return buildAnimatedGif(frames, w, h, info.pages > 1 ? info.delays : 33);
}

export async function bounce(buffer: Buffer): Promise<Buffer> {
  const info = await getFrameInfo(buffer);
  const { width: w, height: h } = info;
  const src = await sharp(buffer, { animated: false, page: 0 }).ensureAlpha().resize(w, h).toBuffer();
  const nFrames = 15;
  const frames: Buffer[] = [];
  for (let i = 0; i < nFrames; i++) {
    const offset = Math.round((h / 2) * (-Math.sin(i * (Math.PI * 2 / nFrames)) + 1) / 2);
    const frm = await sharp({ create: { width: w, height: h, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } } })
      .composite([{ input: src, left: 0, top: offset }]).png().toBuffer();
    frames.push(frm);
  }
  return buildAnimatedGif(frames, w, h, 50);
}

export async function slide(buffer: Buffer): Promise<Buffer> {
  const info = await getFrameInfo(buffer);
  const { width: w, height: h } = info;
  const src = await sharp(buffer, { animated: false, page: 0 }).ensureAlpha().resize(w, h).toBuffer();
  const nFrames = 20;
  const frames: Buffer[] = [];
  for (let i = 0; i < nFrames; i++) {
    const offset = Math.round((i / nFrames) * w) - w;
    const frm = await sharp({ create: { width: w, height: h, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } })
      .composite([{ input: src, left: offset, top: 0 }]).png().toBuffer();
    frames.push(frm);
  }
  return buildAnimatedGif(frames, w, h, 33);
}

export async function reverse(buffer: Buffer): Promise<Buffer> {
  const info = await getFrameInfo(buffer);
  if (info.pages <= 1) return buffer;
  const frames = await extractFrames(buffer, info);
  frames.reverse();
  return buildAnimatedGif(frames, info.width, info.height, [...info.delays].reverse());
}

export async function speed(buffer: Buffer, multiplier: number): Promise<Buffer> {
  const info = await getFrameInfo(buffer);
  if (info.pages <= 1) return buffer;
  const frames = await extractFrames(buffer, info);
  const newDelays = info.delays.map(d => Math.max(20, Math.round(d / multiplier)));
  return buildAnimatedGif(frames, info.width, info.height, newDelays);
}

export async function slow(buffer: Buffer): Promise<Buffer> {
  return speed(buffer, 0.5);
}

export async function freeze(buffer: Buffer): Promise<Buffer> {
  const info = await getFrameInfo(buffer);
  const frames = await extractFrames(buffer, info);
  const last = frames[frames.length - 1]!;
  return last;
}

export async function unfreeze(buffer: Buffer): Promise<Buffer> {
  const info = await getFrameInfo(buffer);
  if (info.pages > 1) return buffer;
  const frames = await extractFrames(buffer, info);
  const reversed = [...frames, ...frames.slice(0, -1).reverse()];
  return buildAnimatedGif(reversed, info.width, info.height, 50);
}

export async function fade(buffer: Buffer): Promise<Buffer> {
  const info = await getFrameInfo(buffer);
  const { width: w, height: h } = info;
  const src = await sharp(buffer, { animated: false, page: 0 }).ensureAlpha().resize(w, h).toBuffer();
  const nFrames = 20;
  const frames: Buffer[] = [];
  const black = await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } } }).png().toBuffer();
  for (let i = 0; i < nFrames; i++) {
    const alpha = Math.round(255 * (1 - i / nFrames));
    const { data } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
    for (let j = 3; j < data.length; j += 4) data[j] = alpha;
    const faded = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
    const frm = await sharp(black).composite([{ input: faded }]).png().toBuffer();
    frames.push(frm);
  }
  return buildAnimatedGif(frames, w, h, 50);
}

// ─── Text / canvas effects ───────────────────────────────────────────────────

function wrapText(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function caption(buffer: Buffer, text: string): Promise<Buffer> {
  ensureFonts();
  const info = await getFrameInfo(buffer);
  const { width: w, height: h } = info;
  const fontSize = Math.max(16, Math.round(w / 10));
  const canvas = createCanvas(w, 1);
  const ctx = canvas.getContext('2d');
  ctx.font = `bold ${fontSize}px Caption, Ubuntu`;
  const lines = wrapText(ctx, text, w - 20);
  const captionH = lines.length * (fontSize + 4) + 20;
  const finalCanvas = createCanvas(w, captionH);
  const fc = finalCanvas.getContext('2d');
  fc.fillStyle = '#ffffff';
  fc.fillRect(0, 0, w, captionH);
  fc.font = `bold ${fontSize}px Caption, Ubuntu`;
  fc.fillStyle = '#000000';
  fc.textAlign = 'center';
  fc.textBaseline = 'top';
  lines.forEach((line, i) => fc.fillText(line, w / 2, 10 + i * (fontSize + 4)));
  const captionBuf = finalCanvas.toBuffer('image/png');

  return processEachFrame(buffer, async (f, fw, fh) => {
    const newH = fh + captionH;
    return sharp({ create: { width: fw, height: newH, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } } })
      .composite([{ input: captionBuf, left: 0, top: 0 }, { input: f, raw: { width: fw, height: fh, channels: 4 }, left: 0, top: captionH }])
      .png().toBuffer();
  });
}

export async function caption2(buffer: Buffer, text: string): Promise<Buffer> {
  ensureFonts();
  const info = await getFrameInfo(buffer);
  const { width: w, height: h } = info;
  const fontSize = Math.max(16, Math.round(w / 12));
  const canvas = createCanvas(w, 1);
  const ctx = canvas.getContext('2d');
  ctx.font = `${fontSize}px Caption2, Ubuntu`;
  const lines = wrapText(ctx, text, w - 20);
  const captionH = lines.length * (fontSize + 4) + 20;
  const finalCanvas = createCanvas(w, captionH);
  const fc = finalCanvas.getContext('2d');
  fc.fillStyle = '#000000';
  fc.fillRect(0, 0, w, captionH);
  fc.font = `${fontSize}px Caption2, Ubuntu`;
  fc.fillStyle = '#ffffff';
  fc.textAlign = 'center';
  fc.textBaseline = 'top';
  lines.forEach((line, i) => fc.fillText(line, w / 2, 10 + i * (fontSize + 4)));
  const captionBuf = finalCanvas.toBuffer('image/png');

  return processEachFrame(buffer, async (f, fw, fh) => {
    const newH = fh + captionH;
    return sharp({ create: { width: fw, height: newH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } } })
      .composite([{ input: f, raw: { width: fw, height: fh, channels: 4 }, left: 0, top: 0 }, { input: captionBuf, left: 0, top: fh }])
      .png().toBuffer();
  });
}

export async function meme(buffer: Buffer, topText: string, bottomText: string): Promise<Buffer> {
  ensureFonts();
  const info = await getFrameInfo(buffer);
  const { width: w, height: h } = info;
  const fontSize = Math.max(20, Math.round(w / 8));

  function renderMemeText(text: string, fw: number, fh: number, isBottom: boolean): Buffer {
    const canvas = createCanvas(fw, fh);
    const ctx = canvas.getContext('2d');
    ctx.font = `bold ${fontSize}px Impact, Ubuntu`;
    ctx.textAlign = 'center';
    const lines = wrapText(ctx, text.toUpperCase(), fw - 20);
    const lineH = fontSize + 4;
    const totalH = lines.length * lineH;
    const startY = isBottom ? fh - totalH - 10 : 10;
    lines.forEach((line, i) => {
      const y = startY + i * lineH + fontSize;
      ctx.strokeStyle = 'black';
      ctx.lineWidth = Math.max(2, fontSize / 10);
      ctx.strokeText(line, fw / 2, y);
      ctx.fillStyle = 'white';
      ctx.fillText(line, fw / 2, y);
    });
    return canvas.toBuffer('image/png');
  }

  return processEachFrame(buffer, async (f, fw, fh) => {
    const composites: any[] = [{ input: f, raw: { width: fw, height: fh, channels: 4 }, left: 0, top: 0 }];
    if (topText) composites.push({ input: renderMemeText(topText, fw, fh, false), left: 0, top: 0 });
    if (bottomText) composites.push({ input: renderMemeText(bottomText, fw, fh, true), left: 0, top: 0 });
    return sharp({ create: { width: fw, height: fh, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(composites).png().toBuffer();
  });
}

export async function motivate(buffer: Buffer, topText: string, bottomText: string): Promise<Buffer> {
  ensureFonts();
  const info = await getFrameInfo(buffer);
  const { width: w, height: h } = info;
  const border = Math.max(8, Math.round(w * 0.03));

  return processEachFrame(buffer, async (f, fw, fh) => {
    const innerW = fw + border * 2;
    const innerH = fh + border * 2;
    const outerW = innerW + 6;
    const outerH = innerH + 6;
    const textCanvas = createCanvas(outerW, 80);
    const tc = textCanvas.getContext('2d');
    tc.fillStyle = '#000000';
    tc.fillRect(0, 0, outerW, 80);
    tc.fillStyle = '#ffffff';
    tc.textAlign = 'center';
    if (topText) { tc.font = `bold ${Math.round(outerW / 8)}px Ubuntu`; tc.fillText(topText.toUpperCase(), outerW / 2, 30); }
    if (bottomText) { tc.font = `${Math.round(outerW / 14)}px Ubuntu`; tc.fillStyle = '#aaaaaa'; tc.fillText(bottomText, outerW / 2, 60); }
    const textBuf = textCanvas.toBuffer('image/png');

    const totalH = 6 + outerH + 80;
    return sharp({ create: { width: outerW + 6, height: totalH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } } })
      .composite([
        { input: Buffer.from(`<svg><rect x="3" y="3" width="${outerW}" height="${outerH}" fill="none" stroke="white" stroke-width="2"/></svg>`), left: 0, top: 0 },
        { input: f, raw: { width: fw, height: fh, channels: 4 }, left: 6 + border, top: 6 + border },
        { input: textBuf, left: 3, top: outerH + 3 },
      ]).png().toBuffer();
  });
}

export async function snapchat(buffer: Buffer, text: string): Promise<Buffer> {
  ensureFonts();
  const info = await getFrameInfo(buffer);
  const { width: w, height: h } = info;
  const fontSize = Math.max(18, Math.round(h / 14));

  return processEachFrame(buffer, async (f, fw, fh) => {
    const canvas = createCanvas(fw, fh);
    const ctx = canvas.getContext('2d');
    const lines = wrapText(ctx, text, fw - 20);
    const barH = lines.length * (fontSize + 4) + 16;
    const barY = Math.round((fh - barH) / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, barY, fw, barH);
    ctx.font = `bold ${fontSize}px Ubuntu`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => ctx.fillText(line, fw / 2, barY + 8 + i * (fontSize + 4)));
    const overlay = canvas.toBuffer('image/png');
    return sharp(f, { raw: { width: fw, height: fh, channels: 4 } })
      .composite([{ input: overlay, left: 0, top: 0 }]).png().toBuffer();
  });
}

export async function whisper(buffer: Buffer, text: string): Promise<Buffer> {
  ensureFonts();
  const info = await getFrameInfo(buffer);
  const { width: w, height: h } = info;
  const fontSize = Math.max(18, Math.round(h / 10));

  return processEachFrame(buffer, async (f, fw, fh) => {
    const canvas = createCanvas(fw, fh);
    const ctx = canvas.getContext('2d');
    ctx.font = `${fontSize}px Whisper, Ubuntu`;
    const lines = wrapText(ctx, text, fw - 20);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, fh - fontSize * lines.length - 20, fw, fontSize * lines.length + 20);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => ctx.fillText(line, fw / 2, fh - fontSize * (lines.length - i) - 10));
    const overlay = canvas.toBuffer('image/png');
    return sharp(f, { raw: { width: fw, height: fh, channels: 4 } })
      .composite([{ input: overlay, left: 0, top: 0 }]).png().toBuffer();
  });
}

export async function speechbubble(buffer: Buffer): Promise<Buffer> {
  const sbAsset = await loadAsset('speechbubble.png');
  return processEachFrame(buffer, async (f, w, h) => {
    const sb = await sharp(sbAsset).resize(w, Math.round(h * 0.25)).ensureAlpha().toBuffer();
    return sharp(f, { raw: { width: w, height: h, channels: 4 } })
      .composite([{ input: sb, gravity: 'north' }]).png().toBuffer();
  });
}

export async function sonic(text: string): Promise<Buffer> {
  ensureFonts();
  const bg = await loadAsset('sonic.jpg');
  const bgInfo = await sharp(bg).metadata();
  const W = bgInfo.width ?? 795;
  const H = bgInfo.height ?? 532;
  const canvas = createCanvas(542, 390);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.font = 'bold 36px Ubuntu';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = wrapText(ctx, text, 532);
  const lineH = 40;
  lines.forEach((line, i) => ctx.fillText(line, 271, 195 + (i - lines.length / 2) * lineH));
  const textBuf = canvas.toBuffer('image/png');
  return sharp(bg).composite([{ input: textBuf, left: 391, top: 84 }]).jpeg({ quality: 90 }).toBuffer();
}

export async function homebrew(text: string): Promise<Buffer> {
  ensureFonts();
  const bg = await loadAsset('hbc.png');
  const bgInfo = await sharp(bg).metadata();
  const W = bgInfo.width ?? 640;
  const H = bgInfo.height ?? 480;
  const canvas = createCanvas(W, 80);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.font = `bold ${Math.round(W / 12)}px HBC, Ubuntu`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = wrapText(ctx, text, W - 20);
  lines.forEach((line, i) => ctx.fillText(line, W / 2, 40 + (i - lines.length / 2) * 28));
  const textBuf = canvas.toBuffer('image/png');
  return sharp(bg).composite([{ input: textBuf, left: 0, top: Math.round(H * 0.6) }]).png().toBuffer();
}

export async function reddit(buffer: Buffer, text: string): Promise<Buffer> {
  ensureFonts();
  const template = await loadAsset('reddit.png');
  const { width: tw, height: th } = (await sharp(template).metadata()) as any;
  const canvas = createCanvas(tw, th);
  const ctx = canvas.getContext('2d');
  ctx.font = `bold ${Math.round(tw / 14)}px Reddit, Ubuntu`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const lines = wrapText(ctx, text, tw - 40);
  lines.forEach((line, i) => ctx.fillText(line, 20, 20 + i * Math.round(tw / 12)));
  const textBuf = canvas.toBuffer('image/png');

  const info = await getFrameInfo(buffer);
  const imgThumb = await sharp(buffer, { animated: false, page: 0 })
    .resize(Math.round(tw * 0.3), Math.round(th * 0.5), { fit: 'inside' }).toBuffer();
  return sharp(template)
    .composite([{ input: textBuf }, { input: imgThumb, gravity: 'southeast' }])
    .png().toBuffer();
}

export async function gamexplain(buffer: Buffer, text: string): Promise<Buffer> {
  ensureFonts();
  const template = await loadAsset('gamexplain.png');
  const { width: tw, height: th } = (await sharp(template).metadata()) as any;
  const img = await sharp(buffer, { animated: false, page: 0 }).resize(Math.round(tw * 0.55), Math.round(th * 0.7), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 255 } }).toBuffer();
  const canvas = createCanvas(tw, th);
  const ctx = canvas.getContext('2d');
  ctx.font = `bold ${Math.round(tw / 20)}px Ubuntu`;
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const lines = wrapText(ctx, text, Math.round(tw * 0.4) - 20);
  lines.forEach((line, i) => ctx.fillText(line, Math.round(tw * 0.78), 40 + i * Math.round(tw / 18)));
  const textBuf = canvas.toBuffer('image/png');
  return sharp(template).composite([{ input: img, left: 10, top: Math.round(th * 0.15) }, { input: textBuf }]).png().toBuffer();
}

export async function scott(buffer: Buffer): Promise<Buffer> {
  const template = await loadAsset('scott.png');
  const map = await loadAsset('scottmap.png');
  const { width: tw, height: th } = (await sharp(template).metadata()) as any;
  const { data: mapData, info: mapInfo } = await sharp(map).resize(tw, th).raw().toBuffer({ resolveWithObject: true });
  const img = await sharp(buffer, { animated: false, page: 0 }).resize(tw, th).ensureAlpha().toBuffer();
  const { data: imgData } = await sharp(img).raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(tw * th * 4);
  for (let i = 0; i < tw * th; i++) {
    const mapIdx = i * mapInfo.channels;
    const srcX = Math.round((mapData[mapIdx]! / 255) * tw);
    const srcY = Math.round((mapData[mapIdx + 1]! / 255) * th);
    const srcIdx = (srcY * tw + srcX) * 4;
    const dstIdx = i * 4;
    out[dstIdx] = imgData[srcIdx]!; out[dstIdx + 1] = imgData[srcIdx + 1]!;
    out[dstIdx + 2] = imgData[srcIdx + 2]!; out[dstIdx + 3] = imgData[srcIdx + 3]!;
  }
  const mapped = await sharp(out, { raw: { width: tw, height: th, channels: 4 } }).png().toBuffer();
  return sharp(template).composite([{ input: mapped, blend: 'multiply' }]).png().toBuffer();
}

export async function spotify(text: string, artist: string): Promise<Buffer> {
  ensureFonts();
  const template = await loadAsset('spotify.png');
  const { width: tw, height: th } = (await sharp(template).metadata()) as any;
  const canvas = createCanvas(tw, th);
  const ctx = canvas.getContext('2d');
  ctx.font = `bold ${Math.round(tw / 16)}px Circular, Ubuntu`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(text, Math.round(tw * 0.35), Math.round(th * 0.45));
  ctx.font = `${Math.round(tw / 20)}px Circular, Ubuntu`;
  ctx.fillStyle = '#b3b3b3';
  ctx.fillText(artist, Math.round(tw * 0.35), Math.round(th * 0.58));
  const textBuf = canvas.toBuffer('image/png');
  return sharp(template).composite([{ input: textBuf }]).png().toBuffer();
}

export async function uncanny(buffer: Buffer, text: string): Promise<Buffer> {
  ensureFonts();
  const info = await getFrameInfo(buffer);
  const { width: w, height: h } = info;
  const fontSize = Math.max(16, Math.round(w / 12));

  return processEachFrame(buffer, async (f, fw, fh) => {
    const halfH = Math.round(fh / 2);
    const topHalf = await sharp(f, { raw: { width: fw, height: fh, channels: 4 } })
      .extract({ left: 0, top: 0, width: fw, height: halfH }).toBuffer();
    const bottomHalf = await sharp(f, { raw: { width: fw, height: fh, channels: 4 } })
      .extract({ left: 0, top: halfH, width: fw, height: fh - halfH }).toBuffer();

    const canvas = createCanvas(fw, halfH);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, fw, halfH);
    ctx.font = `bold ${fontSize}px Ubuntu`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, fw / 2, halfH / 2);
    const textBuf = canvas.toBuffer('image/png');

    return sharp({ create: { width: fw, height: fh + halfH, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } } })
      .composite([
        { input: topHalf, left: 0, top: 0 },
        { input: textBuf, left: 0, top: halfH },
        { input: bottomHalf, left: 0, top: halfH * 2 },
      ]).png().toBuffer();
  });
}

export async function uncaption(buffer: Buffer): Promise<Buffer> {
  const info = await getFrameInfo(buffer);
  return processEachFrame(buffer, async (f, fw, fh) => {
    const topGray = await sharp(f, { raw: { width: fw, height: fh, channels: 4 } })
      .extract({ left: 0, top: 0, width: fw, height: 1 })
      .grayscale().raw().toBuffer();
    const topBrightness = topGray.reduce((sum, v) => sum + v, 0) / topGray.length;
    if (topBrightness < 200) return f;
    let cutY = 0;
    const { data } = await sharp(f, { raw: { width: fw, height: fh, channels: 4 } }).raw().toBuffer({ resolveWithObject: true });
    for (let y = 0; y < fh; y++) {
      const rowBrightness = Array.from({ length: fw }, (_, x) => {
        const i = (y * fw + x) * 4;
        return (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      }).reduce((a, b) => a + b, 0) / fw;
      if (rowBrightness < 200) { cutY = y; break; }
    }
    if (cutY === 0) return f;
    return sharp(f, { raw: { width: fw, height: fh, channels: 4 } })
      .extract({ left: 0, top: cutY, width: fw, height: fh - cutY }).png().toBuffer();
  });
}

export async function makeGif(buffer: Buffer): Promise<Buffer> {
  const info = await getFrameInfo(buffer);
  if (info.pages > 1) return buffer;
  const frames = await extractFrames(buffer, info);
  return buildAnimatedGif(frames, info.width, info.height, 50);
}
