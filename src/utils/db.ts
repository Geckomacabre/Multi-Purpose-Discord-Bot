import { SQL } from 'bun';

// ─── Types ────────────────────────────────────────────────────────────────────

export type IConfig = { guild_id: string };

export type ICounting = {
  guild_id: string;
  channel_id: string;
  count: number;
  highscore?: number;
  last_msg?: { message_id: string; author_id: string; number: number; failed?: boolean } | null;
};

export type IModCase = {
  id: number;
  guild_id: string;
  case_num: number;
  type: 'ban' | 'unban' | 'kick' | 'timeout' | 'removetimeout' | 'warn' | 'report';
  user_id: string;
  user_tag: string;
  mod_id: string;
  mod_tag: string;
  reason: string | null;
  created_at: number;
  expires_at: number | null;
  active: number;
};

export type IModConfig = {
  guild_id: string;
  modlog_channel_id: string | null;
  dm_on_punish: number;
  next_case_num: number;
};

export type IWarning = {
  id: number;
  guild_id: string;
  user_id: string;
  mod_id: string;
  reason: string;
  created_at: number;
};

export type IAutomodRule = {
  id: number;
  guild_id: string;
  name: string;
  enabled: number;
  trigger_type: string;
  trigger_value: string;
  action: string;
  action_duration: number | null;
  action_reason: string | null;
};

export type ILogConfig = {
  guild_id: string;
  channel_id: string | null;
  enabled: number;
  log_joins: number;
  log_leaves: number;
  log_message_edits: number;
  log_message_deletes: number;
  log_bans: number;
  log_nickname_changes: number;
  log_role_changes: number;
  ignored_channels: string;
};

export type IAutorole = {
  id: number;
  guild_id: string;
  role_id: string;
  wait_seconds: number;
};

export type IRoleCommand = {
  id: number;
  guild_id: string;
  name: string;
  role_id: string;
  group_name: string | null;
  require_roles: string;
  ignore_roles: string;
};

export type IVoiceRole = {
  id: number;
  guild_id: string;
  voice_channel_id: string;
  role_id: string;
};

export type IReputation = {
  guild_id: string;
  user_id: string;
  points: number;
};

export type IRepConfig = {
  guild_id: string;
  cooldown_seconds: number;
};

export type ITicketConfig = {
  guild_id: string;
  category_id: string | null;
  log_channel_id: string | null;
  support_role_id: string | null;
  next_ticket_num: number;
};

export type ITicket = {
  id: number;
  guild_id: string;
  channel_id: string;
  user_id: string;
  ticket_num: number;
  status: string;
  topic: string | null;
  created_at: number;
  closed_at: number | null;
};

export type IReminder = {
  id: number;
  user_id: string;
  channel_id: string;
  guild_id: string | null;
  message: string;
  fires_at: number;
  created_at: number;
};

export type ICustomCommand = {
  id: number;
  guild_id: string;
  name: string;
  trigger_type: 'command' | 'startswith' | 'contains' | 'regex' | 'exact';
  trigger: string;
  response: string;
  enabled: number;
  created_by: string;
};

export type ITwitchFeed = {
  id: number;
  guild_id: string;
  channel_id: string;
  twitch_username: string;
  message: string | null;
  live: number;
  last_checked: number | null;
};

export type IYoutubeFeed = {
  id: number;
  guild_id: string;
  channel_id: string;
  youtube_channel_id: string;
  youtube_channel_name: string | null;
  last_video_id: string | null;
  message: string | null;
};

export type IRedditFeed = {
  id: number;
  guild_id: string;
  channel_id: string;
  subreddit: string;
  nsfw: number;
  last_post_id: string | null;
};

export type IRssFeed = {
  id: number;
  guild_id: string;
  channel_id: string;
  feed_url: string;
  last_item_id: string | null;
};

export type IServerStat = {
  guild_id: string;
  hour_bucket: number;
  messages: number;
  joins: number;
  leaves: number;
};

export type IStreamingConfig = {
  guild_id: string;
  announce_channel_id: string | null;
  give_role_id: string | null;
  message: string;
};

export type IRsvpEvent = {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  title: string;
  description: string | null;
  starts_at: number;
  created_by: string;
  created_at: number;
};

export type IRsvpResponse = {
  event_id: number;
  user_id: string;
  status: 'attending' | 'declined' | 'maybe';
};

export type IScheduledTask = {
  id: number;
  type: string;
  guild_id: string | null;
  user_id: string | null;
  channel_id: string | null;
  data: string | null;
  fires_at: number;
  fired: number;
};

export type IEconomy = {
  guild_id: string;
  user_id: string;
  balance: number;
  total_earned: number;
};

export type IEconomyConfig = {
  guild_id: string;
  currency_name: string;
  currency_symbol: string;
  starting_balance: number;
  daily_min: number;
  daily_max: number;
  work_min: number;
  work_max: number;
};

export type IXp = {
  guild_id: string;
  user_id: string;
  xp: number;
  level: number;
  total_messages: number;
};

export type IXpConfig = {
  guild_id: string;
  enabled: number;
  xp_min: number;
  xp_max: number;
  cooldown_seconds: number;
  level_up_channel_id: string | null;
  level_up_message: string;
};

export type ILevelRole = {
  id: number;
  guild_id: string;
  level: number;
  role_id: string;
};

// ─── DB instance ─────────────────────────────────────────────────────────────

export const db = new SQL('sqlite://db.sqlite');

