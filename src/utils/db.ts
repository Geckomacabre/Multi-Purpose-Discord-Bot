import { SQL } from 'bun';

export type IConfig = {
  guild_id: string;
};
export type ICounting = {
  guild_id: string;
  channel_id: string;
  count: number;
  highscore?: number;
  last_msg?: { message_id: string; author_id: string; number: number; failed?: boolean } | null;
};

export const db = new SQL('sqlite://db.sqlite');

export async function initDb() {
  if (db.options.adapter === 'sqlite') {
    try {
      await db`PRAGMA foreign_keys = ON;`;
      await db`PRAGMA journal_mode = WAL;`;
      await db`PRAGMA busy_timeout = 5000;`;
      await db`PRAGMA wal_autocheckpoint = 1000;`;
      await db`PRAGMA synchronous = NORMAL;`;
    } catch (err) {
      console.error('Failed to set PRAGMA settings:', err);
    }
  }

  await db`
   CREATE TABLE IF NOT EXISTS config (
      guild_id TEXT PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS counting (
      channel_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      highscore INTEGER NOT NULL DEFAULT 0,
      last_msg TEXT DEFAULT '{}',
      FOREIGN KEY (guild_id) REFERENCES config(guild_id) ON DELETE CASCADE
    );
  `;
}

export async function removeGuild(guild_id: string): Promise<void> {
  await db`DELETE FROM config WHERE guild_id = ${guild_id}`;
  await db`DELETE FROM counting WHERE guild_id = ${guild_id}`;
}

export async function ensureConfig(guild_id: string): Promise<void> {
  await db`
    INSERT INTO config (guild_id) VALUES (${guild_id})
    ON CONFLICT(guild_id) DO NOTHING;
  `;
}

export async function getConfig(guild_id: string): Promise<IConfig | null> {
  const result = await db`SELECT * FROM config WHERE guild_id = ${guild_id}`;
  return result[0] || null;
}

export async function getCounting(channel_id: string): Promise<ICounting | null> {
  const [row] = await db`SELECT * FROM counting WHERE channel_id = ${channel_id}`;
  if (!row) return null;
  return {
    guild_id: row.guild_id,
    channel_id: row.channel_id,
    count: row.count,
    highscore: row.highscore,
    last_msg: row.last_msg && row.last_msg !== '{}' ? JSON.parse(row.last_msg) : undefined,
  };
}

export async function setCounting(
  channel_id: string,
  guild_id: string,
  count = 0,
  highscore = 0,
  last_msg?: { message_id: string; author_id: string; number: number }
): Promise<void> {
  await ensureConfig(guild_id);
  const lastMsgStr = last_msg ? JSON.stringify(last_msg) : '{}';
  await db`
    INSERT INTO counting (channel_id, guild_id, count, highscore, last_msg)
    VALUES (${channel_id}, ${guild_id}, ${count}, ${highscore}, ${lastMsgStr})
    ON CONFLICT(channel_id) DO UPDATE SET
      count = excluded.count,
      highscore = excluded.highscore,
      last_msg = excluded.last_msg;
  `;
}

export async function updateCounting(
  channel_id: string,
  fields: Partial<Pick<ICounting, 'count' | 'highscore' | 'last_msg'>>
): Promise<void> {
  await db`
    UPDATE counting SET
    count = ${fields.count ? fields.count : db`count`},
    highscore = ${fields.highscore ? fields.highscore : db`highscore`},
    last_msg = ${fields.last_msg ? JSON.stringify(fields.last_msg) : fields.last_msg === null ? null : db`last_msg`}
    WHERE channel_id = ${channel_id}
    `;
}

export async function unsetCounting(channel_id: string): Promise<void> {
  await db`DELETE FROM counting WHERE channel_id = ${channel_id}`;
}

export async function resetCounting(channel_id: string, toCount: number = 0): Promise<void> {
  await db`UPDATE counting SET count = ${toCount}, last_msg = '{}' WHERE channel_id = ${channel_id}`;
}

export async function removeCountingByChannelId(guild_id: string, channel_id: string) {
  await db`DELETE FROM counting WHERE channel_id = ${channel_id} AND guild_id = ${guild_id}`;
}
