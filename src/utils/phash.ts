import { createCanvas, loadImage } from '@napi-rs/canvas';

// Perceptual hash (pHash): a fingerprint of what an image looks like. Resizing,
// re-compressing or small edits barely change it, so copies of one picture land
// a few bits apart while different pictures differ in about half the bits.
//
// This is a TypeScript port of Python ImageHash's imagehash.phash(img, hash_size=16),
// the hash the shared scam list (github.com/SomewhatDamaged/Scam-Images) and its
// API are built on, so our hashes can be sent to it as-is:
//   image.convert('L').resize((64, 64), LANCZOS) -> 2D DCT-II -> 16x16 lowest
//   frequencies -> each bit is "above the median?" -> 256 bits as 64 hex chars.
// Pillow's grayscale formula and Lanczos resampling (integer coefficients, rounded
// between passes) are reproduced exactly, so hashes come out bit-for-bit the same.
// Wide side-by-side screenshots are also split in two and each half hashed, the way
// SomewhatDamaged/SentryBot does it, so one half on its own still matches.

const HASH_SIZE = 16;
const IMG_SIZE = HASH_SIZE * 4; // ImageHash's highfreq_factor
const MAX_PIXELS = 4096 * 4096;

export type ImagePart = 'whole' | 'left' | 'right';
export type ImageFingerprint = { part: ImagePart; hash: string; width: number; height: number };

// ── Pillow's resampling (libImaging/Resample.c) ───────────────────────────────

const PRECISION_BITS = 32 - 8 - 2;
const ONE = 2 ** PRECISION_BITS;

const sinc = (x: number) => (x === 0 ? 1 : Math.sin(x * Math.PI) / (x * Math.PI));
const lanczos = (x: number) => (x >= -3 && x < 3 ? sinc(x) * sinc(x / 3) : 0);

/** Pillow's precompute_coeffs + normalize_coeffs_8bpc for the Lanczos filter. */
function coefficients(inSize: number, outSize: number) {
  const scale = inSize / outSize;
  const filterScale = Math.max(scale, 1);
  const support = 3 * filterScale;
  const ksize = Math.ceil(support) * 2 + 1;
  const bounds = new Int32Array(outSize * 2);
  const kk = new Int32Array(outSize * ksize);
  const k = new Float64Array(ksize);
  for (let xx = 0; xx < outSize; xx++) {
    const center = (xx + 0.5) * scale;
    const xmin = Math.max(Math.trunc(center - support + 0.5), 0);
    const xmax = Math.min(Math.trunc(center + support + 0.5), inSize) - xmin;
    let ww = 0;
    for (let x = 0; x < xmax; x++) {
      k[x] = lanczos((x + xmin - center + 0.5) / filterScale);
      ww += k[x]!;
    }
    for (let x = 0; x < xmax; x++) {
      const w = ww !== 0 ? k[x]! / ww : k[x]!;
      kk[xx * ksize + x] = Math.trunc(w < 0 ? -0.5 + w * ONE : 0.5 + w * ONE);
    }
    bounds[xx * 2] = xmin;
    bounds[xx * 2 + 1] = xmax;
  }
  return { ksize, bounds, kk };
}

const clip8 = (ss: number) => Math.min(255, Math.max(0, Math.floor(ss / ONE)));

/** Resizes an 8-bit grayscale region to IMG_SIZE x IMG_SIZE exactly like Pillow's LANCZOS. */
function resize(gray: Uint8Array, stride: number, x0: number, width: number, height: number): Uint8Array {
  // Horizontal pass (skipped when the width already matches, as in Pillow), rounded to 8 bits
  let mid = gray;
  let midStride = stride;
  let midX0 = x0;
  if (width !== IMG_SIZE) {
    const { ksize, bounds, kk } = coefficients(width, IMG_SIZE);
    mid = new Uint8Array(IMG_SIZE * height);
    for (let y = 0; y < height; y++) {
      const row = y * stride + x0;
      for (let xx = 0; xx < IMG_SIZE; xx++) {
        const xmin = bounds[xx * 2]!, xmax = bounds[xx * 2 + 1]!;
        let ss = ONE / 2;
        for (let x = 0; x < xmax; x++) ss += gray[row + xmin + x]! * kk[xx * ksize + x]!;
        mid[y * IMG_SIZE + xx] = clip8(ss);
      }
    }
    midStride = IMG_SIZE;
    midX0 = 0;
  }
  // Vertical pass
  const out = new Uint8Array(IMG_SIZE * IMG_SIZE);
  if (height === IMG_SIZE) {
    for (let y = 0; y < IMG_SIZE; y++) for (let x = 0; x < IMG_SIZE; x++) out[y * IMG_SIZE + x] = mid[y * midStride + midX0 + x]!;
    return out;
  }
  const { ksize, bounds, kk } = coefficients(height, IMG_SIZE);
  for (let yy = 0; yy < IMG_SIZE; yy++) {
    const ymin = bounds[yy * 2]!, ymax = bounds[yy * 2 + 1]!;
    for (let x = 0; x < IMG_SIZE; x++) {
      let ss = ONE / 2;
      for (let y = 0; y < ymax; y++) ss += mid[(ymin + y) * midStride + midX0 + x]! * kk[yy * ksize + y]!;
      out[yy * IMG_SIZE + x] = clip8(ss);
    }
  }
  return out;
}