// ─── Init ─────────────────────────────────────────────────────────────────────

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

  await db`CREATE TABLE IF NOT EXISTS config (guild_id TEXT PRIMARY KEY)`;

  await db`CREATE TABLE IF NOT EXISTS counting (
    channel_id TEXT PRIMARY KEY,
    guild_id   TEXT NOT NULL,
    count      INTEGER NOT NULL DEFAULT 0,
    highscore  INTEGER NOT NULL DEFAULT 0,
    last_msg   TEXT DEFAULT '{}',
    FOREIGN KEY (guild_id) REFERENCES config(guild_id) ON DELETE CASCADE
  )`;

  await db`CREATE TABLE IF NOT EXISTS mod_config (
    guild_id           TEXT PRIMARY KEY,
    modlog_channel_id  TEXT,
    dm_on_punish       INTEGER NOT NULL DEFAULT 1,
    next_case_num      INTEGER NOT NULL DEFAULT 1
  )`;

  await db`CREATE TABLE IF NOT EXISTS mod_cases (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    case_num    INTEGER NOT NULL,
    type        TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    user_tag    TEXT NOT NULL,
    mod_id      TEXT NOT NULL,
    mod_tag     TEXT NOT NULL,
    reason      TEXT,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER,
    active      INTEGER NOT NULL DEFAULT 1
  )`;

  await db`CREATE TABLE IF NOT EXISTS warnings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    mod_id     TEXT NOT NULL,
    reason     TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`;

  await db`CREATE TABLE IF NOT EXISTS automod_rules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id        TEXT NOT NULL,
    name            TEXT NOT NULL,
    enabled         INTEGER NOT NULL DEFAULT 1,
    trigger_type    TEXT NOT NULL,
    trigger_value   TEXT NOT NULL DEFAULT '',
    action          TEXT NOT NULL,
    action_duration INTEGER,
    action_reason   TEXT
  )`;

  await db`CREATE TABLE IF NOT EXISTS log_config (
    guild_id              TEXT PRIMARY KEY,
    channel_id            TEXT,
    enabled               INTEGER NOT NULL DEFAULT 1,
    log_joins             INTEGER NOT NULL DEFAULT 1,
    log_leaves            INTEGER NOT NULL DEFAULT 1,
    log_message_edits     INTEGER NOT NULL DEFAULT 1,
    log_message_deletes   INTEGER NOT NULL DEFAULT 1,
    log_bans              INTEGER NOT NULL DEFAULT 1,
    log_nickname_changes  INTEGER NOT NULL DEFAULT 1,
    log_role_changes      INTEGER NOT NULL DEFAULT 1,
    ignored_channels      TEXT NOT NULL DEFAULT '[]'
  )`;

  await db`CREATE TABLE IF NOT EXISTS autoroles (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id     TEXT NOT NULL,
    role_id      TEXT NOT NULL,
    wait_seconds INTEGER NOT NULL DEFAULT 0
  )`;

  await db`CREATE TABLE IF NOT EXISTS rolecommands (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id      TEXT NOT NULL,
    name          TEXT NOT NULL,
    role_id       TEXT NOT NULL,
    group_name    TEXT,
    require_roles TEXT NOT NULL DEFAULT '[]',
    ignore_roles  TEXT NOT NULL DEFAULT '[]'
  )`;

  await db`CREATE TABLE IF NOT EXISTS voiceroles (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id         TEXT NOT NULL,
    voice_channel_id TEXT NOT NULL,
    role_id          TEXT NOT NULL
  )`;

  await db`CREATE TABLE IF NOT EXISTS reputation (
    guild_id TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    points   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  )`;

  await db`CREATE TABLE IF NOT EXISTS rep_config (
    guild_id         TEXT PRIMARY KEY,
    cooldown_seconds INTEGER NOT NULL DEFAULT 3600
  )`;

  await db`CREATE TABLE IF NOT EXISTS rep_cooldowns (
    guild_id     TEXT NOT NULL,
    from_user_id TEXT NOT NULL,
    to_user_id   TEXT NOT NULL,
    last_rep     INTEGER NOT NULL,
    PRIMARY KEY (guild_id, from_user_id, to_user_id)
  )`;

  await db`CREATE TABLE IF NOT EXISTS ticket_config (
    guild_id        TEXT PRIMARY KEY,
    category_id     TEXT,
    log_channel_id  TEXT,
    support_role_id TEXT,
    next_ticket_num INTEGER NOT NULL DEFAULT 1
  )`;

  await db`CREATE TABLE IF NOT EXISTS tickets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id   TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    ticket_num INTEGER NOT NULL,
    status     TEXT NOT NULL DEFAULT 'open',
    topic      TEXT,
    created_at INTEGER NOT NULL,
    closed_at  INTEGER
  )`;

  await db`CREATE TABLE IF NOT EXISTS reminders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    guild_id   TEXT,
    message    TEXT NOT NULL,
    fires_at   INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`;

  await db`CREATE TABLE IF NOT EXISTS custom_commands (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id     TEXT NOT NULL,
    name         TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    trigger      TEXT NOT NULL,
    response     TEXT NOT NULL,
    enabled      INTEGER NOT NULL DEFAULT 1,
    created_by   TEXT NOT NULL
  )`;

  await db`CREATE TABLE IF NOT EXISTS twitch_feeds (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id         TEXT NOT NULL,
    channel_id       TEXT NOT NULL,
    twitch_username  TEXT NOT NULL,
    message          TEXT,
    live             INTEGER NOT NULL DEFAULT 0,
    last_checked     INTEGER
  )`;

  await db`CREATE TABLE IF NOT EXISTS youtube_feeds (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id             TEXT NOT NULL,
    channel_id           TEXT NOT NULL,
    youtube_channel_id   TEXT NOT NULL,
    youtube_channel_name TEXT,
    last_video_id        TEXT,
    message              TEXT
  )`;

  await db`CREATE TABLE IF NOT EXISTS reddit_feeds (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id     TEXT NOT NULL,
    channel_id   TEXT NOT NULL,
    subreddit    TEXT NOT NULL,
    nsfw         INTEGER NOT NULL DEFAULT 0,
    last_post_id TEXT
  )`;

  await db`CREATE TABLE IF NOT EXISTS rss_feeds (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id     TEXT NOT NULL,
    channel_id   TEXT NOT NULL,
    feed_url     TEXT NOT NULL,
    last_item_id TEXT
  )`;

  await db`CREATE TABLE IF NOT EXISTS serverstats (
    guild_id    TEXT NOT NULL,
    hour_bucket INTEGER NOT NULL,
    messages    INTEGER NOT NULL DEFAULT 0,
    joins       INTEGER NOT NULL DEFAULT 0,
    leaves      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, hour_bucket)
  )`;

  await db`CREATE TABLE IF NOT EXISTS streaming_config (
    guild_id           TEXT PRIMARY KEY,
    announce_channel_id TEXT,
    give_role_id       TEXT,
    message            TEXT NOT NULL DEFAULT 'Now live: **{username}** is streaming **{game}**!\n{url}'
  )`;

  await db`CREATE TABLE IF NOT EXISTS rsvp_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    channel_id  TEXT NOT NULL,
    message_id  TEXT,
    title       TEXT NOT NULL,
    description TEXT,
    starts_at   INTEGER NOT NULL,
    created_by  TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  )`;

  await db`CREATE TABLE IF NOT EXISTS rsvp_responses (
    event_id INTEGER NOT NULL,
    user_id  TEXT NOT NULL,
    status   TEXT NOT NULL,
    PRIMARY KEY (event_id, user_id)
  )`;

  await db`CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT NOT NULL,
    guild_id   TEXT,
    user_id    TEXT,
    channel_id TEXT,
    data       TEXT,
    fires_at   INTEGER NOT NULL,
    fired      INTEGER NOT NULL DEFAULT 0
  )`;

  await db`CREATE TABLE IF NOT EXISTS economy (
    guild_id     TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    balance      INTEGER NOT NULL DEFAULT 0,
    total_earned INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  )`;

  await db`CREATE TABLE IF NOT EXISTS economy_config (
    guild_id         TEXT PRIMARY KEY,
    currency_name    TEXT NOT NULL DEFAULT 'coins',
    currency_symbol  TEXT NOT NULL DEFAULT '🪙',
    starting_balance INTEGER NOT NULL DEFAULT 0,
    daily_min        INTEGER NOT NULL DEFAULT 100,
    daily_max        INTEGER NOT NULL DEFAULT 500,
    work_min         INTEGER NOT NULL DEFAULT 50,
    work_max         INTEGER NOT NULL DEFAULT 200
  )`;

  await db`CREATE TABLE IF NOT EXISTS economy_cooldowns (
    guild_id  TEXT NOT NULL,
    user_id   TEXT NOT NULL,
    type      TEXT NOT NULL,
    last_used INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id, type)
  )`;

  await db`CREATE TABLE IF NOT EXISTS xp (
    guild_id       TEXT NOT NULL,
    user_id        TEXT NOT NULL,
    xp             INTEGER NOT NULL DEFAULT 0,
    level          INTEGER NOT NULL DEFAULT 0,
    total_messages INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  )`;

  await db`CREATE TABLE IF NOT EXISTS xp_config (
    guild_id            TEXT PRIMARY KEY,
    enabled             INTEGER NOT NULL DEFAULT 1,
    xp_min              INTEGER NOT NULL DEFAULT 15,
    xp_max              INTEGER NOT NULL DEFAULT 25,
    cooldown_seconds    INTEGER NOT NULL DEFAULT 60,
    level_up_channel_id TEXT,
    level_up_message    TEXT NOT NULL DEFAULT 'GG {user}, you just advanced to **level {level}**! 🎉'
  )`;

  await db`CREATE TABLE IF NOT EXISTS level_roles (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    level    INTEGER NOT NULL,
    role_id  TEXT NOT NULL
  )`;
}

