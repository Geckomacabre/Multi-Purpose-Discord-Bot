import {
  ButtonInteraction, ChannelType, MessageFlags, OverwriteType, PermissionFlagsBits,
  type Client, type Collection, type PermissionOverwrites, type Guild, type GuildBasedChannel, type GuildMember,
  type MessageReaction, type PartialMessageReaction, type PartialUser, type User,
} from 'discord.js';
import { EventModule } from '../feature';
import * as db from '../../utils/db';
import type { IVerifyConfig } from '../../utils/db';
import logger from '../../utils/logger';

// Verification gate. Members get member_role by clicking the Verify button
// (/verify setup) or by reacting ✅ on the rules post (/verify rules).
// /verify lock hides every public channel from @everyone and shows it to
// member_role, so unverified members only see the gate channel. Channels that
// were already hidden from @everyone (staff/private) are left alone. Roles above
// the bot's highest role bypass the lock: each gets its own View Channel allow.

export const VERIFY_EMOJI = '✅';
const REASON = 'Verification gate';

const LOCKABLE = new Set<ChannelType>([
  ChannelType.GuildText,
  ChannelType.GuildVoice,
  ChannelType.GuildCategory,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildStageVoice,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
]);

/** Per locked channel: @everyone's View Channel state before the lock, and the bypass roles the gate allowed */
type ChannelLock = { everyone: 'allow' | 'neutral'; bypass: string[] };
type LockState = Record<string, ChannelLock>;

export function getLockState(cfg: IVerifyConfig): LockState | null {
  if (!cfg.locked_channels) return null;
  let raw: Record<string, ChannelLock | 'allow' | 'neutral'>;
  try { raw = JSON.parse(cfg.locked_channels); } catch { return {}; }
  // Older entries only stored @everyone's state
  const state: LockState = {};
  for (const [id, v] of Object.entries(raw)) state[id] = typeof v === 'string' ? { everyone: v, bypass: [] } : v;
  return state;
}

/** Roles above the bot's highest role. Members holding any of them bypass the lock. */
function bypassRoleIds(guild: Guild): Set<string> {
  const top = guild.members.me!.roles.highest.position;
  return new Set(guild.roles.cache.filter(r => r.position > top).map(r => r.id));
}

/** Gives the member role (and drops the unverified role). Returns false if Discord refused. */
async function grant(member: GuildMember, cfg: IVerifyConfig, reason = 'Verified') {
  const ok = await member.roles.add(cfg.member_role_id, reason).then(() => true, () => false);
  if (cfg.unverified_role_id) await member.roles.remove(cfg.unverified_role_id, reason).catch(() => {});
  return ok;
}

async function revoke(member: GuildMember, cfg: IVerifyConfig, reason = 'Removed rules reaction') {
  const ok = await member.roles.remove(cfg.member_role_id, reason).then(() => true, () => false);
  if (cfg.unverified_role_id) await member.roles.add(cfg.unverified_role_id, reason).catch(() => {});
  return ok;
}

const VIEW = PermissionFlagsBits.ViewChannel;

type Overwrite = { id: string; type: OverwriteType; allow: bigint; deny: bigint };

/** A channel's overwrites as an editable map, so all changes go out in one request. */
function overwriteMap(channel: { permissionOverwrites: { cache: Collection<string, PermissionOverwrites> } }) {
  return new Map<string, Overwrite>(channel.permissionOverwrites.cache.map(o =>
    [o.id, { id: o.id, type: o.type, allow: o.allow.bitfield, deny: o.deny.bitfield }]));
}

/** Sets a role's View Channel to allow (true), deny (false) or inherit (null). */
function setView(map: Map<string, Overwrite>, roleId: string, value: boolean | null) {
  const ow = map.get(roleId) ?? { id: roleId, type: OverwriteType.Role, allow: 0n, deny: 0n };
  ow.allow &= ~VIEW;
  ow.deny &= ~VIEW;
  if (value === true) ow.allow |= VIEW;
  else if (value === false) ow.deny |= VIEW;
  if (ow.allow === 0n && ow.deny === 0n) map.delete(roleId);
  else map.set(roleId, ow);
}

const hasView = (ow: Overwrite | undefined, field: 'allow' | 'deny') => !!ow && (ow[field] & VIEW) !== 0n;