// ── DCT and hash (ImageHash / scipy.fftpack.dct type II) ──────────────────────

// COS[k][n] = cos(pi * k * (2n + 1) / 2N), only for the frequencies we keep
const COS = Array.from({ length: HASH_SIZE }, (_, k) =>
  Float64Array.from({ length: IMG_SIZE }, (_, n) => Math.cos((Math.PI * k * (2 * n + 1)) / (2 * IMG_SIZE))));

function hashPixels(px: Uint8Array): string {
  // dct(dct(pixels, axis=0), axis=1), keeping [:16, :16]; scipy's factor of 2 per axis doesn't change the median test
  const cols = new Float64Array(HASH_SIZE * IMG_SIZE); // [ky][x]
  for (let ky = 0; ky < HASH_SIZE; ky++) {
    for (let x = 0; x < IMG_SIZE; x++) {
      let sum = 0;
      for (let y = 0; y < IMG_SIZE; y++) sum += px[y * IMG_SIZE + x]! * COS[ky]![y]!;
      cols[ky * IMG_SIZE + x] = 2 * sum;
    }
  }
  const low = new Float64Array(HASH_SIZE * HASH_SIZE); // [ky][kx]
  for (let ky = 0; ky < HASH_SIZE; ky++) {
    for (let kx = 0; kx < HASH_SIZE; kx++) {
      let sum = 0;
      for (let x = 0; x < IMG_SIZE; x++) sum += cols[ky * IMG_SIZE + x]! * COS[kx]![x]!;
      low[ky * HASH_SIZE + kx] = 2 * sum;
    }
  }
  const sorted = [...low].sort((a, b) => a - b);
  const median = (sorted[127]! + sorted[128]!) / 2; // numpy.median of 256 values
  let bits = 0n;
  for (const v of low) bits = (bits << 1n) | (v > median ? 1n : 0n);
  return bits.toString(16).padStart(HASH_SIZE * HASH_SIZE / 4, '0');
}

// ── Splitting wide screenshots (SentryBot's split_images.py) ─────────────────

/** Where SentryBot would cut a side-by-side image: the sharpest brightness change in the middle 60%. */
function findCut(rgba: Uint8ClampedArray, width: number, height: number): number {
  // OpenCV BGR2GRAY, then a 15x1 Gaussian blur (sigma 2.6), then each column's average
  const gray = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) {
    gray[i] = (rgba[i * 4]! * 4899 + rgba[i * 4 + 1]! * 9617 + rgba[i * 4 + 2]! * 1868 + 8192) >> 14;
  }
  const sigma = 0.3 * ((15 - 1) * 0.5 - 1) + 0.8;
  const kernel = Array.from({ length: 15 }, (_, i) => Math.exp(-((i - 7) ** 2) / (2 * sigma * sigma)));
  const total = kernel.reduce((a, b) => a + b, 0);
  const start = Math.trunc(width * 0.2);
  const end = Math.trunc(width * 0.8);
  const reflect = (x: number) => (x < 0 ? -x : x >= width ? 2 * width - 2 - x : x); // BORDER_REFLECT_101
  const columns = new Float64Array(end - start);
  for (let c = start; c < end; c++) {
    let sum = 0;
    for (let y = 0; y < height; y++) {
      let v = 0;
      for (let i = 0; i < 15; i++) v += kernel[i]! * gray[y * width + reflect(c + i - 7)]!;
      sum += Math.round(v / total);
    }
    columns[c - start] = sum / height;
  }
  let best = 0;
  for (let i = 1; i < columns.length - 1; i++) {
    if (Math.abs(columns[i + 1]! - columns[i]!) > Math.abs(columns[best + 1]! - columns[best]!)) best = i;
  }
  return start + best;
}

/**
 * Fingerprints of an image file (PNG, JPEG, GIF's first frame, WebP...): the whole
 * image, plus its left and right halves when it's much wider than tall. Null if it
 * can't be decoded or is enormous.
 */
export async function fingerprintImage(file: Buffer): Promise<ImageFingerprint[] | null> {
  let image;
  try {
    image = await loadImage(file);
  } catch {
    return null;
  }
  const { width, height } = image;
  if (!width || !height || width * height > MAX_PIXELS) return null;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const rgba = ctx.getImageData(0, 0, width, height).data;

  // Pillow's convert('L'): L = R*299/1000 + G*587/1000 + B*114/1000, in fixed point
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    gray[i] = (rgba[i * 4]! * 19595 + rgba[i * 4 + 1]! * 38470 + rgba[i * 4 + 2]! * 7471 + 0x8000) >> 16;
  }

  const parts: ImageFingerprint[] = [{ part: 'whole', hash: hashPixels(resize(gray, width, 0, width, height)), width, height }];
  if (width > height * 1.4) {
    const cut = findCut(rgba, width, height);
    parts.push(
      { part: 'left', hash: hashPixels(resize(gray, width, 0, cut, height)), width: cut, height },
      { part: 'right', hash: hashPixels(resize(gray, width, cut, width - cut, height)), width: width - cut, height },
    );
  }
  return parts;
}

/** How many bits differ between two hashes of the same length (0 = identical). */
export function hammingDistance(a: string, b: string): number {
  let diff = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  for (; diff; n++) diff &= diff - 1n;
  return n;
}
