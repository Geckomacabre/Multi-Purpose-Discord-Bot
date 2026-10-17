import {
  ChannelType, OverwriteType, PermissionFlagsBits, PermissionsBitField,
  type Client, type Guild, type GuildMember, type VoiceBasedChannel,
} from 'discord.js';
import { EventModule } from '../feature';
import * as db from '../../utils/db';
import type { ITempVoiceConfig } from '../../utils/db';
import logger from '../../utils/logger';

// Join-to-create voice. Joining the hub channel creates a voice channel named
// after the member, gives them control of it, and moves them in. Channels are
// deleted once no people are left in them. One channel per member: joining the
// hub again sends them back to the one they have.
//
// Owners can rename it, set a limit/bitrate and disconnect people, but never edit
// its permissions directly: who can connect goes through /tempvoice lock, unlock,
// permit and reject, which can't be used against staff.

const REASON = 'Join-to-create voice';
const P = PermissionFlagsBits;

// No Manage Permissions (it would let owners lock mods out) and no server
// mute/deafen (those follow the member across the whole server)
const OWNER_PERMS = [
  P.ViewChannel, P.Connect, P.Speak, P.Stream, P.UseVAD, P.PrioritySpeaker,
  P.ManageChannels, P.MoveMembers,
];

// Taken back from owners of channels made before the rule above
const REVOKED_OWNER_PERMS = { ManageRoles: null, MuteMembers: null, DeafenMembers: null } as const;

// Having any of these server-wide makes someone staff
const STAFF_PERMS = [
  P.Administrator, P.ManageGuild, P.ManageChannels, P.ModerateMembers,
  P.KickMembers, P.BanMembers, P.MoveMembers,
];

const topPosition = (guild: Guild) => guild.members.me!.roles.highest.position;

/** Admins, mods, and anyone with a role above the bot. Owners can never shut them out. */
export function isStaff(member: GuildMember) {
  return STAFF_PERMS.some(p => member.permissions.has(p)) || member.roles.highest.position > topPosition(member.guild);
}

/** Roles that make their members staff. */
function staffRoleIds(guild: Guild) {
  const top = topPosition(guild);
  return guild.roles.cache
    .filter(r => r.id !== guild.id && (r.position > top || STAFF_PERMS.some(p => r.permissions.has(p))))
    .map(r => r.id);
}

const creating = new Set<string>(); // member ids with a channel being made

/** The owner permissions the bot can hand out (Discord only lets it grant what it has). */
function ownerAllow(guild: Guild): bigint {
  const me = guild.members.me!;
  return OWNER_PERMS.filter(p => me.permissions.has(p)).reduce((all, p) => all | p, 0n);
}

const humans = (channel: VoiceBasedChannel) => channel.members.filter(m => !m.user.bot).size;

async function deleteTemp(channel: VoiceBasedChannel) {
  await db.removeTempVoiceChannel(channel.id);
  await channel.delete(REASON).catch(err => logger.error(`[tempvoice] couldn't delete ${channel.name}: ${err}`));
}

async function createFor(member: GuildMember, cfg: ITempVoiceConfig) {
  const { guild } = member;
  if (creating.has(member.id)) return;
  creating.add(member.id);
  try {
    const existing = await db.getTempVoiceChannelByOwner(guild.id, member.id);
    const existingChannel = existing && guild.channels.cache.get(existing.channel_id);
    if (existingChannel?.isVoiceBased()) {
      await member.voice.setChannel(existingChannel, REASON).catch(() => {});
      return;
    }
    if (existing) await db.removeTempVoiceChannel(existing.channel_id);

    // Same category (and so the same visibility) as the hub, unless one was picked
    const hub = guild.channels.cache.get(cfg.hub_channel_id);
    const configured = cfg.category_id ? guild.channels.cache.get(cfg.category_id) : null;
    const hubParent = hub && 'parent' in hub ? hub.parent : null;
    const parent = configured?.type === ChannelType.GuildCategory ? configured
      : hubParent?.type === ChannelType.GuildCategory ? hubParent : null;

    const overwrites = parent
      ? parent.permissionOverwrites.cache.map(o => ({ id: o.id, type: o.type, allow: o.allow.bitfield, deny: o.deny.bitfield }))
      : [];
    const allow = ownerAllow(guild);
    const own = overwrites.find(o => o.id === member.id);
    if (own) {
      own.allow |= allow;
      own.deny &= ~allow;
    } else {
      overwrites.push({ id: member.id, type: OverwriteType.Member, allow, deny: 0n });
    }

    const name = cfg.name_format.replaceAll('{user}', member.displayName).slice(0, 100).trim() || member.user.username;
    const channel = await guild.channels.create({
      name, type: ChannelType.GuildVoice, parent: parent?.id, permissionOverwrites: overwrites, reason: REASON,
    });
    await db.addTempVoiceChannel(guild.id, channel.id, member.id);

    // They may have left the hub while the channel was being made
    const moved = await member.voice.setChannel(channel, REASON).then(() => true, () => false);
    if (!moved) await deleteTemp(channel);
  } catch (err) {
    logger.error(`[tempvoice] couldn't create a channel for ${member.user.tag} in ${guild.name}: ${err}`);
  } finally {
    creating.delete(member.id);
  }
}

