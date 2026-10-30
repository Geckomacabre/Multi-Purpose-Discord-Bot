import type { Subprocess } from 'bun';
import { unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import logger from './logger';

// Perceptual hash (pHash): a fingerprint of what an image looks like. Resizing,
// re-compressing or small edits barely change it, so copies of one picture land
// a few bits apart while different pictures differ in about half the bits.
//
// Hashes are 256-bit (64 hex chars) from Python's ImageHash library,
// imagehash.phash(img, hash_size=16), the exact recipe behind the shared scam
// image list at github.com/SomewhatDamaged/Scam-Images, so ours compare with
// theirs. Measured: a resized, re-compressed copy is ~2 bits off, unrelated
// images ~118. The hashing runs in imagehash_worker.py, one long-lived process.

const WORKER = join(import.meta.dir, 'imagehash_worker.py');
const TIMEOUT_MS = 15_000;

let worker: Subprocess<'pipe', 'pipe', 'inherit'> | null = null;
let waiting: ((line: string) => void)[] = [];
let unavailable = false;

function startWorker() {
  const proc = Bun.spawn(['python3', '-u', WORKER], { stdin: 'pipe', stdout: 'pipe', stderr: 'inherit' });
  worker = proc;
  waiting = [];
  const replies = waiting;
  (async () => {
    const decoder = new TextDecoder();
    let buffered = '';
    for await (const chunk of proc.stdout) {
      buffered += decoder.decode(chunk, { stream: true });
      for (let i; (i = buffered.indexOf('\n')) >= 0;) {
        replies.shift()?.(buffered.slice(0, i).trim());
        buffered = buffered.slice(i + 1);
      }
    }
    // Exited or killed: fail whatever was still waiting, and start fresh next time
    if (worker === proc) worker = null;
    for (const reply of replies.splice(0)) reply('ERR');
  })().catch(() => {});
  return proc;
}

/** Asks the worker to hash one file. One line in, one line out, in order. */
function ask(path: string): Promise<string> {
  const proc = worker ?? startWorker();
  const answer = new Promise<string>(resolve => waiting.push(resolve));
  proc.stdin.write(`${path}\n`);
  proc.stdin.flush();
  let timer: Timer;
  const timeout = new Promise<string>(resolve => {
    timer = setTimeout(() => {
      proc.kill(); // stuck on a bad file; the reader above fails its queue
      resolve('ERR');
    }, TIMEOUT_MS);
  });
  return Promise.race([answer, timeout]).finally(() => clearTimeout(timer));
}

let seq = 0;

/** The image's 256-bit pHash as 64 hex characters, or null if it can't be read (or hashing isn't available). */
export async function pHash(file: Buffer): Promise<string | null> {
  if (unavailable) return null;
  const path = join(tmpdir(), `phash-${process.pid}-${++seq}`);
  await Bun.write(path, file);
  try {
    const line = await ask(path);
    if (line === 'MISSING') {
      unavailable = true;
      logger.warn('[phash] the Python ImageHash library isn\'t installed, so scam image matching is off');
      return null;
    }
    return /^[0-9a-f]{64}$/.test(line) ? line : null;
  } catch (err) {
    // No python3 at all (e.g. a dev machine)
    unavailable = true;
    logger.warn(`[phash] couldn't start the hashing worker, so scam image matching is off: ${err}`);
    return null;
  } finally {
    await unlink(path).catch(() => {});
  }
}

/** How many bits differ between two hashes of the same length (0 = identical). */
export function hammingDistance(a: string, b: string): number {
  let diff = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  for (; diff; n++) diff &= diff - 1n;
  return n;
}
