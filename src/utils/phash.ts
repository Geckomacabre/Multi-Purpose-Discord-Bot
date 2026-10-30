import { dlopen, FFIType, ptr } from 'bun:ffi';
import { unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import logger from './logger';

// pHash (https://phash.org), the open source perceptual hash library, built from
// github.com/aetilius/pHash in the Dockerfile and called through Bun's FFI. Its
// DCT image hash is a 64-bit fingerprint of what an image looks like: resizing,
// re-compressing or small edits barely change it, so copies of one picture land
// within a few bits of each other, while different pictures differ in ~half of them.
//
//   int ph_dct_imagehash(const char *file, ulong64 &hash);   // -1 on failure
//   int ph_hamming_distance(ulong64 hasha, ulong64 hashb);
//   (https://phash.org/docs/howto.html)

const open = () => dlopen('libpHash.so', {
  ph_dct_imagehash: { args: [FFIType.cstring, FFIType.ptr], returns: FFIType.i32 },
  ph_hamming_distance: { args: [FFIType.u64, FFIType.u64], returns: FFIType.i32 },
});

let lib: ReturnType<typeof open> | null | undefined;
function pHashLib() {
  if (lib === undefined) {
    try {
      lib = open();
    } catch (err) {
      lib = null; // e.g. a dev machine without the library
      logger.warn(`[phash] libpHash isn't installed, so scam image matching is off: ${err}`);
    }
  }
  return lib;
}

// pHash reads images from disk with CImg, which picks the decoder by file extension
function extensionOf(file: Buffer): string | null {
  if (file[0] === 0x89 && file.subarray(1, 4).toString() === 'PNG') return 'png';
  if (file[0] === 0xff && file[1] === 0xd8) return 'jpg';
  if (file.subarray(0, 4).toString() === 'II*\0' || file.subarray(0, 4).toString() === 'MM\0*') return 'tif';
  return null;
}

let seq = 0;

/** pHash's 64-bit DCT hash of a PNG, JPEG or TIFF, as 16 hex characters; null if pHash can't read it or isn't installed. */
export async function pHash(file: Buffer): Promise<string | null> {
  const lib = pHashLib();
  const ext = extensionOf(file);
  if (!lib || !ext) return null;

  const path = join(tmpdir(), `phash-${process.pid}-${++seq}.${ext}`);
  await Bun.write(path, file);
  try {
    const out = new BigUint64Array(1);
    const rc = lib.symbols.ph_dct_imagehash(ptr(Buffer.from(`${path}\0`)), ptr(out));
    return rc < 0 ? null : out[0]!.toString(16).padStart(16, '0');
  } finally {
    await unlink(path).catch(() => {});
  }
}

/** How many of the 64 bits differ between two hashes (0 = identical), via pHash's ph_hamming_distance. */
export function hammingDistance(a: string, b: string): number {
  const x = BigInt(`0x${a}`);
  const y = BigInt(`0x${b}`);
  const lib = pHashLib();
  if (lib) return lib.symbols.ph_hamming_distance(x, y);
  let diff = x ^ y;
  let n = 0;
  for (; diff; n++) diff &= diff - 1n;
  return n;
}