// ─── Guild cleanup ────────────────────────────────────────────────────────────

export async function removeGuild(guild_id: string) {
  await db`DELETE FROM config WHERE guild_id = ${guild_id}`;
  for (const table of [
    'counting', 'mod_config', 'mod_cases', 'warnings', 'automod_rules',
    'log_config', 'autoroles', 'rolecommands', 'voiceroles', 'reputation',
    'rep_config', 'rep_cooldowns', 'ticket_config', 'tickets', 'reminders',
    'custom_commands', 'twitch_feeds', 'youtube_feeds', 'reddit_feeds',
    'rss_feeds', 'serverstats', 'streaming_config', 'rsvp_events',
    'economy', 'economy_config', 'economy_cooldowns', 'xp', 'xp_config', 'level_roles',
  ]) {
    await db`DELETE FROM ${db(table)} WHERE guild_id = ${guild_id}`.catch(() => {});
  }
}

export async function ensureConfig(guild_id: string) {
  await db`INSERT INTO config (guild_id) VALUES (${guild_id}) ON CONFLICT(guild_id) DO NOTHING`;
}

// ─── Counting ─────────────────────────────────────────────────────────────────

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
) {
  await ensureConfig(guild_id);
  const lastMsgStr = last_msg ? JSON.stringify(last_msg) : '{}';
  await db`
    INSERT INTO counting (channel_id, guild_id, count, highscore, last_msg)
    VALUES (${channel_id}, ${guild_id}, ${count}, ${highscore}, ${lastMsgStr})
    ON CONFLICT(channel_id) DO UPDATE SET
      count = excluded.count, highscore = excluded.highscore, last_msg = excluded.last_msg
  `;
}

export async function updateCounting(
  channel_id: string,
  fields: Partial<Pick<ICounting, 'count' | 'highscore' | 'last_msg'>>
) {
  await db`
    UPDATE counting SET
      count     = ${fields.count     !== undefined ? fields.count     : db`count`},
      highscore = ${fields.highscore !== undefined ? fields.highscore : db`highscore`},
      last_msg  = ${fields.last_msg  !== undefined ? JSON.stringify(fields.last_msg) : db`last_msg`}
    WHERE channel_id = ${channel_id}
  `;
}

export async function unsetCounting(channel_id: string) {
  await db`DELETE FROM counting WHERE channel_id = ${channel_id}`;
}

export async function removeCountingByChannelId(guild_id: string, channel_id: string) {
  await db`DELETE FROM counting WHERE channel_id = ${channel_id} AND guild_id = ${guild_id}`;
}

// ─── Mod config ───────────────────────────────────────────────────────────────

export async function getModConfig(guild_id: string): Promise<IModConfig> {
  const [row] = await db`SELECT * FROM mod_config WHERE guild_id = ${guild_id}`;
  if (row) return row as IModConfig;
  await ensureConfig(guild_id);
  await db`INSERT OR IGNORE INTO mod_config (guild_id) VALUES (${guild_id})`;
  return { guild_id, modlog_channel_id: null, dm_on_punish: 1, next_case_num: 1 };
}

export async function setModlogChannel(guild_id: string, channel_id: string | null) {
  await ensureConfig(guild_id);
  await db`
    INSERT INTO mod_config (guild_id, modlog_channel_id) VALUES (${guild_id}, ${channel_id})
    ON CONFLICT(guild_id) DO UPDATE SET modlog_channel_id = excluded.modlog_channel_id
  `;
}

export async function createModCase(
  guild_id: string,
  type: IModCase['type'],
  user_id: string,
  user_tag: string,
  mod_id: string,
  mod_tag: string,
  reason: string | null,
  expires_at: number | null = null
): Promise<IModCase> {
  await ensureConfig(guild_id);
  await db`INSERT OR IGNORE INTO mod_config (guild_id) VALUES (${guild_id})`;
  const cfg = await getModConfig(guild_id);
  const case_num = cfg.next_case_num;
  await db`UPDATE mod_config SET next_case_num = next_case_num + 1 WHERE guild_id = ${guild_id}`;
  const created_at = Date.now();
  const [row] = await db`
    INSERT INTO mod_cases (guild_id, case_num, type, user_id, user_tag, mod_id, mod_tag, reason, created_at, expires_at)
    VALUES (${guild_id}, ${case_num}, ${type}, ${user_id}, ${user_tag}, ${mod_id}, ${mod_tag}, ${reason}, ${created_at}, ${expires_at})
    RETURNING *
  `;
  return row as IModCase;
}

export async function getModCase(guild_id: string, case_num: number): Promise<IModCase | null> {
  const [row] = await db`SELECT * FROM mod_cases WHERE guild_id = ${guild_id} AND case_num = ${case_num}`;
  return (row as IModCase) || null;
}

export async function updateModCaseReason(guild_id: string, case_num: number, reason: string) {
  await db`UPDATE mod_cases SET reason = ${reason} WHERE guild_id = ${guild_id} AND case_num = ${case_num}`;
}

export async function getActiveBans(guild_id: string): Promise<IModCase[]> {
  const rows = await db`SELECT * FROM mod_cases WHERE guild_id = ${guild_id} AND type = 'ban' AND active = 1 AND expires_at IS NOT NULL`;
  return rows as IModCase[];
}

export async function deactivateModCase(guild_id: string, case_num: number) {
  await db`UPDATE mod_cases SET active = 0 WHERE guild_id = ${guild_id} AND case_num = ${case_num}`;
}

// ─── Warnings ─────────────────────────────────────────────────────────────────

export async function addWarning(guild_id: string, user_id: string, mod_id: string, reason: string): Promise<IWarning> {
  const [row] = await db`
    INSERT INTO warnings (guild_id, user_id, mod_id, reason, created_at)
    VALUES (${guild_id}, ${user_id}, ${mod_id}, ${reason}, ${Date.now()})
    RETURNING *
  `;
  return row as IWarning;
}

