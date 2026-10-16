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
  /** 24/7: stay in voice when the queue ends or everyone leaves. */
  alwaysOn: boolean;
  /** Skip sponsor reads, self-promotion and non-music parts of YouTube videos. */
  sponsorBlock: boolean;
};

const DEFAULTS: GuildMusicConfig = { volume: 100, djRoleId: null, alwaysOn: false, sponsorBlock: false };

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
