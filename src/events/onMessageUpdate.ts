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
  const oldFull = oldMessage.partial
    ? await oldMessage.fetch().catch(() => null)
    : oldMessage;

  const newFull = newMessage.partial
    ? await newMessage.fetch().catch(() => null)
    : newMessage;

  if (!oldFull || !newFull) return;

  if (!oldFull.content || !newFull.content) return;

  const before = oldFull.content;
  const after = newFull.content;

  if (before === after) return;

  if (!oldFull.guild || !oldFull.author) return;

  const guild = oldFull.guild;

  if (!newFull.channel) return;
  const channel = guild.channels.cache.get(newFull.channel.id) as TextChannel;
  if (!channel) return;

  const messageCreatedTime = Math.floor(oldFull.createdTimestamp / 1000);

  const logChannel = guild.channels.cache.get(config.ACTION_LOG_CHANNEL);
  if (!logChannel || logChannel.type !== ChannelType.GuildText) return;

  const logEmbed = new EmbedBuilder()
    .setColor("#fca41c")
    .setTitle("<:editMessage:1514948246676443136> Message Edited")
    .setAuthor({
      name: oldFull.author.username,
      iconURL: oldFull.author.displayAvatarURL(),
    })
    .setDescription(
      [
        `> **Channel:** ${channel.name} (<#${channel.id}>)`,
        `> **Message ID:** [${oldFull.id}](https://discord.com/channels/${guild.id}/${channel.id}/${oldFull.id})`,
        `> **Message Author:** @${oldFull.author.username} (<@${oldFull.author.id}>)`,
        `> **Message Created:** <t:${messageCreatedTime}:R>`,
      ].join("\n"),
    )
    .addFields(
      { name: "Before", value: before.slice(0, 1024), inline: true },
      { name: "After", value: after.slice(0, 1024), inline: true },
    )
    .setTimestamp();

  await logChannel.send({
    embeds: [logEmbed],
  });
};
