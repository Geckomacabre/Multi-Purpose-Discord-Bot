import {
  AuditLogEvent,
  ChannelType,
  EmbedBuilder,
  Message,
  PartialMessage,
  PartialUser,
  TextChannel,
  User,
} from "discord.js";
import config from "../config";

const auditCache = new Map<
  string,
  { executorId: string; count: number; timestamp: number }
>();

export const onMessageDelete = async (message: Message | PartialMessage) => {
  if (message.partial) {
    try {
      await message.fetch();
    } catch (err: any) {
      if (err?.code === 10008) return;
      console.error("Could not fetch partial message:", err);
      return;
    }
  }

  const guild = message.guild;
  if (!guild || !message.author) return;

  const deletedMessageChannel = guild.channels.cache.get(
    message.channel.id,
  ) as TextChannel;

  const messageCreatedTime = Math.floor(message.createdTimestamp / 1000);

  const logChannel = guild.channels.cache.get(config.ACTION_LOG_CHANNEL);
  if (!logChannel || logChannel.type !== ChannelType.GuildText) return;

  let deletedByUser: User | PartialUser | null = null;

  const imageUrls =
    message.attachments
      ?.filter(
        (att) =>
          att.contentType?.startsWith("image/") ||
          att.name?.match(/\.(png|jpg|jpeg|gif|webp)$/i),
      )
      .map((att) => att.url) ?? [];

  try {
    const auditLogs = await guild.fetchAuditLogs({
      type: AuditLogEvent.MessageDelete,
      limit: 5,
    });

    const entry = auditLogs.entries.find(
      (e) =>
        e.target?.id === message.author?.id &&
        e.extra.channel.id === message.channel.id,
    );

    if (entry) {
      const cacheKey = `${guild.id}:${message.channel.id}:${message.author.id}`;
      const cached = auditCache.get(cacheKey);
      const now = Date.now();

      const isNewEntry =
        !cached ||
        cached.count !== entry.extra.count ||
        now - cached.timestamp > 10_000;

      const executor = entry.executor;

      if (executor && executor.id !== message.author?.id) {
        if (isNewEntry || cached?.executorId === executor.id) {
          deletedByUser = executor;

          auditCache.set(cacheKey, {
            executorId: executor.id,
            count: entry.extra.count,
            timestamp: now,
          });
        }
      }
    }
  } catch {
    console.log("Could not fetch audit logs");
  }

  const logEmbed = new EmbedBuilder()
    .setColor("#da4b50")
    .setTitle("<:deleteSingleMessage:1514390632167112704> Message Deleted")
    .setAuthor({
      name: message.author.username,
      iconURL: message.author.displayAvatarURL(),
    })
    .setDescription(
      `> **Channel:** ${deletedMessageChannel.name} (<#${deletedMessageChannel.id}>)\n` +
        `> **Message ID:** ${message.id}\n` +
        `> **Message Author:** <@${message.author.id}> (${message.author.tag})\n` +
        `> **Message Created:** <t:${messageCreatedTime}:R>\n`,
    )
    .setTimestamp();

  const content = message.content?.trim();

  if (content) {
    logEmbed.addFields({
      name: "Message",
      value: content.slice(0, 1024),
    });
  }
  if (imageUrls.length) {
    logEmbed.addFields({
      name: `${imageUrls.length} Attachment(s)`,
      value: `> ${imageUrls.join(", ")}`.slice(0, 1024),
    });
  }

  if (deletedByUser) {
    logEmbed.setFooter({
      text: `Deleted by @${deletedByUser.username}`,
      iconURL: deletedByUser.displayAvatarURL(),
    });
  }

  const files =
    imageUrls.map((url) => ({
      attachment: url,
    })) ?? [];

  await logChannel.send({
    embeds: [logEmbed],
    files: files.length ? files : undefined,
  });
};
