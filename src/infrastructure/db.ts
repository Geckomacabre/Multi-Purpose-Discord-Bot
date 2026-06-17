import { SQL } from "bun";

export type IConfig = {
  guild_id: string;
};
export type ICounting = {
  guild_id: string;
  channel_id: string;
  count: number;
  highscore?: number;
  last_msg?: { message_id: string; author_id: string; number: number } | null;
};
export type IStarboard = {
  original_message_id: string;
  starboard_message_id: string;
  guild_id: string;
  channel_id: string;
  author_id: string;
  star_count: number;
};

export const db = new SQL(Bun.env.DATABASE_URL || "sqlite://db.sqlite");

export async function initDb() {
  await db
    .unsafe(
      "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
    )
    .catch(() => {});
  await db`
    CREATE TABLE IF NOT EXISTS config (
      guild_id TEXT PRIMARY KEY
    );
  `;
  await db`
    CREATE TABLE IF NOT EXISTS counting (
      channel_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      highscore INTEGER NOT NULL DEFAULT 0,
      last_msg TEXT DEFAULT '{}',
      FOREIGN KEY (guild_id) REFERENCES config(guild_id) ON DELETE CASCADE
    );
  `;
  await db`
  CREATE TABLE IF NOT EXISTS birthdays (
    user_id TEXT PRIMARY KEY,
    month INTEGER NOT NULL,
    day INTEGER NOT NULL,
    year INTEGER NOT NULL,
    last_assigned INTEGER DEFAULT 0
  );
`;
  await db`
  CREATE TABLE IF NOT EXISTS timezones (
    user_id TEXT PRIMARY KEY,
    timezone TEXT NOT NULL
  );
`;
  await db`
  CREATE TABLE IF NOT EXISTS sticky_messages (
    key TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL
  );
`;
  await db`
  CREATE TABLE IF NOT EXISTS starboard (
    original_message_id TEXT PRIMARY KEY,
    starboard_message_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    star_count INTEGER NOT NULL DEFAULT 0
  );
`;
  await db`
  CREATE TABLE IF NOT EXISTS rooms (
    channel_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    locked INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    user_limit INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;
  await db`
  CREATE TABLE IF NOT EXISTS discord_oauth (
    user_id TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
`;

  await db`
  CREATE TABLE IF NOT EXISTS twitch_links (
    discord_user_id TEXT PRIMARY KEY,
    twitch_id TEXT NOT NULL,
    login TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at INTEGER
  );
`;

  await db`
  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    discord_user_id TEXT,
    created_at INTEGER NOT NULL
  );
`;
  await db`
  CREATE INDEX IF NOT EXISTS idx_oauth_states_created_at
  ON oauth_states(created_at);
`;
  await db`
CREATE TABLE IF NOT EXISTS live_streams (
  user_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  started_at INTEGER NOT NULL
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

export async function getCounting(
  channel_id: string,
): Promise<ICounting | null> {
  const [row] =
    await db`SELECT * FROM counting WHERE channel_id = ${channel_id}`;
  if (!row) return null;
  return {
    guild_id: row.guild_id,
    channel_id: row.channel_id,
    count: row.count,
    highscore: row.highscore,
    last_msg:
      row.last_msg && row.last_msg !== "{}"
        ? JSON.parse(row.last_msg)
        : undefined,
  };
}

export async function setCounting(
  channel_id: string,
  guild_id: string,
  count = 0,
  highscore = 0,
  last_msg?: { message_id: string; author_id: string; number: number },
): Promise<void> {
  await ensureConfig(guild_id);
  const lastMsgStr = last_msg ? JSON.stringify(last_msg) : "{}";
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
  fields: Partial<Pick<ICounting, "count" | "highscore" | "last_msg">>,
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

export async function resetCounting(
  channel_id: string,
  toCount: number = 0,
): Promise<void> {
  await db`UPDATE counting SET count = ${toCount}, last_msg = '{}' WHERE channel_id = ${channel_id}`;
}

export async function removeCountingByChannelId(
  guild_id: string,
  channel_id: string,
) {
  await db`DELETE FROM counting WHERE channel_id = ${channel_id} AND guild_id = ${guild_id}`;
}

export async function getBirthday(user_id: string): Promise<{
  month: number;
  day: number;
  year: number;
  last: number;
} | null> {
  const [row] = await db`
    SELECT month, day, year, last_assigned
    FROM birthdays
    WHERE user_id = ${user_id}
  `;

  if (!row) return null;

  return {
    month: row.month,
    day: row.day,
    year: row.year ?? null,
    last: row.last_assigned ?? 0,
  };
}

export async function setBirthday(
  user_id: string,
  month: number,
  day: number,
  year: number,
): Promise<void> {
  await db`
    INSERT INTO birthdays (user_id, month, day, year, last_assigned)
    VALUES (${user_id}, ${month}, ${day}, ${year}, 0)
    ON CONFLICT(user_id) DO UPDATE SET
      month = excluded.month,
      day = excluded.day,
      year = excluded.year
  `;
}

export async function setBirthdayAssigned(
  user_id: string,
  timestamp: number,
): Promise<void> {
  await db`
    UPDATE birthdays
    SET last_assigned = ${timestamp}
    WHERE user_id = ${user_id}
  `;
}

export async function removeBirthday(user_id: string): Promise<void> {
  await db`
    DELETE FROM birthdays WHERE user_id = ${user_id}
  `;
}

export async function getTimezone(userId: string) {
  const rows = await db`
    SELECT timezone FROM timezones WHERE user_id = ${userId}
  `;
  return rows[0]?.timezone ?? null;
}

export async function setTimezone(userId: string, timezone: string) {
  await db`
    INSERT INTO timezones (user_id, timezone)
    VALUES (${userId}, ${timezone})
    ON CONFLICT (user_id) DO UPDATE SET timezone = ${timezone}
  `;
}

export async function removeTimezone(userId: string) {
  await db`DELETE FROM timezones WHERE user_id = ${userId}`;
}

export async function getStickyMessage(key: string) {
  const [row] = await db`
    SELECT channel_id, message_id FROM sticky_messages WHERE key = ${key}
  `;
  return row ?? null;
}

export async function setStickyMessage(
  key: string,
  channel_id: string,
  message_id: string,
) {
  await db`
    INSERT INTO sticky_messages (key, channel_id, message_id)
    VALUES (${key}, ${channel_id}, ${message_id})
    ON CONFLICT (key) DO UPDATE SET
      channel_id = excluded.channel_id,
      message_id = excluded.message_id
  `;
}

export async function getStarboardEntry(
  original_message_id: string,
): Promise<IStarboard | null> {
  const [row] = await db`
    SELECT * FROM starboard WHERE original_message_id = ${original_message_id}
  `;
  return row ?? null;
}

export async function setStarboardEntry(
  original_message_id: string,
  starboard_message_id: string,
  guild_id: string,
  channel_id: string,
  author_id: string,
  star_count: number,
): Promise<void> {
  await db`
    INSERT INTO starboard (original_message_id, starboard_message_id, guild_id, channel_id, author_id, star_count)
    VALUES (${original_message_id}, ${starboard_message_id}, ${guild_id}, ${channel_id}, ${author_id}, ${star_count})
    ON CONFLICT (original_message_id) DO UPDATE SET
      star_count = excluded.star_count,
      starboard_message_id = excluded.starboard_message_id
  `;
}

export async function updateStarCount(
  original_message_id: string,
  star_count: number,
): Promise<void> {
  await db`
    UPDATE starboard SET star_count = ${star_count}
    WHERE original_message_id = ${original_message_id}
  `;
}

export async function removeStarboardEntry(
  original_message_id: string,
): Promise<void> {
  await db`DELETE FROM starboard WHERE original_message_id = ${original_message_id}`;
}

export async function dealExists(id: string): Promise<boolean> {
  const rows = await db`SELECT 1 FROM sent_deals WHERE id = ${id}`;
  return rows.length > 0;
}

export async function insertDeal(deal: any) {
  const date_now = new Date().toISOString().replace("T", " ").slice(0, 16);

  await db`
    INSERT INTO sent_deals
    (id, title, thumb, link, date, end_date)
    VALUES (
      ${deal.id},
      ${deal.title},
      ${deal.thumb},
      ${deal.link},
      ${date_now},
      ${deal.end_date}
    )
  `;
}

export async function getRoom(channel_id: string) {
  const [row] = await db`
    SELECT * FROM rooms WHERE channel_id = ${channel_id}
  `;
  return row ?? null;
}

export async function getRoomsByOwner(owner_id: string) {
  return await db`
    SELECT * FROM rooms WHERE owner_id = ${owner_id}
  `;
}

export async function getRoomsByGuild(guild_id: string) {
  return await db`
    SELECT * FROM rooms WHERE guild_id = ${guild_id}
  `;
}

export async function createRoom(
  channel_id: string,
  guild_id: string,
  owner_id: string,
  options?: {
    locked?: boolean;
    hidden?: boolean;
    limit?: number;
  },
) {
  const now = Date.now();

  await db`
    INSERT INTO rooms (
      channel_id, guild_id, owner_id, locked, hidden, user_limit, created_at, updated_at
    )
    VALUES (
      ${channel_id},
      ${guild_id},
      ${owner_id},
      ${options?.locked ? 1 : 0},
      ${options?.hidden ? 1 : 0},
      ${options?.limit ?? null},
      ${now},
      ${now}
    )
  `;
}

export async function updateRoom(
  channel_id: string,
  data: {
    locked?: boolean;
    hidden?: boolean;
    limit?: number | null;
  },
) {
  await db`
    UPDATE rooms SET
      locked = ${data.locked !== undefined ? (data.locked ? 1 : 0) : db`locked`},
      hidden = ${data.hidden !== undefined ? (data.hidden ? 1 : 0) : db`hidden`},
      user_limit = ${data.limit !== undefined ? data.limit : db`user_limit`},
      updated_at = ${Date.now()}
    WHERE channel_id = ${channel_id}
  `;
}

export async function deleteRoom(channel_id: string) {
  await db`DELETE FROM rooms WHERE channel_id = ${channel_id}`;
}

export async function cleanupOAuthStates() {
  await db`
    DELETE FROM oauth_states
    WHERE created_at < ${Date.now() - 1000 * 60 * 10}
  `;
}

export async function getLiveStream(user_id: string) {
  const [row] = await db`
    SELECT * FROM live_streams WHERE user_id = ${user_id}
  `;
  return row ?? null;
}

export async function setLiveStream(data: {
  user_id: string;
  guild_id: string;
  channel_id: string;
  message_id: string;
  platform: string;
}) {
  await db`
    INSERT INTO live_streams (
      user_id, guild_id, channel_id, message_id, platform, started_at
    )
    VALUES (
      ${data.user_id},
      ${data.guild_id},
      ${data.channel_id},
      ${data.message_id},
      ${data.platform},
      ${Date.now()}
    )
    ON CONFLICT(user_id) DO UPDATE SET
      guild_id = excluded.guild_id,
      channel_id = excluded.channel_id,
      message_id = excluded.message_id,
      platform = excluded.platform;
  `;
}

export async function removeLiveStream(user_id: string) {
  await db`
    DELETE FROM live_streams WHERE user_id = ${user_id}
  `;
}