/**
 * Every member of the guild. Discord allows one full member request per guild
 * about every 30s, so reuse the cache once it's complete (the GuildMembers intent
 * keeps it current) and wait out a rate limit instead of failing.
 */
async function allMembers(guild: Guild): Promise<Collection<string, GuildMember>> {
  if (guild.members.cache.size >= guild.memberCount) return guild.members.cache;
  try {
    return await guild.members.fetch();
  } catch (err: any) {
    if (err?.name !== 'GatewayRateLimitError') throw err;
    const wait = Math.ceil((err.data?.retry_after ?? 30) * 1000) + 500;
    await new Promise(r => setTimeout(r, wait));
    return guild.members.fetch();
  }
}

/** Hides one channel from @everyone and shows it to the member role and bypass roles. Returns false if skipped. */
async function lockChannel(
  channel: GuildBasedChannel, cfg: IVerifyConfig, state: LockState, bypass: Set<string>, oldRoleId?: string,
): Promise<boolean> {
  if (!LOCKABLE.has(channel.type) || channel.id === cfg.channel_id) return false;
  if (!('permissionOverwrites' in channel)) return false;

  const map = overwriteMap(channel);
  const everyoneId = channel.guild.roles.everyone.id;
  const prev = state[channel.id];
  let entry: ChannelLock;
  if (prev) {
    entry = { everyone: prev.everyone, bypass: [...prev.bypass] };
  } else if (hasView(map.get(everyoneId), 'deny')) {
    // Already hidden. Only ours if it has the gate's overwrites (copied from a locked
    // category, or left by a lock run that was interrupted before it saved)
    if (!hasView(map.get(cfg.member_role_id), 'allow')) return false;
    entry = { everyone: 'neutral', bypass: [...bypass].filter(id => hasView(map.get(id), 'allow')) };
  } else {
    entry = { everyone: hasView(map.get(everyoneId), 'allow') ? 'allow' : 'neutral', bypass: [] };
  }

  for (const roleId of bypass) {
    if (entry.bypass.includes(roleId)) { setView(map, roleId, true); continue; }
    const ow = map.get(roleId);
    if (hasView(ow, 'allow') || hasView(ow, 'deny')) continue; // set by staff, leave it
    setView(map, roleId, true);
    entry.bypass.push(roleId);
  }
  // Roles that have dropped below the bot since the last lock
  for (const roleId of entry.bypass.filter(id => !bypass.has(id))) setView(map, roleId, null);
  entry.bypass = entry.bypass.filter(id => bypass.has(id));

  if (prev && oldRoleId && oldRoleId !== cfg.member_role_id) setView(map, oldRoleId, null);
  setView(map, cfg.member_role_id, true);
  setView(map, everyoneId, false);

  await channel.permissionOverwrites.set([...map.values()], REASON);
  state[channel.id] = entry;
  return true;
}

/** Channels in Server Onboarding, which Discord requires to stay visible to @everyone. */
async function onboardingChannelIds(guild: Guild): Promise<Set<string>> {
  const ids = new Set<string>();
  const onboarding = await guild.fetchOnboarding().catch(() => null);
  if (!onboarding) return ids;
  for (const id of onboarding.defaultChannels.keys()) ids.add(id);
  for (const prompt of onboarding.prompts.values()) {
    for (const option of prompt.options.values()) for (const id of option.channels.keys()) ids.add(id);
  }
  return ids;
}

type Progress = (done: number, total: number) => unknown;

