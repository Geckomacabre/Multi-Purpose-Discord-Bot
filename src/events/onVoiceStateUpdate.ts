import {
  ChannelType,
  VoiceChannel,
  VoiceState,
  PermissionFlagsBits,
  ComponentType,
  ButtonStyle,
  MessageFlags,
} from "discord.js";

import logger from "../infrastructure/logger";
import {
  createRoom,
  deleteRoom,
  getRoom,
  getRoomsByOwner,
} from "../infrastructure/db";

const pendingChecks = new Map<string, NodeJS.Timeout>();
const deletionTimeouts = new Map<string, NodeJS.Timeout>();

const ROOM_HUBS: Record<string, string> = {
  "1477434082160934932": "1477428111959134359",
  "1506400483013824663": "1495591577211375767",
};

export const onVoiceStateUpdate = async (
  oldState: VoiceState,
  newState: VoiceState,
) => {
  try {
    const joined = !oldState.channel && newState.channel;
    const left = oldState.channel && !newState.channel;
    const moved =
      oldState.channel &&
      newState.channel &&
      oldState.channel.id !== newState.channel.id;

    if (joined) {
      await handleVoiceJoin(newState);
    } else if (left) {
      await handleVoiceLeave(oldState);
    } else if (moved) {
      await handleVoiceLeave(oldState);
      await handleVoiceJoin(newState);
    }
  } catch (error) {
    console.error(error);
  }
};

async function handleVoiceJoin(state: VoiceState) {
  if (!state.guild || !state.channel || !state.member) return;

  const { channel, member, guild } = state;

  const targetCategoryId = ROOM_HUBS[state.channelId!];

  if (targetCategoryId) {
    await createPrivateRoom(state, targetCategoryId);
    return;
  }

  const room = await getRoom(channel.id);
  if (!room) return;

  cancelPendingCheck(channel.id);
  cancelRoomDeletion(channel.id);

  const perms = channel.permissionsFor(member);

  if (!perms?.has(PermissionFlagsBits.Connect)) {
    logger.info(
      { guildId: guild.id, channelId: channel.id, userId: member.id },
      "[voice] Removed user from room -- missing Connect permission",
    );
    await member.voice
      .setChannel(null)
      .catch((err) =>
        logger.error(
          { err, userId: member.id },
          "[voice] Failed to remove user from room",
        ),
      );
    return;
  }

  if (room.locked && member.id !== room.owner_id) {
    logger.info(
      { guildId: guild.id, channelId: channel.id, userId: member.id },
      "[voice] Removed user from room -- room is locked",
    );
    await member.voice
      .setChannel(null)
      .catch((err) =>
        logger.error(
          { err, userId: member.id },
          "[voice] Failed to remove user from locked room",
        ),
      );
  }
}

async function handleVoiceLeave(state: VoiceState) {
  if (!state.guild || !state.channel) return;

  const { channel, guild } = state;
  const channelId = channel.id;
  const guildId = guild.id;
  const client = guild.client;

  const room = await getRoom(channelId);
  if (!room) return;

  cancelPendingCheck(channelId);
  cancelRoomDeletion(channelId);

  const check = setTimeout(async () => {
    pendingChecks.delete(channelId);

    try {
      const fetchedGuild = await client.guilds.fetch(guildId).catch(() => null);
      if (!fetchedGuild) {
        await deleteRoom(channelId).catch(() => {});
        return;
      }

      const fetchedChannel = await fetchedGuild.channels
        .fetch(channelId)
        .catch(() => null);
      if (!fetchedChannel || fetchedChannel.type !== ChannelType.GuildVoice) {
        await deleteRoom(channelId).catch(() => {});
        return;
      }

      const voiceChannel = fetchedChannel as VoiceChannel;

      if (voiceChannel.members.size > 0) return;

      deletionTimeouts.delete(channelId);

      const finalGuild = await client.guilds.fetch(guildId).catch(() => null);
      if (!finalGuild) {
        await deleteRoom(channelId).catch(() => {});
        return;
      }

      const finalChannel = await finalGuild.channels
        .fetch(channelId)
        .catch(() => null);
      if (!finalChannel || finalChannel.type !== ChannelType.GuildVoice) {
        await deleteRoom(channelId).catch(() => {});
        return;
      }

      const finalVoice = finalChannel as VoiceChannel;
      if (finalVoice.members.size !== 0) return;

      const botMember = await finalGuild.members
        .fetch(finalGuild.client.user!.id)
        .catch(() => null);

      if (!botMember) return;

      const botPerms = finalVoice.permissionsFor(botMember);
      if (!botPerms?.has(PermissionFlagsBits.ManageChannels)) {
        await deleteRoom(channelId).catch(() => {});
        return;
      }

      await finalVoice
        .delete("Empty room auto-deleted")
        .catch((err) =>
          logger.error(
            { err, channelId },
            "[voice] Failed to delete empty room",
          ),
        );

      await deleteRoom(channelId).catch(() => {});
      logger.info({ channelId }, "[voice] Empty room deleted");
    } catch (err) {
      logger.error({ err, channelId }, "[voice] Error during leave check");
    }
  }, 1_000);

  pendingChecks.set(channelId, check);
}

