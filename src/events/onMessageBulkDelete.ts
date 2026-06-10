import {
  ChannelType,
  EmbedBuilder,
  Message,
  PartialMessage,
  ReadonlyCollection,
  TextChannel,
} from "discord.js";
import config from "../config";

export async function onMessageBulkDelete(
  messages: ReadonlyCollection<string, Message | PartialMessage>,
) {
  const first = messages.first();
  if (!first) return;

  const channel = first.channel;

  const guild = first.guild;
  if (!guild || !first.author) return;

  const deletedMessageChannel = guild.channels.cache.get(
    channel.id,
  ) as TextChannel;

  const logChannel = guild.channels.cache.get(config.ACTION_LOG_CHANNEL);
  if (!logChannel || logChannel.type !== ChannelType.GuildText) return;

  const logEmbed = new EmbedBuilder()
    .setColor("#da4b50")
    .setTitle(
      `<:deleteSingleMessage:1514390632167112704> Multiple Messages Deleted`,
    )
    .setDescription(
      `> **Channel:** ${deletedMessageChannel.name} (<#${deletedMessageChannel.id}>)\n`,
    )
    .setTimestamp();

  await logChannel.send({
    embeds: [logEmbed],
  });
}
