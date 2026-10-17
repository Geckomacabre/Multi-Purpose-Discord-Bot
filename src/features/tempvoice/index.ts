import {
  ChannelType, OverwriteType, PermissionFlagsBits, PermissionsBitField,
  type Client, type Guild, type GuildMember, type VoiceBasedChannel,
} from 'discord.js';
import { EventModule } from '../feature';
import * as db from '../../utils/db';
import type { ITempVoiceConfig } from '../../utils/db';
import logger from '../../utils/logger';

// Join-to-create voice. Joining the hub channel creates a voice channel named
// after the member, gives them full control of it, and moves them in. Channels
// are deleted once no people are left in them. One channel per member: joining
// the hub again sends them back to the one they have.

const REASON = 'Join-to-create voice';
const P = PermissionFlagsBits;

// Rename, set a user limit or bitrate, move/kick, mute/deafen, and edit the channel's permissions
const OWNER_PERMS = [
  P.ViewChannel, P.Connect, P.Speak, P.Stream, P.UseVAD, P.PrioritySpeaker,
  P.ManageChannels, P.ManageRoles, P.MoveMembers, P.MuteMembers, P.DeafenMembers,
];

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