async function createPrivateRoom(state: VoiceState, categoryId: string) {
  if (!state.guild || !state.channel || !state.member) return;

  const { guild, member } = state;

  const existingRooms = await getRoomsByOwner(member.id);

  if (existingRooms && existingRooms.length > 0) {
    const existing = existingRooms[0];

    const existingChannel = await guild.channels
      .fetch(existing.channel_id)
      .catch(() => null);

    if (existingChannel && existingChannel.type === ChannelType.GuildVoice) {
      await member.voice.setChannel(existing.channel_id).catch(() => {});
      return;
    }

    await deleteRoom(existing.channel_id).catch(() => {});
  }

  const category = await guild.channels.fetch(categoryId).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) {
    logger.warn(
      { guildId: guild.id },
      "[voice] Rooms category missing or misconfigured",
    );
    await member.voice.setChannel(null).catch(() => {});
    return;
  }

  const botMember = await guild.members
    .fetch(guild.client.user!.id)
    .catch(() => null);
  if (!botMember) {
    logger.warn({ guildId: guild.id }, "[voice] Could not resolve bot member");
    return;
  }

  const perms = category.permissionsFor(botMember);
  const requiredPerms = [
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.Connect,
    PermissionFlagsBits.MoveMembers,
  ];

  if (!requiredPerms.every((p) => perms?.has(p))) {
    logger.warn(
      { guildId: guild.id },
      "[voice] Bot lacks required permissions in rooms category",
    );
    await member.voice.setChannel(null).catch(() => {});
    return;
  }

  const channelName =
    `${member.user.displayName || member.user.username}'s Channel`.slice(
      0,
      100,
    );

  const newChannel = await guild.channels
    .create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.members.me!.id,
          allow: [
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.MoveMembers,
            PermissionFlagsBits.ViewChannel,
          ],
        },
        {
          id: member.id,
          allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
        },
      ],
    })
    .catch((err) => {
      logger.error(
        { err, guildId: guild.id },
        "[voice] Failed to create room channel",
      );
      return null;
    });

  if (!newChannel) {
    await member.voice.setChannel(null).catch(() => {});
    return;
  }

  try {
    await createRoom(newChannel.id, guild.id, member.id, {
      locked: false,
      hidden: false,
    });
  } catch (err) {
    logger.error(
      { err, channelId: newChannel.id },
      "[voice] DB write failed, rolling back room",
    );
    await newChannel.delete("Room creation failed").catch(() => {});
    await member.voice.setChannel(null).catch(() => {});
    return;
  }

  await member.voice.setChannel(newChannel.id).catch(async (err) => {
    logger.error(
      { err, userId: member.id },
      "[voice] Failed to move user into room, rolling back",
    );
    await newChannel.delete("Failed to move owner into room").catch(() => {});
    await deleteRoom(newChannel.id).catch(() => {});
    await member.voice.setChannel(null).catch(() => {});
  });

  const pingMessage = await newChannel
    .send({
      content: `${member}`,
    })
    .catch(() => null);

  if (pingMessage) {
    await pingMessage.delete().catch(() => {});
  }

  await newChannel
    .send({
      flags: MessageFlags.IsComponentsV2,
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: [
                `## 🔊 Private Voice Interface`,
                ``,
                `Manage your temporary voice channel using the controls below.`,
                `More advanced options are available through **/voice** commands.`,
              ].join("\n"),
            },
            { type: ComponentType.Separator, divider: true, spacing: 2 },
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.Button,
                  style: ButtonStyle.Secondary,
                  custom_id: "voice_lock",
                  label: "Lock",
                  emoji: { name: "🔒" },
                },
                {
                  type: ComponentType.Button,
                  style: ButtonStyle.Secondary,
                  custom_id: "voice_unlock",
                  label: "Unlock",
                  emoji: { name: "🔓" },
                },
              ],
            },
          ],
        },
      ],
    })
    .catch(() => {});
}

function cancelPendingCheck(channelId: string) {
  const t = pendingChecks.get(channelId);
  if (t) {
    clearTimeout(t);
    pendingChecks.delete(channelId);
  }
}

function cancelRoomDeletion(channelId: string) {
  const t = deletionTimeouts.get(channelId);
  if (t) {
    clearTimeout(t);
    deletionTimeouts.delete(channelId);
  }
}
