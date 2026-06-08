import {
  ChannelType,
  MessageFlags,
  type ButtonInteraction,
  type VoiceChannel,
  type GuildMember,
} from "discord.js";
import { getRoom, updateRoom } from "../../infrastructure/db";

export interface Room {
  channel_id: string;
  guild_id: string;
  owner_id: string;
  locked: boolean;
  hidden: boolean;
}

type VoiceRoomError = "NOT_IN_VC" | "NOT_PRIVATE_ROOM" | "NOT_OWNER";

interface UserRoomResult {
  error: VoiceRoomError | null;
  member?: GuildMember;
  channel?: VoiceChannel;
  room?: Room;
}

const ERROR_REPLIES: Record<VoiceRoomError, string> = {
  NOT_IN_VC: "You must be in your private room.",
  NOT_PRIVATE_ROOM: "This is not a private room.",
  NOT_OWNER: "You don't own this room.",
};

async function getUserRoom(
  interaction: ButtonInteraction,
): Promise<UserRoomResult> {
  if (!interaction.guild) return { error: "NOT_IN_VC" };

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const channel = member.voice.channel;

  if (!channel || channel.type !== ChannelType.GuildVoice) {
    return { error: "NOT_IN_VC" };
  }

  const room = await getRoom(channel.id);
  if (!room) return { error: "NOT_PRIVATE_ROOM" };

  if (room.owner_id !== interaction.user.id) {
    return { error: "NOT_OWNER" };
  }

  return { error: null, member, channel: channel as VoiceChannel, room };
}

async function rename(interaction: ButtonInteraction): Promise<void> {
  await interaction.reply({
    content: "Rename support is not enabled yet.",
    flags: MessageFlags.Ephemeral,
  });
}

async function lock(interaction: ButtonInteraction): Promise<void> {
  const { channel, room, error } = await getUserRoom(interaction);

  if (error) {
    await interaction.reply({
      content: ERROR_REPLIES[error],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (room!.locked) {
    await interaction.reply({
      content: "Your channel is already locked.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await channel!.permissionOverwrites.edit(interaction.guild!.id, {
    Connect: false,
  });

  await updateRoom(channel!.id, { locked: true });

  await interaction.reply({
    content: "Channel locked.",
    flags: MessageFlags.Ephemeral,
  });
}

async function unlock(interaction: ButtonInteraction): Promise<void> {
  const { channel, room, error } = await getUserRoom(interaction);

  if (error) {
    await interaction.reply({
      content: ERROR_REPLIES[error],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!room!.locked) {
    await interaction.reply({
      content: "Your channel is already unlocked.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await channel!.permissionOverwrites.edit(interaction.guild!.id, {
    Connect: null,
  });

  await updateRoom(channel!.id, { locked: false });

  await interaction.reply({
    content: "Channel unlocked.",
    flags: MessageFlags.Ephemeral,
  });
}

export const buttonHandlers: Record<
  string,
  (interaction: ButtonInteraction) => Promise<void>
> = {
  voice_rename: rename,
  voice_lock: lock,
  voice_unlock: unlock,
};

export default buttonHandlers;