/** Locks every public channel behind the member role. Pass oldRoleId when the member role changed. */
export async function lockGuild(guild: Guild, cfg: IVerifyConfig, oldRoleId?: string, onProgress?: Progress) {
  const state = getLockState(cfg) ?? {};
  const save = () => db.setVerifyConfig(guild.id, { locked_channels: JSON.stringify(state) });
  await guild.channels.fetch();

  // Denying @everyone hides channels from bots too (this one included), unless they're admins
  const members = await allMembers(guild);
  for (const member of members.values()) {
    if (member.user.bot && !member.roles.cache.has(cfg.member_role_id)) {
      await member.roles.add(cfg.member_role_id, REASON)
        .catch(err => logger.error(`[verify] couldn't give the member role to bot ${member.user.tag}: ${err}`));
    }
  }

  const gate = guild.channels.cache.get(cfg.channel_id);
  if (gate && 'permissionOverwrites' in gate) {
    // Everyone can read the gate, but can't chat or add new emojis (they can still click the existing ✅)
    await gate.permissionOverwrites.edit(guild.roles.everyone.id, {
      ViewChannel: true, ReadMessageHistory: true, SendMessages: false, AddReactions: false,
    }, { reason: REASON });
    await gate.permissionOverwrites.edit(guild.client.user.id, {
      ViewChannel: true, ReadMessageHistory: true, SendMessages: true, AddReactions: true, EmbedLinks: true,
    }, { reason: REASON });
    delete state[gate.id];
  }

  const bypass = bypassRoleIds(guild);
  const onboarding = await onboardingChannelIds(guild);
  const channels = [...guild.channels.cache.values()].filter(c => LOCKABLE.has(c.type) && c.id !== cfg.channel_id);
  let locked = 0;
  const failed: string[] = [];
  const skippedOnboarding: string[] = [];
  for (const [i, channel] of channels.entries()) {
    if (onboarding.has(channel.id)) {
      skippedOnboarding.push(channel.name);
    } else {
      try {
        if (await lockChannel(channel, cfg, state, bypass, oldRoleId)) {
          locked++;
          await save(); // so an interrupted run can still be undone
        }
      } catch (err: any) {
        if (err?.code === 350003) skippedOnboarding.push(channel.name);
        else {
          failed.push(channel.name);
          logger.error(`[verify] couldn't lock #${channel.name} in ${guild.name}: ${err}`);
        }
      }
    }
    await onProgress?.(i + 1, channels.length);
  }

  await save();
  return { locked, failed, skippedOnboarding };
}

/** Restores every channel the gate locked. */
export async function unlockGuild(guild: Guild, cfg: IVerifyConfig, onProgress?: Progress) {
  const state = getLockState(cfg) ?? {};
  const entries = Object.entries(state);
  let unlocked = 0;
  for (const [i, [id, entry]] of entries.entries()) {
    const channel = guild.channels.cache.get(id);
    if (channel && 'permissionOverwrites' in channel) {
      try {
        const map = overwriteMap(channel);
        setView(map, guild.roles.everyone.id, entry.everyone === 'allow' ? true : null);
        setView(map, cfg.member_role_id, null);
        for (const roleId of entry.bypass) setView(map, roleId, null);
        await channel.permissionOverwrites.set([...map.values()], REASON);
        unlocked++;
      } catch (err) {
        logger.error(`[verify] couldn't unlock #${channel.name} in ${guild.name}: ${err}`);
      }
    }
    await onProgress?.(i + 1, entries.length);
  }
  await db.setVerifyConfig(guild.id, { locked_channels: null });
  return unlocked;
}

async function handleRulesReaction(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  added: boolean,
) {
  if (user.bot || !reaction.message.guildId) return;
  const cfg = await db.getVerifyConfig(reaction.message.guildId);
  if (!cfg?.member_role_id || cfg.message_id !== reaction.message.id) return;
  const guild = reaction.message.guild;
  if (!guild) return;

  if (reaction.emoji.name !== VERIFY_EMOJI) {
    if (added) await reaction.users.remove(user.id).catch(() => {});
    return;
  }

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;
  if (added) await grant(member, cfg);
  else await revoke(member, cfg);
}

/** IDs of everyone (not bots) who reacted ✅ on the rules post, or null if there's no post or reaction. */
async function fetchReactedUserIds(guild: Guild, cfg: IVerifyConfig): Promise<Set<string> | null> {
  if (!cfg.message_id) return null;
  const channel = await guild.channels.fetch(cfg.channel_id).catch(() => null);
  if (!channel?.isTextBased()) return null;
  const message = await channel.messages.fetch(cfg.message_id).catch(() => null);
  const reaction = message?.reactions.cache.get(VERIFY_EMOJI);
  if (!reaction) return null;

  const reacted = new Set<string>();
  let after: string | undefined;
  while (true) {
    const batch = await reaction.users.fetch({ limit: 100, after });
    for (const u of batch.values()) if (!u.bot) reacted.add(u.id);
    if (batch.size < 100) break;
    after = batch.lastKey();
  }
  return reacted;
}

