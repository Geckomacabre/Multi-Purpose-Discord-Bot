import {
  ChannelType,
  ComponentType,
  GuildMember,
  MessageFlags,
  TextChannel,
  type Client,
  type Message,
} from "discord.js";
import type { Feature } from "../feature";
import { Channels } from "../../constants";
import Config from "../../config";
import { syncSystemMessage, SystemMessage } from "../../utils";

const HONEYPOT_MESSAGE: SystemMessage = {
  flags: MessageFlags.IsComponentsV2,
  allowedMentions: {},
  content: "",
  components: [
    {
      type: ComponentType.Container,
      components: [
        {
          type: ComponentType.TextDisplay,
          content: "# Warning: Do not post here\n**(Unless you want to be banned)**",
        },
        { type: ComponentType.Separator, divider: true, spacing: 1 },
        {
          type: ComponentType.TextDisplay,
          content:
            "This channel is monitored automatically to detect bot activity and compromised accounts. " +
            "Posting here will result in an **immediate and permanent ban**.\n\n" +
            "This measure exists to protect the server and its members.",
        },
      ],
    },
  ],
};

const DM_BLOCKED_CODES = new Set([50007, 50278]);

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function buildInviteUrl(message: Message): Promise<string | null> {
  try {
    const guild = message.guild!;
    const channel =
      guild.systemChannel ??
      guild.rulesChannel ??
      (guild.channels.cache.find(
        (c) =>
          c.type === ChannelType.GuildText &&
          c.permissionsFor(guild.members.me!)?.has("CreateInstantInvite"),
      ) as TextChannel | undefined);

    if (!channel?.isTextBased()) return null;

    const invite = await (channel as TextChannel).createInvite({
      maxUses: 1,
      unique: true,
      temporary: false,
      reason: "Honeypot trigger",
    });

    return invite.url;
  } catch {
    return null;
  }
}

async function sendDm(member: GuildMember, inviteUrl: string | null): Promise<void> {
  const content =
    `Suspicious activity was detected in a protected channel.\n\n` +
    `If this was not you, secure your account immediately.\n\n` +
    (inviteUrl ? `Rejoin: ${inviteUrl}` : "");

  try {
    await member.send({ content });
  } catch (err: any) {
    if (DM_BLOCKED_CODES.has(err?.code)) {
      console.warn(`[honeypot] DM blocked for ${member.id} (code ${err.code})`);
    } else {
      console.warn(`[honeypot] DM failed for ${member.id}:`, err);
    }
  }
}

async function softban(
  guild: NonNullable<Message["guild"]>,
  userId: string,
): Promise<boolean> {
  try {
    await guild.members.ban(userId, {
      reason: "Honeypot trigger",
      deleteMessageSeconds: 3600,
    });
    await guild.members.unban(userId, "Honeypot release");
    return true;
  } catch (err) {
    console.error(`[honeypot] Softban failed for ${userId}:`, err);
    return false;
  }
}

async function handleHoneypotTrigger(message: Message): Promise<void> {
  if (!message.guild) return;
  if (message.channel.id !== Channels.Honeypot) return;
  if (message.author.bot) return;

  const { guild, author } = message;
  const userId = author.id;
  const isOwner = guild.ownerId === userId;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  const inviteUrl = await buildInviteUrl(message);
  await sendDm(member, inviteUrl);
  await sleep(1200);

  const success = isOwner ? null : await softban(guild, userId);

  const logChannel = guild.channels.cache.get(Config.ACTION_LOG_CHANNEL);

  if (logChannel?.isTextBased()) {
    try {
      if (isOwner) {
        await logChannel.send({
          content: "⚠️ Server owner triggered honeypot — no action taken.",
          allowedMentions: { parse: [] },
        });
      } else if (success === false) {
        await logChannel.send({
          content: `⚠️ Honeypot triggered but enforcement failed for <@${userId}>`,
          allowedMentions: { parse: [] },
        });
      } else {
        await logChannel.send({
          embeds: [
            {
              title: "Honeypot triggered",
              description: `<@${userId}> was softbanned`,
              fields: [
                { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
                { name: "User", value: `${author.tag} (${userId})`, inline: true },
              ],
            },
          ],
        });
      }
    } catch (err) {
      console.error("[honeypot] Log failed:", err);
    }
  }

  if (message.deletable) {
    await message.delete().catch(() => null);
  }
}

async function onMessageCreate(message: Message): Promise<void> {
  try {
    if (message.partial) message = await message.fetch();
    await handleHoneypotTrigger(message);
  } catch (err) {
    console.error("[honeypot] Unhandled error:", err);
  }
}

async function onReady(client: Client): Promise<void> {
  await syncSystemMessage({
    client,
    channelId: Channels.Honeypot,
    message: HONEYPOT_MESSAGE,
  });
}

export default {
  name: "honeypot",
  register: async () => {},
  onReady,
  onMessageCreate,
} satisfies Feature;