export async function getWarnings(guild_id: string, user_id: string): Promise<IWarning[]> {
  const rows = await db`SELECT * FROM warnings WHERE guild_id = ${guild_id} AND user_id = ${user_id} ORDER BY created_at DESC`;
  return rows as IWarning[];
}

export async function deleteWarning(id: number, guild_id: string): Promise<boolean> {
  const result = await db`DELETE FROM warnings WHERE id = ${id} AND guild_id = ${guild_id} RETURNING id`;
  return result.length > 0;
}

export async function clearWarnings(guild_id: string, user_id: string): Promise<number> {
  const result = await db`DELETE FROM warnings WHERE guild_id = ${guild_id} AND user_id = ${user_id} RETURNING id`;
  return result.length;
}

// ─── Automod ──────────────────────────────────────────────────────────────────

export async function getAutomodRules(guild_id: string): Promise<IAutomodRule[]> {
  const rows = await db`SELECT * FROM automod_rules WHERE guild_id = ${guild_id} ORDER BY id`;
  return rows as IAutomodRule[];
}

export async function getAutomodRule(id: number, guild_id: string): Promise<IAutomodRule | null> {
  const [row] = await db`SELECT * FROM automod_rules WHERE id = ${id} AND guild_id = ${guild_id}`;
  return (row as IAutomodRule) || null;
}

export async function createAutomodRule(
  guild_id: string,
  name: string,
  trigger_type: string,
  trigger_value: string,
  action: string,
  action_duration: number | null,
  action_reason: string | null
): Promise<IAutomodRule> {
  await ensureConfig(guild_id);
  const [row] = await db`
    INSERT INTO automod_rules (guild_id, name, trigger_type, trigger_value, action, action_duration, action_reason)
    VALUES (${guild_id}, ${name}, ${trigger_type}, ${trigger_value}, ${action}, ${action_duration}, ${action_reason})
    RETURNING *
  `;
  return row as IAutomodRule;
}

export async function deleteAutomodRule(id: number, guild_id: string): Promise<boolean> {
  const result = await db`DELETE FROM automod_rules WHERE id = ${id} AND guild_id = ${guild_id} RETURNING id`;
  return result.length > 0;
}

export async function toggleAutomodRule(id: number, guild_id: string, enabled: boolean) {
  await db`UPDATE automod_rules SET enabled = ${enabled ? 1 : 0} WHERE id = ${id} AND guild_id = ${guild_id}`;
}

// ─── Log config ───────────────────────────────────────────────────────────────

export async function getLogConfig(guild_id: string): Promise<ILogConfig | null> {
  const [row] = await db`SELECT * FROM log_config WHERE guild_id = ${guild_id}`;
  return (row as ILogConfig) || null;
}

export async function setLogChannel(guild_id: string, channel_id: string | null) {
  await ensureConfig(guild_id);
  await db`
    INSERT INTO log_config (guild_id, channel_id) VALUES (${guild_id}, ${channel_id})
    ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id
  `;
}

export async function updateLogConfig(guild_id: string, fields: Partial<Omit<ILogConfig, 'guild_id'>>) {
  await ensureConfig(guild_id);
  await db`INSERT OR IGNORE INTO log_config (guild_id) VALUES (${guild_id})`;
  if (fields.channel_id !== undefined) await db`UPDATE log_config SET channel_id = ${fields.channel_id} WHERE guild_id = ${guild_id}`;
  if (fields.enabled !== undefined) await db`UPDATE log_config SET enabled = ${fields.enabled} WHERE guild_id = ${guild_id}`;
  if (fields.log_joins !== undefined) await db`UPDATE log_config SET log_joins = ${fields.log_joins} WHERE guild_id = ${guild_id}`;
  if (fields.log_leaves !== undefined) await db`UPDATE log_config SET log_leaves = ${fields.log_leaves} WHERE guild_id = ${guild_id}`;
  if (fields.log_message_edits !== undefined) await db`UPDATE log_config SET log_message_edits = ${fields.log_message_edits} WHERE guild_id = ${guild_id}`;
  if (fields.log_message_deletes !== undefined) await db`UPDATE log_config SET log_message_deletes = ${fields.log_message_deletes} WHERE guild_id = ${guild_id}`;
  if (fields.log_bans !== undefined) await db`UPDATE log_config SET log_bans = ${fields.log_bans} WHERE guild_id = ${guild_id}`;
  if (fields.log_nickname_changes !== undefined) await db`UPDATE log_config SET log_nickname_changes = ${fields.log_nickname_changes} WHERE guild_id = ${guild_id}`;
  if (fields.log_role_changes !== undefined) await db`UPDATE log_config SET log_role_changes = ${fields.log_role_changes} WHERE guild_id = ${guild_id}`;
  if (fields.ignored_channels !== undefined) await db`UPDATE log_config SET ignored_channels = ${fields.ignored_channels} WHERE guild_id = ${guild_id}`;
}

// ─── Autorole ─────────────────────────────────────────────────────────────────

export async function getAutoroles(guild_id: string): Promise<IAutorole[]> {
  const rows = await db`SELECT * FROM autoroles WHERE guild_id = ${guild_id}`;
  return rows as IAutorole[];
}

export async function addAutorole(guild_id: string, role_id: string, wait_seconds = 0): Promise<IAutorole> {
  await ensureConfig(guild_id);
  const [row] = await db`
    INSERT INTO autoroles (guild_id, role_id, wait_seconds)
    VALUES (${guild_id}, ${role_id}, ${wait_seconds})
    RETURNING *
  `;
  return row as IAutorole;
}

export async function removeAutorole(id: number, guild_id: string): Promise<boolean> {
  const result = await db`DELETE FROM autoroles WHERE id = ${id} AND guild_id = ${guild_id} RETURNING id`;
  return result.length > 0;
}

// ─── Role commands ────────────────────────────────────────────────────────────

export async function getRoleCommands(guild_id: string): Promise<IRoleCommand[]> {
  const rows = await db`SELECT * FROM rolecommands WHERE guild_id = ${guild_id} ORDER BY name`;
  return rows as IRoleCommand[];
}

export async function addRoleCommand(guild_id: string, name: string, role_id: string, group_name: string | null = null): Promise<IRoleCommand> {
  await ensureConfig(guild_id);
  const [row] = await db`
    INSERT INTO rolecommands (guild_id, name, role_id, group_name)
    VALUES (${guild_id}, ${name}, ${role_id}, ${group_name})
    RETURNING *
  `;
  return row as IRoleCommand;
}

export async function removeRoleCommand(id: number, guild_id: string): Promise<boolean> {
  const result = await db`DELETE FROM rolecommands WHERE id = ${id} AND guild_id = ${guild_id} RETURNING id`;
  return result.length > 0;
}

export async function getRoleCommandByName(guild_id: string, name: string): Promise<IRoleCommand | null> {
  const [row] = await db`SELECT * FROM rolecommands WHERE guild_id = ${guild_id} AND LOWER(name) = LOWER(${name})`;
  return (row as IRoleCommand) || null;
}

// ─── Voice roles ──────────────────────────────────────────────────────────────

