// Minimal per-guild volume persistence, JSON-file backed. The main bot keeps this
// in its shared DB; this standalone bot only needs volume, so a small local file
// is enough (and keeps the two bots independent). getMusicConfig/setMusicVolume
// mirror the main bot's db API so music.ts can call them unchanged.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./music-config.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

let config: Record<string, { volume: number }> = {};
try {
  if (existsSync(FILE)) config = JSON.parse(readFileSync(FILE, 'utf8'));
} catch { /* start fresh if unreadable */ }

export async function getMusicConfig(guildId: string): Promise<{ volume: number; dj_role_id: string | null }> {
  return { volume: config[guildId]?.volume ?? 100, dj_role_id: null };
}

export async function setMusicVolume(guildId: string, volume: number): Promise<void> {
  config[guildId] = { volume };
  try { writeFileSync(FILE, JSON.stringify(config)); } catch { /* non-fatal */ }
}
