// Per-guild music settings, JSON-file backed. The main bot keeps its config in its
// own DB; this standalone bot only needs a handful of settings, so a small local
// file is enough (and keeps the two processes independent).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(new URL('./music-config.json', import.meta.url));

export type GuildMusicConfig = {
  volume: number;
  /** When set, only members with this role (or Manage Server) get full DJ controls. */
  djRoleId: string | null;
  /** Only DJs can add tracks while this is on. */
  karaoke: boolean;
  /** 24/7: stay in voice when the queue ends or everyone leaves. */
  alwaysOn: boolean;
};

const DEFAULTS: GuildMusicConfig = { volume: 100, djRoleId: null, karaoke: false, alwaysOn: false };

let config: Record<string, Partial<GuildMusicConfig>> = {};
try {
  if (existsSync(FILE)) config = JSON.parse(readFileSync(FILE, 'utf8'));
} catch { /* start fresh if unreadable */ }

export function getMusicConfig(guildId: string): GuildMusicConfig {
  return { ...DEFAULTS, ...config[guildId] };
}

export function setMusicConfig(guildId: string, patch: Partial<GuildMusicConfig>): GuildMusicConfig {
  config[guildId] = { ...config[guildId], ...patch };
  try { writeFileSync(FILE, JSON.stringify(config, null, 2)); } catch { /* non-fatal */ }
  return getMusicConfig(guildId);
}