export type ExistingMembers = 'keep' | 'reverify';

/**
 * What happens to people already in the server when the gate goes up.
 * keep: everyone gets the member role, so nobody loses access.
 * reverify: the member role is taken from anyone who hasn't reacted ✅, so they must verify.
 * Bots and members with a role above the bot are never touched.
 */
export async function applyExistingMembers(guild: Guild, cfg: IVerifyConfig, mode: ExistingMembers, onProgress?: Progress) {
  const members = await allMembers(guild);
  const bypass = bypassRoleIds(guild);
  const reacted = mode === 'reverify' ? (await fetchReactedUserIds(guild, cfg)) ?? new Set<string>() : null;

  const targets = [...members.values()].filter(m => {
    if (m.user.bot || m.roles.cache.some(r => bypass.has(r.id))) return false;
    const has = m.roles.cache.has(cfg.member_role_id);
    return mode === 'keep' ? !has : has && !reacted!.has(m.id);
  });

  let changed = 0;
  for (const [i, member] of targets.entries()) {
    const ok = mode === 'keep'
      ? await grant(member, cfg, 'Already in the server when verification was set up')
      : await revoke(member, cfg, 'Re-verification required');
    if (ok) changed++;
    await onProgress?.(i + 1, targets.length);
  }
  return changed;
}

/**
 * The client has no partials, so reactions only fire for cached messages. Cache
 * each rules post, and give the role to anyone who reacted while the bot was offline.
 */
export async function startVerifyGate(bot: Client) {
  for (const cfg of await db.getAllVerifyConfigs()) {
    const guild = bot.guilds.cache.get(cfg.guild_id);
    if (!guild || !cfg.member_role_id) continue;
    try {
      const reacted = await fetchReactedUserIds(guild, cfg);
      if (!reacted) continue;

      // Add-only: never strip the role here, it may have been given another way
      const members = await allMembers(guild);
      let added = 0;
      for (const id of reacted) {
        const member = members.get(id);
        if (member && !member.roles.cache.has(cfg.member_role_id) && await grant(member, cfg)) added++;
      }
      if (added) logger.info(`[verify] ${guild.name}: verified ${added} member(s) who reacted while offline`);
    } catch (err) {
      logger.error(`[verify] startup sync for ${guild.name} failed: ${err}`);
    }
  }
}

const verifyModule: EventModule = {
  name: 'verify',
  handlers: {
    interactionCreate: async ({ data: [interaction], db }) => {
      if (!(interaction as any).isButton()) return;
      const btn = interaction as ButtonInteraction;
      if (btn.customId !== 'verify_btn') return;
      if (!btn.guildId) return;

      const cfg = await db.getVerifyConfig(btn.guildId);
      if (!cfg?.member_role_id) return;

      const member = await btn.guild?.members.fetch(btn.user.id).catch(() => null);
      if (!member) return;

      if (member.roles.cache.has(cfg.member_role_id)) {
        await btn.reply({ content: '✅ You are already verified!', flags: MessageFlags.Ephemeral });
        return;
      }

      await grant(member, cfg);
      await btn.reply({ content: '✅ You have been verified! Welcome to the server.', flags: MessageFlags.Ephemeral });
    },

    messageReactionAdd: async ({ data: [reaction, user] }) => {
      await handleRulesReaction(reaction, user, true);
    },

    messageReactionRemove: async ({ data: [reaction, user] }) => {
      await handleRulesReaction(reaction, user, false);
    },

    // Bots added while locked would otherwise see nothing
    guildMemberAdd: async ({ data: [member] }) => {
      if (!member.user.bot) return;
      const cfg = await db.getVerifyConfig(member.guild.id);
      if (!cfg?.member_role_id || !getLockState(cfg)) return;
      await member.roles.add(cfg.member_role_id, REASON).catch(() => {});
    },

    // New channels get locked too, unless they're created private
    channelCreate: async ({ data: [channel] }) => {
      const cfg = await db.getVerifyConfig(channel.guild.id);
      const state = cfg && getLockState(cfg);
      if (!cfg || !state) return;
      if (await lockChannel(channel, cfg, state, bypassRoleIds(channel.guild))) {
        await db.setVerifyConfig(channel.guild.id, { locked_channels: JSON.stringify(state) });
      }
    },
  },
};

export default verifyModule;
