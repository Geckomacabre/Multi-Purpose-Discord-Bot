import {
  ButtonInteraction, ChannelType, MessageFlags, PermissionFlagsBits,
  type Client, type Guild, type GuildBasedChannel, type GuildMember,
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

async function grant(member: GuildMember, cfg: IVerifyConfig) {
  await member.roles.add(cfg.member_role_id, 'Verified').catch(() => {});
  if (cfg.unverified_role_id) await member.roles.remove(cfg.unverified_role_id).catch(() => {});
}

async function revoke(member: GuildMember, cfg: IVerifyConfig) {
  await member.roles.remove(cfg.member_role_id, 'Removed rules reaction').catch(() => {});
  if (cfg.unverified_role_id) await member.roles.add(cfg.unverified_role_id).catch(() => {});
}

/** Hides one channel from @everyone and shows it to the member role. Returns false if skipped. */
async function lockChannel(channel: GuildBasedChannel, cfg: IVerifyConfig, state: LockState): Promise<boolean> {
  if (!LOCKABLE.has(channel.type) || channel.id === cfg.channel_id) return false;
  if (!('permissionOverwrites' in channel)) return false;

  const view = PermissionFlagsBits.ViewChannel;
  const everyoneId = channel.guild.roles.everyone.id;
  const everyoneOw = channel.permissionOverwrites.cache.get(everyoneId);
  let entry = state[channel.id];
  if (!entry) {
    if (everyoneOw?.deny.has(view)) {
      // Already hidden. Only ours if it copied the gate's overwrites from a locked category.
      if (!channel.permissionOverwrites.cache.get(cfg.member_role_id)?.allow.has(view)) return false;
      entry = { everyone: 'neutral', bypass: [] };
    } else {
      entry = { everyone: everyoneOw?.allow.has(view) ? 'allow' : 'neutral', bypass: [] };
    }
  }

  // Bypass roles go first so higher-ups never lose sight of the channel
  const bypass = bypassRoleIds(channel.guild);
  for (const roleId of bypass) {
    if (entry.bypass.includes(roleId)) continue;
    const ow = channel.permissionOverwrites.cache.get(roleId);
    if (ow?.allow.has(view) || ow?.deny.has(view)) continue; // set by staff, leave it
    await channel.permissionOverwrites.edit(roleId, { ViewChannel: true }, { reason: REASON });
    entry.bypass.push(roleId);
  }
  // Roles that have dropped below the bot since the last lock
  for (const roleId of entry.bypass.filter(id => !bypass.has(id))) {
    if (channel.guild.roles.cache.has(roleId)) {
      await channel.permissionOverwrites.edit(roleId, { ViewChannel: null }, { reason: REASON });
    }
    entry.bypass = entry.bypass.filter(id => id !== roleId);
  }

  await channel.permissionOverwrites.edit(cfg.member_role_id, { ViewChannel: true }, { reason: REASON });
  await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false }, { reason: REASON });
  state[channel.id] = entry;
  return true;
}

/** Locks every public channel behind the member role. Pass oldRoleId when the member role changed. */
export async function lockGuild(guild: Guild, cfg: IVerifyConfig, oldRoleId?: string) {
  const state = getLockState(cfg) ?? {};
  await guild.channels.fetch();

  // Denying @everyone hides channels from bots too (this one included), unless they're admins
  const members = await guild.members.fetch();
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

  let locked = 0;
  const failed: string[] = [];
  for (const channel of guild.channels.cache.values()) {
    try {
      if (oldRoleId && oldRoleId !== cfg.member_role_id && state[channel.id] && 'permissionOverwrites' in channel) {
        await channel.permissionOverwrites.edit(oldRoleId, { ViewChannel: null }, { reason: REASON });
      }
      if (await lockChannel(channel, cfg, state)) locked++;
    } catch (err) {
      failed.push(channel.name);
      logger.error(`[verify] couldn't lock #${channel.name} in ${guild.name}: ${err}`);
    }
  }

  await db.setVerifyConfig(guild.id, { locked_channels: JSON.stringify(state) });
  return { locked, failed };
}

/** Restores every channel the gate locked. */
export async function unlockGuild(guild: Guild, cfg: IVerifyConfig) {
  const state = getLockState(cfg) ?? {};
  let unlocked = 0;
  for (const [id, entry] of Object.entries(state)) {
    const channel = guild.channels.cache.get(id);
    if (!channel || !('permissionOverwrites' in channel)) continue;
    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: entry.everyone === 'allow' ? true : null }, { reason: REASON });
      await channel.permissionOverwrites.edit(cfg.member_role_id, { ViewChannel: null }, { reason: REASON });
      for (const roleId of entry.bypass) {
        if (guild.roles.cache.has(roleId)) await channel.permissionOverwrites.edit(roleId, { ViewChannel: null }, { reason: REASON });
      }
      unlocked++;
    } catch (err) {
      logger.error(`[verify] couldn't unlock #${channel.name} in ${guild.name}: ${err}`);
    }
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

/**
 * The client has no partials, so reactions only fire for cached messages. Cache
 * each rules post, and give the role to anyone who reacted while the bot was offline.
 */
export async function startVerifyGate(bot: Client) {
  for (const cfg of await db.getAllVerifyConfigs()) {
    const guild = bot.guilds.cache.get(cfg.guild_id);
    if (!guild || !cfg.member_role_id) continue;
    try {
      const channel = await guild.channels.fetch(cfg.channel_id).catch(() => null);
      if (!channel?.isTextBased()) continue;
      const message = await channel.messages.fetch(cfg.message_id!).catch(() => null);
      const reaction = message?.reactions.cache.get(VERIFY_EMOJI);
      if (!reaction) continue;

      const reacted = new Set<string>();
      let after: string | undefined;
      while (true) {
        const batch = await reaction.users.fetch({ limit: 100, after });
        for (const u of batch.values()) if (!u.bot) reacted.add(u.id);
        if (batch.size < 100) break;
        after = batch.lastKey();
      }

      // Add-only: never strip the role here, it may have been given another way
      const members = await guild.members.fetch();
      let added = 0;
      for (const id of reacted) {
        const member = members.get(id);
        if (member && !member.roles.cache.has(cfg.member_role_id)) {
          await grant(member, cfg);
          added++;
        }
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
      if (await lockChannel(channel, cfg, state)) {
        await db.setVerifyConfig(channel.guild.id, { locked_channels: JSON.stringify(state) });
      }
    },
  },
};

export default verifyModule;