/** Hands a temp channel to `member` when its owner has left. Returns the reply to show. */
export async function claimTempVoice(member: GuildMember): Promise<string> {
  const channel = member.voice.channel;
  if (!channel) return '❌ Join the voice channel you want to claim first.';
  const temp = await db.getTempVoiceChannel(channel.id);
  if (!temp) return '❌ This isn\'t a join-to-create channel.';
  if (temp.owner_id === member.id) return 'You already own this channel.';
  if (channel.members.has(temp.owner_id)) return `❌ <@${temp.owner_id}> is still here and owns this channel.`;

  const perms = Object.fromEntries(new PermissionsBitField(ownerAllow(member.guild)).toArray().map(p => [p, true]));
  await channel.permissionOverwrites.delete(temp.owner_id, REASON).catch(() => {});
  await channel.permissionOverwrites.edit(member.id, perms, { reason: REASON });
  await db.setTempVoiceOwner(channel.id, member.id);
  return `✅ You own <#${channel.id}> now.`;
}

/** The temp channel `member` is in and owns, or the reason they can't manage it. */
async function ownedChannel(member: GuildMember): Promise<VoiceBasedChannel | string> {
  const channel = member.voice.channel;
  if (!channel) return '❌ Join your voice channel first.';
  const temp = await db.getTempVoiceChannel(channel.id);
  if (!temp) return '❌ This isn\'t a join-to-create channel.';
  if (temp.owner_id !== member.id) return `❌ Only the owner, <@${temp.owner_id}>, can do that. If they've left, use \`/tempvoice claim\`.`;
  return channel;
}

/** Only staff and permitted members can join. People already in the channel stay. */
export async function lockTempVoice(member: GuildMember): Promise<string> {
  const channel = await ownedChannel(member);
  if (typeof channel === 'string') return channel;
  await channel.permissionOverwrites.edit(member.guild.roles.everyone.id, { Connect: false }, { reason: REASON });
  for (const roleId of staffRoleIds(member.guild)) {
    await channel.permissionOverwrites.edit(roleId, { Connect: true }, { reason: REASON });
  }
  return `🔒 Locked <#${channel.id}>. Only staff and people you \`/tempvoice permit\` can join now.`;
}

export async function unlockTempVoice(member: GuildMember): Promise<string> {
  const channel = await ownedChannel(member);
  if (typeof channel === 'string') return channel;
  await channel.permissionOverwrites.edit(member.guild.roles.everyone.id, { Connect: null }, { reason: REASON });
  return `🔓 Unlocked <#${channel.id}>. Anyone who can see it can join (except people you rejected).`;
}

export async function permitTempVoice(member: GuildMember, target: GuildMember): Promise<string> {
  const channel = await ownedChannel(member);
  if (typeof channel === 'string') return channel;
  await channel.permissionOverwrites.edit(target.id, { ViewChannel: true, Connect: true }, { reason: REASON });
  return `✅ ${target} can join <#${channel.id}>.`;
}

export async function rejectTempVoice(member: GuildMember, target: GuildMember): Promise<string> {
  const channel = await ownedChannel(member);
  if (typeof channel === 'string') return channel;
  if (target.id === member.id) return '❌ You can\'t reject yourself.';
  if (target.user.bot) return '❌ Bots can\'t be rejected.';
  if (isStaff(target)) return `❌ ${target} is staff and can always join.`;
  await channel.permissionOverwrites.edit(target.id, { Connect: false }, { reason: REASON });
  if (target.voice.channelId === channel.id) await target.voice.disconnect(REASON).catch(() => {});
  return `🚫 ${target} can't join <#${channel.id}> anymore.`;
}

/** Cleans up channels that emptied while the bot was offline, and serves anyone already waiting in a hub. */
export async function startTempVoice(bot: Client) {
  for (const row of await db.getAllTempVoiceChannels()) {
    const guild = bot.guilds.cache.get(row.guild_id);
    if (!guild) continue;
    const channel = await guild.channels.fetch(row.channel_id).catch((err: any) => (err?.code === 10003 ? 'gone' as const : null));
    if (channel === 'gone' || (channel && !channel.isVoiceBased())) {
      await db.removeTempVoiceChannel(row.channel_id);
    } else if (channel?.isVoiceBased() && humans(channel) === 0) {
      await deleteTemp(channel);
    } else if (channel?.isVoiceBased() && channel.permissionOverwrites.cache.has(row.owner_id)) {
      await channel.permissionOverwrites.edit(row.owner_id, REVOKED_OWNER_PERMS, { reason: REASON }).catch(() => {});
    }
  }

  for (const guild of bot.guilds.cache.values()) {
    const cfg = await db.getTempVoiceConfig(guild.id);
    const hub = cfg && guild.channels.cache.get(cfg.hub_channel_id);
    if (!cfg || !hub?.isVoiceBased()) continue;
    for (const member of hub.members.values()) {
      if (!member.user.bot) await createFor(member, cfg);
    }
  }
}

const tempVoiceModule: EventModule = {
  name: 'tempvoice',
  handlers: {
    voiceStateUpdate: async ({ data: [oldState, newState] }) => {
      if (oldState.channelId === newState.channelId) return;

      // Left a temp channel: delete it once no people are left
      const left = oldState.channel;
      if (left && humans(left) === 0 && await db.getTempVoiceChannel(left.id)) await deleteTemp(left);

      // Joined a hub: make them a channel
      const member = newState.member;
      if (!newState.channelId || !member || member.user.bot) return;
      const cfg = await db.getTempVoiceConfig(newState.guild.id);
      if (cfg?.hub_channel_id === newState.channelId) await createFor(member, cfg);
    },

    channelDelete: async ({ data: [channel] }) => {
      if (!('guild' in channel)) return;
      await db.removeTempVoiceChannel(channel.id);
      const cfg = await db.getTempVoiceConfig(channel.guild.id);
      if (cfg?.hub_channel_id === channel.id) await db.removeTempVoiceConfig(channel.guild.id);
    },
  },
};

export default tempVoiceModule;