export async function getVoiceRoles(guild_id: string): Promise<IVoiceRole[]> {
  const rows = await db`SELECT * FROM voiceroles WHERE guild_id = ${guild_id}`;
  return rows as IVoiceRole[];
}

export async function getVoiceRolesForChannel(guild_id: string, voice_channel_id: string): Promise<IVoiceRole[]> {
  const rows = await db`SELECT * FROM voiceroles WHERE guild_id = ${guild_id} AND voice_channel_id = ${voice_channel_id}`;
  return rows as IVoiceRole[];
}

export async function addVoiceRole(guild_id: string, voice_channel_id: string, role_id: string): Promise<IVoiceRole> {
  await ensureConfig(guild_id);
  const [row] = await db`
    INSERT INTO voiceroles (guild_id, voice_channel_id, role_id)
    VALUES (${guild_id}, ${voice_channel_id}, ${role_id})
    RETURNING *
  `;
  return row as IVoiceRole;
}

export async function removeVoiceRole(id: number, guild_id: string): Promise<boolean> {
  const result = await db`DELETE FROM voiceroles WHERE id = ${id} AND guild_id = ${guild_id} RETURNING id`;
  return result.length > 0;
}

// ─── Reputation ───────────────────────────────────────────────────────────────

export async function getReputation(guild_id: string, user_id: string): Promise<IReputation | null> {
  const [row] = await db`SELECT * FROM reputation WHERE guild_id = ${guild_id} AND user_id = ${user_id}`;
  return (row as IReputation) || null;
}

export async function adjustReputation(guild_id: string, user_id: string, delta: number): Promise<number> {
  await ensureConfig(guild_id);
  const [row] = await db`
    INSERT INTO reputation (guild_id, user_id, points) VALUES (${guild_id}, ${user_id}, ${delta})
    ON CONFLICT(guild_id, user_id) DO UPDATE SET points = points + ${delta}
    RETURNING points
  `;
  return row.points as number;
}

export async function getRepLeaderboard(guild_id: string, limit = 10): Promise<(IReputation & { rank: number })[]> {
  const rows = await db`
    SELECT *, RANK() OVER (ORDER BY points DESC) as rank
    FROM reputation WHERE guild_id = ${guild_id}
    ORDER BY points DESC LIMIT ${limit}
  `;
  return rows as (IReputation & { rank: number })[];
}

export async function getRepConfig(guild_id: string): Promise<IRepConfig> {
  const [row] = await db`SELECT * FROM rep_config WHERE guild_id = ${guild_id}`;
  return (row as IRepConfig) || { guild_id, cooldown_seconds: 3600 };
}

export async function checkRepCooldown(guild_id: string, from_user_id: string, to_user_id: string): Promise<number> {
  const [row] = await db`
    SELECT last_rep FROM rep_cooldowns
    WHERE guild_id = ${guild_id} AND from_user_id = ${from_user_id} AND to_user_id = ${to_user_id}
  `;
  return row ? (row.last_rep as number) : 0;
}

