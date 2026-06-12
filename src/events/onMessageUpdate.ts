import {
  ChannelType,
  EmbedBuilder,
  Message,
  PartialMessage,
  TextChannel,
} from "discord.js";
import config from "../config";

export const onMessageUpdate = async (
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage,
) => {
  if (oldMessage.content === newMessage.content) return;

  if (oldMessage.partial) {
    oldMessage
      .fetch()
      .then((fullMessage) => {
        console.log(fullMessage.content);
      })
      .catch((error) => {
        console.log("Something went wrong when fetching the message: ", error);
      });
  }

  const guild = oldMessage.guild;
  if (!guild || !oldMessage.author) return;

  const editedMessageChannel = guild.channels.cache.get(
    oldMessage.channel.id,
  ) as TextChannel;

  const messageCreatedTime = Math.floor(oldMessage.createdTimestamp / 1000);

  const logChannel = guild.channels.cache.get(config.ACTION_LOG_CHANNEL);
  if (!logChannel || logChannel.type !== ChannelType.GuildText) return;

  const logEmbed = new EmbedBuilder()
    .setColor("#fca41c")
    .setTitle("<:editMessage:1514948246676443136> Message Edited")
    .setAuthor({
      name: oldMessage.author.username,
      iconURL: oldMessage.author.displayAvatarURL(),
    })
    .setDescription(
      `> **Channel:** ${editedMessageChannel.name} (<#${editedMessageChannel.id}>)\n` +
        `> **Message ID:** [${oldMessage.id}](https://discord.com/channels/${oldMessage.guild.id}/${editedMessageChannel.id}/${oldMessage.id})\n` +
        `> **Message Author:** @${oldMessage.author.username} (<@${oldMessage.author.id}>)\n` +
        `> **Message Created:** <t:${messageCreatedTime}:R>`,
    )
    .addFields(
      { name: "Before", value: `${oldMessage.content}`, inline: true },
      { name: "After", value: `${newMessage.content}`, inline: true },
    )
    .setTimestamp();

  await logChannel.send({
    embeds: [logEmbed],
  });
};