export async function setRepCooldown(guild_id: string, from_user_id: string, to_user_id: string) {
  await db`
    INSERT INTO rep_cooldowns (guild_id, from_user_id, to_user_id, last_rep)
    VALUES (${guild_id}, ${from_user_id}, ${to_user_id}, ${Date.now()})
    ON CONFLICT(guild_id, from_user_id, to_user_id) DO UPDATE SET last_rep = excluded.last_rep
  `;
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

export async function getTicketConfig(guild_id: string): Promise<ITicketConfig | null> {
  const [row] = await db`SELECT * FROM ticket_config WHERE guild_id = ${guild_id}`;
  return (row as ITicketConfig) || null;
}

export async function setTicketConfig(guild_id: string, fields: Partial<Omit<ITicketConfig, 'guild_id' | 'next_ticket_num'>>) {
  await ensureConfig(guild_id);
  await db`
    INSERT INTO ticket_config (guild_id, category_id, log_channel_id, support_role_id)
    VALUES (${guild_id}, ${fields.category_id ?? null}, ${fields.log_channel_id ?? null}, ${fields.support_role_id ?? null})
    ON CONFLICT(guild_id) DO UPDATE SET
      category_id = COALESCE(excluded.category_id, category_id),
      log_channel_id = COALESCE(excluded.log_channel_id, log_channel_id),
      support_role_id = COALESCE(excluded.support_role_id, support_role_id)
  `;
}

export async function createTicket(guild_id: string, channel_id: string, user_id: string, topic: string | null): Promise<ITicket> {
  await ensureConfig(guild_id);
  await db`INSERT OR IGNORE INTO ticket_config (guild_id) VALUES (${guild_id})`;
  const cfg = await getTicketConfig(guild_id);
  const ticket_num = cfg?.next_ticket_num ?? 1;
  await db`UPDATE ticket_config SET next_ticket_num = next_ticket_num + 1 WHERE guild_id = ${guild_id}`;
  const [row] = await db`
    INSERT INTO tickets (guild_id, channel_id, user_id, ticket_num, topic, created_at)
    VALUES (${guild_id}, ${channel_id}, ${user_id}, ${ticket_num}, ${topic}, ${Date.now()})
    RETURNING *
  `;
  return row as ITicket;
}

export async function getTicketByChannel(channel_id: string): Promise<ITicket | null> {
  const [row] = await db`SELECT * FROM tickets WHERE channel_id = ${channel_id} AND status = 'open'`;
  return (row as ITicket) || null;
}

export async function closeTicket(channel_id: string): Promise<ITicket | null> {
  const [row] = await db`
    UPDATE tickets SET status = 'closed', closed_at = ${Date.now()}
    WHERE channel_id = ${channel_id} AND status = 'open'
    RETURNING *
  `;
  return (row as ITicket) || null;
}

// ─── Reminders ────────────────────────────────────────────────────────────────

export async function createReminder(user_id: string, channel_id: string, guild_id: string | null, message: string, fires_at: number): Promise<IReminder> {
  const [row] = await db`
    INSERT INTO reminders (user_id, channel_id, guild_id, message, fires_at, created_at)
    VALUES (${user_id}, ${channel_id}, ${guild_id}, ${message}, ${fires_at}, ${Date.now()})
    RETURNING *
  `;
  return row as IReminder;
}

export async function getReminders(user_id: string): Promise<IReminder[]> {
  const rows = await db`SELECT * FROM reminders WHERE user_id = ${user_id} ORDER BY fires_at ASC`;
  return rows as IReminder[];
}

export async function deleteReminder(id: number, user_id: string): Promise<boolean> {
  const result = await db`DELETE FROM reminders WHERE id = ${id} AND user_id = ${user_id} RETURNING id`;
  return result.length > 0;
}

export async function getPendingReminders(before: number): Promise<IReminder[]> {
  const rows = await db`SELECT * FROM reminders WHERE fires_at <= ${before}`;
  return rows as IReminder[];
}

export async function fireReminder(id: number) {
  await db`DELETE FROM reminders WHERE id = ${id}`;
}

// ─── Custom commands ──────────────────────────────────────────────────────────

export async function getCustomCommands(guild_id: string): Promise<ICustomCommand[]> {
  const rows = await db`SELECT * FROM custom_commands WHERE guild_id = ${guild_id} AND enabled = 1 ORDER BY name`;
  return rows as ICustomCommand[];
}

export async function getAllCustomCommands(guild_id: string): Promise<ICustomCommand[]> {
  const rows = await db`SELECT * FROM custom_commands WHERE guild_id = ${guild_id} ORDER BY name`;
  return rows as ICustomCommand[];
}

export async function createCustomCommand(
  guild_id: string, name: string, trigger_type: ICustomCommand['trigger_type'],
  trigger: string, response: string, created_by: string
): Promise<ICustomCommand> {
  await ensureConfig(guild_id);
  const [row] = await db`
    INSERT INTO custom_commands (guild_id, name, trigger_type, trigger, response, created_by)
    VALUES (${guild_id}, ${name}, ${trigger_type}, ${trigger}, ${response}, ${created_by})
    RETURNING *
  `;
  return row as ICustomCommand;
}

export async function editCustomCommand(id: number, guild_id: string, response: string): Promise<boolean> {
  const result = await db`UPDATE custom_commands SET response = ${response} WHERE id = ${id} AND guild_id = ${guild_id} RETURNING id`;
  return result.length > 0;
}

export async function deleteCustomCommand(id: number, guild_id: string): Promise<boolean> {
  const result = await db`DELETE FROM custom_commands WHERE id = ${id} AND guild_id = ${guild_id} RETURNING id`;
  return result.length > 0;
}

export async function toggleCustomCommand(id: number, guild_id: string, enabled: boolean) {
  await db`UPDATE custom_commands SET enabled = ${enabled ? 1 : 0} WHERE id = ${id} AND guild_id = ${guild_id}`;
}

// ─── Twitch feeds ─────────────────────────────────────────────────────────────

export async function getTwitchFeeds(guild_id: string): Promise<ITwitchFeed[]> {
  const rows = await db`SELECT * FROM twitch_feeds WHERE guild_id = ${guild_id}`;
  return rows as ITwitchFeed[];
}

export async function getAllTwitchFeeds(): Promise<ITwitchFeed[]> {
  const rows = await db`SELECT * FROM twitch_feeds`;
  return rows as ITwitchFeed[];
}

export async function addTwitchFeed(guild_id: string, channel_id: string, twitch_username: string, message: string | null = null): Promise<ITwitchFeed> {
  await ensureConfig(guild_id);
  const [row] = await db`
    INSERT INTO twitch_feeds (guild_id, channel_id, twitch_username, message)
    VALUES (${guild_id}, ${channel_id}, ${twitch_username.toLowerCase()}, ${message})
    RETURNING *
  `;
  return row as ITwitchFeed;
}

export async function removeTwitchFeed(id: number, guild_id: string): Promise<boolean> {
  const result = await db`DELETE FROM twitch_feeds WHERE id = ${id} AND guild_id = ${guild_id} RETURNING id`;
  return result.length > 0;
}

export async function updateTwitchFeedStatus(id: number, live: boolean) {
  await db`UPDATE twitch_feeds SET live = ${live ? 1 : 0}, last_checked = ${Date.now()} WHERE id = ${id}`;
}

// ─── YouTube feeds ────────────────────────────────────────────────────────────

export async function getYoutubeFeeds(guild_id: string): Promise<IYoutubeFeed[]> {
  const rows = await db`SELECT * FROM youtube_feeds WHERE guild_id = ${guild_id}`;
  return rows as IYoutubeFeed[];
}

export async function getAllYoutubeFeeds(): Promise<IYoutubeFeed[]> {
  const rows = await db`SELECT * FROM youtube_feeds`;
  return rows as IYoutubeFeed[];
}

export async function addYoutubeFeed(guild_id: string, channel_id: string, youtube_channel_id: string, youtube_channel_name: string | null, message: string | null = null): Promise<IYoutubeFeed> {
  await ensureConfig(guild_id);
  const [row] = await db`
    INSERT INTO youtube_feeds (guild_id, channel_id, youtube_channel_id, youtube_channel_name, message)
    VALUES (${guild_id}, ${channel_id}, ${youtube_channel_id}, ${youtube_channel_name}, ${message})
    RETURNING *
  `;
  return row as IYoutubeFeed;
}

export async function removeYoutubeFeed(id: number, guild_id: string): Promise<boolean> {
  const result = await db`DELETE FROM youtube_feeds WHERE id = ${id} AND guild_id = ${guild_id} RETURNING id`;
  return result.length > 0;
}

export async function updateYoutubeLastVideo(id: number, video_id: string) {
  await db`UPDATE youtube_feeds SET last_video_id = ${video_id} WHERE id = ${id}`;
}

// ─── Reddit feeds ─────────────────────────────────────────────────────────────

export async function getRedditFeeds(guild_id: string): Promise<IRedditFeed[]> {
  const rows = await db`SELECT * FROM reddit_feeds WHERE guild_id = ${guild_id}`;
  return rows as IRedditFeed[];
}

export async function getAllRedditFeeds(): Promise<IRedditFeed[]> {
  const rows = await db`SELECT * FROM reddit_feeds`;
  return rows as IRedditFeed[];
}

export async function addRedditFeed(guild_id: string, channel_id: string, subreddit: string, nsfw = false): Promise<IRedditFeed> {
  await ensureConfig(guild_id);
  const [row] = await db`
    INSERT INTO reddit_feeds (guild_id, channel_id, subreddit, nsfw)
    VALUES (${guild_id}, ${channel_id}, ${subreddit.toLowerCase()}, ${nsfw ? 1 : 0})
    RETURNING *
  `;
  return row as IRedditFeed;
}

export async function removeRedditFeed(id: number, guild_id: string): Promise<boolean> {
  const result = await db`DELETE FROM reddit_feeds WHERE id = ${id} AND guild_id = ${guild_id} RETURNING id`;
  return result.length > 0;
}

export async function updateRedditLastPost(id: number, post_id: string) {
  await db`UPDATE reddit_feeds SET last_post_id = ${post_id} WHERE id = ${id}`;
}

// ─── RSS feeds ────────────────────────────────────────────────────────────────

export async function getRssFeeds(guild_id: string): Promise<IRssFeed[]> {
  const rows = await db`SELECT * FROM rss_feeds WHERE guild_id = ${guild_id}`;
  return rows as IRssFeed[];
}

export async function getAllRssFeeds(): Promise<IRssFeed[]> {
  const rows = await db`SELECT * FROM rss_feeds`;
  return rows as IRssFeed[];
}

export async function addRssFeed(guild_id: string, channel_id: string, feed_url: string): Promise<IRssFeed> {
  await ensureConfig(guild_id);
  const [row] = await db`
    INSERT INTO rss_feeds (guild_id, channel_id, feed_url)
    VALUES (${guild_id}, ${channel_id}, ${feed_url})
    RETURNING *
  `;
  return row as IRssFeed;
}

export async function removeRssFeed(id: number, guild_id: string): Promise<boolean> {
  const result = await db`DELETE FROM rss_feeds WHERE id = ${id} AND guild_id = ${guild_id} RETURNING id`;
  return result.length > 0;
}

export async function updateRssLastItem(id: number, item_id: string) {
  await db`UPDATE rss_feeds SET last_item_id = ${item_id} WHERE id = ${id}`;
}

// ─── Server stats ─────────────────────────────────────────────────────────────

export async function incrementStat(guild_id: string, field: 'messages' | 'joins' | 'leaves') {
  await ensureConfig(guild_id);
  const bucket = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  // Upsert the row first so we can do a safe named-column update
  await db`INSERT OR IGNORE INTO serverstats (guild_id, hour_bucket) VALUES (${guild_id}, ${bucket})`;
  if (field === 'messages') await db`UPDATE serverstats SET messages = messages + 1 WHERE guild_id = ${guild_id} AND hour_bucket = ${bucket}`;
  else if (field === 'joins') await db`UPDATE serverstats SET joins = joins + 1 WHERE guild_id = ${guild_id} AND hour_bucket = ${bucket}`;
  else await db`UPDATE serverstats SET leaves = leaves + 1 WHERE guild_id = ${guild_id} AND hour_bucket = ${bucket}`;
}

export async function getServerStats(guild_id: string, hours = 24): Promise<IServerStat[]> {
  const since = (Math.floor(Date.now() / 3_600_000) - hours) * 3_600_000;
  const rows = await db`SELECT * FROM serverstats WHERE guild_id = ${guild_id} AND hour_bucket >= ${since} ORDER BY hour_bucket DESC`;
  return rows as IServerStat[];
}

// ─── Streaming config ─────────────────────────────────────────────────────────

export async function getStreamingConfig(guild_id: string): Promise<IStreamingConfig | null> {
  const [row] = await db`SELECT * FROM streaming_config WHERE guild_id = ${guild_id}`;
  return (row as IStreamingConfig) || null;
}

export async function setStreamingConfig(guild_id: string, fields: Partial<Omit<IStreamingConfig, 'guild_id'>>) {
  await ensureConfig(guild_id);
  await db`
    INSERT INTO streaming_config (guild_id, announce_channel_id, give_role_id, message)
    VALUES (${guild_id}, ${fields.announce_channel_id ?? null}, ${fields.give_role_id ?? null}, ${fields.message ?? 'Now live: **{username}** is streaming **{game}**!\n{url}'})
    ON CONFLICT(guild_id) DO UPDATE SET
      announce_channel_id = COALESCE(excluded.announce_channel_id, announce_channel_id),
      give_role_id = COALESCE(excluded.give_role_id, give_role_id),
      message = COALESCE(excluded.message, message)
  `;
}

// ─── RSVP ─────────────────────────────────────────────────────────────────────

export async function createRsvpEvent(guild_id: string, channel_id: string, title: string, description: string | null, starts_at: number, created_by: string): Promise<IRsvpEvent> {
  await ensureConfig(guild_id);
  const [row] = await db`
    INSERT INTO rsvp_events (guild_id, channel_id, title, description, starts_at, created_by, created_at)
    VALUES (${guild_id}, ${channel_id}, ${title}, ${description}, ${starts_at}, ${created_by}, ${Date.now()})
    RETURNING *
  `;
  return row as IRsvpEvent;
}

export async function getRsvpEvent(id: number, guild_id: string): Promise<IRsvpEvent | null> {
  const [row] = await db`SELECT * FROM rsvp_events WHERE id = ${id} AND guild_id = ${guild_id}`;
  return (row as IRsvpEvent) || null;
}

export async function listRsvpEvents(guild_id: string): Promise<IRsvpEvent[]> {
  const rows = await db`SELECT * FROM rsvp_events WHERE guild_id = ${guild_id} AND starts_at >= ${Date.now()} ORDER BY starts_at`;
  return rows as IRsvpEvent[];
}

export async function setRsvpResponse(event_id: number, user_id: string, status: IRsvpResponse['status']) {
  await db`
    INSERT INTO rsvp_responses (event_id, user_id, status) VALUES (${event_id}, ${user_id}, ${status})
    ON CONFLICT(event_id, user_id) DO UPDATE SET status = excluded.status
  `;
}

export async function getRsvpResponses(event_id: number): Promise<IRsvpResponse[]> {
  const rows = await db`SELECT * FROM rsvp_responses WHERE event_id = ${event_id}`;
  return rows as IRsvpResponse[];
}

export async function updateRsvpMessageId(id: number, message_id: string) {
  await db`UPDATE rsvp_events SET message_id = ${message_id} WHERE id = ${id}`;
}

// ─── Scheduled tasks ──────────────────────────────────────────────────────────

export async function createScheduledTask(
  type: string,
  fires_at: number,
  opts: { guild_id?: string; user_id?: string; channel_id?: string; data?: object }
): Promise<IScheduledTask> {
  const [row] = await db`
    INSERT INTO scheduled_tasks (type, guild_id, user_id, channel_id, data, fires_at)
    VALUES (${type}, ${opts.guild_id ?? null}, ${opts.user_id ?? null}, ${opts.channel_id ?? null}, ${opts.data ? JSON.stringify(opts.data) : null}, ${fires_at})
    RETURNING *
  `;
  return row as IScheduledTask;
}

export async function getPendingScheduledTasks(before: number): Promise<IScheduledTask[]> {
  const rows = await db`SELECT * FROM scheduled_tasks WHERE fired = 0 AND fires_at <= ${before}`;
  return rows as IScheduledTask[];
}

export async function markScheduledTaskFired(id: number) {
  await db`UPDATE scheduled_tasks SET fired = 1 WHERE id = ${id}`;
}

export async function deleteScheduledTask(id: number) {
  await db`DELETE FROM scheduled_tasks WHERE id = ${id}`;
}

// ─── XP level formula (MEE6-style) ───────────────────────────────────────────

export function xpForLevel(level: number): number {
  return 5 * level * level + 50 * level + 100;
}

export function calcLevelFromXp(totalXp: number): { level: number; currentXp: number; xpNeeded: number } {
  let level = 0;
  let remaining = totalXp;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  return { level, currentXp: remaining, xpNeeded: xpForLevel(level) };
}

// ─── Economy ──────────────────────────────────────────────────────────────────

export async function getEconomyConfig(guild_id: string): Promise<IEconomyConfig> {
  const [row] = await db`SELECT * FROM economy_config WHERE guild_id = ${guild_id}`;
  return (row as IEconomyConfig) || {
    guild_id, currency_name: 'coins', currency_symbol: '🪙',
    starting_balance: 0, daily_min: 100, daily_max: 500, work_min: 50, work_max: 200,
  };
}

export async function setEconomyConfig(guild_id: string, fields: Partial<Omit<IEconomyConfig, 'guild_id'>>) {
  await ensureConfig(guild_id);
  await db`INSERT OR IGNORE INTO economy_config (guild_id) VALUES (${guild_id})`;
  if (fields.currency_name !== undefined) await db`UPDATE economy_config SET currency_name = ${fields.currency_name} WHERE guild_id = ${guild_id}`;
  if (fields.currency_symbol !== undefined) await db`UPDATE economy_config SET currency_symbol = ${fields.currency_symbol} WHERE guild_id = ${guild_id}`;
  if (fields.starting_balance !== undefined) await db`UPDATE economy_config SET starting_balance = ${fields.starting_balance} WHERE guild_id = ${guild_id}`;
  if (fields.daily_min !== undefined) await db`UPDATE economy_config SET daily_min = ${fields.daily_min} WHERE guild_id = ${guild_id}`;
  if (fields.daily_max !== undefined) await db`UPDATE economy_config SET daily_max = ${fields.daily_max} WHERE guild_id = ${guild_id}`;
  if (fields.work_min !== undefined) await db`UPDATE economy_config SET work_min = ${fields.work_min} WHERE guild_id = ${guild_id}`;
  if (fields.work_max !== undefined) await db`UPDATE economy_config SET work_max = ${fields.work_max} WHERE guild_id = ${guild_id}`;
}

export async function getOrCreateEconomy(guild_id: string, user_id: string): Promise<IEconomy> {
  const [existing] = await db`SELECT * FROM economy WHERE guild_id = ${guild_id} AND user_id = ${user_id}`;
  if (existing) return existing as IEconomy;
  await ensureConfig(guild_id);
  const cfg = await getEconomyConfig(guild_id);
  const [row] = await db`
    INSERT INTO economy (guild_id, user_id, balance, total_earned)
    VALUES (${guild_id}, ${user_id}, ${cfg.starting_balance}, ${cfg.starting_balance})
    ON CONFLICT(guild_id, user_id) DO UPDATE SET guild_id = guild_id
    RETURNING *
  `;
  return row as IEconomy;
}

export async function adjustBalance(
  guild_id: string, user_id: string, delta: number
): Promise<{ success: boolean; newBalance: number }> {
  const eco = await getOrCreateEconomy(guild_id, user_id);
  const newBalance = eco.balance + delta;
  if (newBalance < 0) return { success: false, newBalance: eco.balance };
  const earned = delta > 0 ? delta : 0;
  await db`UPDATE economy SET balance = ${newBalance}, total_earned = total_earned + ${earned} WHERE guild_id = ${guild_id} AND user_id = ${user_id}`;
  return { success: true, newBalance };
}

export async function getEconomyLeaderboard(guild_id: string, limit = 10): Promise<IEconomy[]> {
  const rows = await db`SELECT * FROM economy WHERE guild_id = ${guild_id} ORDER BY balance DESC LIMIT ${limit}`;
  return rows as IEconomy[];
}

export async function getEconomyCooldown(guild_id: string, user_id: string, type: string): Promise<number> {
  const [row] = await db`SELECT last_used FROM economy_cooldowns WHERE guild_id = ${guild_id} AND user_id = ${user_id} AND type = ${type}`;
  return row ? (row.last_used as number) : 0;
}

export async function setEconomyCooldown(guild_id: string, user_id: string, type: string) {
  await db`
    INSERT INTO economy_cooldowns (guild_id, user_id, type, last_used) VALUES (${guild_id}, ${user_id}, ${type}, ${Date.now()})
    ON CONFLICT(guild_id, user_id, type) DO UPDATE SET last_used = excluded.last_used
  `;
}

// ─── XP / Levels ─────────────────────────────────────────────────────────────

export async function getXp(guild_id: string, user_id: string): Promise<IXp | null> {
  const [row] = await db`SELECT * FROM xp WHERE guild_id = ${guild_id} AND user_id = ${user_id}`;
  return (row as IXp) || null;
}

export async function addXp(
  guild_id: string, user_id: string, amount: number
): Promise<{ row: IXp; oldLevel: number }> {
  await ensureConfig(guild_id);
  const existing = await getXp(guild_id, user_id);
  const oldLevel = existing?.level ?? 0;
  const newXp = (existing?.xp ?? 0) + amount;
  const { level: newLevel } = calcLevelFromXp(newXp);
  const [row] = await db`
    INSERT INTO xp (guild_id, user_id, xp, level, total_messages)
    VALUES (${guild_id}, ${user_id}, ${amount}, ${newLevel}, 1)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      xp = xp + ${amount},
      level = ${newLevel},
      total_messages = total_messages + 1
    RETURNING *
  `;
  return { row: row as IXp, oldLevel };
}

export async function getXpConfig(guild_id: string): Promise<IXpConfig> {
  const [row] = await db`SELECT * FROM xp_config WHERE guild_id = ${guild_id}`;
  return (row as IXpConfig) || {
    guild_id, enabled: 1, xp_min: 15, xp_max: 25, cooldown_seconds: 60,
    level_up_channel_id: null,
    level_up_message: 'GG {user}, you just advanced to **level {level}**! 🎉',
  };
}

export async function setXpConfig(guild_id: string, fields: Partial<Omit<IXpConfig, 'guild_id'>>) {
  await ensureConfig(guild_id);
  await db`INSERT OR IGNORE INTO xp_config (guild_id) VALUES (${guild_id})`;
  if (fields.enabled !== undefined) await db`UPDATE xp_config SET enabled = ${fields.enabled} WHERE guild_id = ${guild_id}`;
  if (fields.xp_min !== undefined) await db`UPDATE xp_config SET xp_min = ${fields.xp_min} WHERE guild_id = ${guild_id}`;
  if (fields.xp_max !== undefined) await db`UPDATE xp_config SET xp_max = ${fields.xp_max} WHERE guild_id = ${guild_id}`;
  if (fields.cooldown_seconds !== undefined) await db`UPDATE xp_config SET cooldown_seconds = ${fields.cooldown_seconds} WHERE guild_id = ${guild_id}`;
  if (fields.level_up_channel_id !== undefined) await db`UPDATE xp_config SET level_up_channel_id = ${fields.level_up_channel_id} WHERE guild_id = ${guild_id}`;
  if (fields.level_up_message !== undefined) await db`UPDATE xp_config SET level_up_message = ${fields.level_up_message} WHERE guild_id = ${guild_id}`;
}

export async function getXpLeaderboard(guild_id: string, limit = 10): Promise<IXp[]> {
  const rows = await db`SELECT * FROM xp WHERE guild_id = ${guild_id} ORDER BY xp DESC LIMIT ${limit}`;
  return rows as IXp[];
}

export async function getLevelRoles(guild_id: string): Promise<ILevelRole[]> {
  const rows = await db`SELECT * FROM level_roles WHERE guild_id = ${guild_id} ORDER BY level ASC`;
  return rows as ILevelRole[];
}

export async function addLevelRole(guild_id: string, level: number, role_id: string): Promise<ILevelRole> {
  await ensureConfig(guild_id);
  const [row] = await db`
    INSERT INTO level_roles (guild_id, level, role_id) VALUES (${guild_id}, ${level}, ${role_id})
    RETURNING *
  `;
  return row as ILevelRole;
}

export async function removeLevelRole(id: number, guild_id: string): Promise<boolean> {
  const result = await db`DELETE FROM level_roles WHERE id = ${id} AND guild_id = ${guild_id} RETURNING id`;
  return result.length > 0;
}
