import {
  Client,
  TextChannel,
  Message,
  MessageCreateOptions,
  MessageEditOptions,
} from "discord.js";
import { LinkedRoleRule } from "./constants";

export function shouldHaveRole(rule: LinkedRoleRule, roleIds: Set<string>) {
  const matchedCount = rule.children.filter((id) => roleIds.has(id)).length;

  switch (rule.mode) {
    case "ALL":
      return rule.children.every((id) => roleIds.has(id));

    case "MIN_COUNT":
      return matchedCount >= (rule.minCount ?? 1);

    case "ANY":
    default:
      return matchedCount > 0;
  }
}

export type SystemMessage = MessageCreateOptions & MessageEditOptions;

type SyncSystemMessageOptions = {
  client: Client;
  channelId: string;
  message: SystemMessage;
};

const generateHash = (string: string) => {
  let hash = 0;
  for (const char of string) {
    hash = (hash << 5) - hash + char.charCodeAt(0);
    hash |= 0;
  }
  return Math.abs(hash);
};

function attachComponentIds(message: SystemMessage) {
  for (const comp of message.components || []) {
    (comp as any).__hash = generateHash(JSON.stringify(comp));
  }
}

function isSameSystemMessage(a: SystemMessage, b: Message) {
  if (!a.components || !b.components) return false;
  if (a.components.length !== b.components.length) return false;

  return a.components.every((comp, i) => {
    const existing = b.components[i];

    const aHash = (comp as any).__hash ?? generateHash(JSON.stringify(comp));
    const bHash = existing
      ? generateHash(JSON.stringify(existing.toJSON()))
      : null;

    return aHash === bHash;
  });
}

export async function syncSystemMessage({
  client,
  channelId,
  message,
}: SyncSystemMessageOptions) {
  attachComponentIds(message);

  const channel = client.channels.cache.get(channelId) as TextChannel;

  if (!channel) {
    console.warn(`[syncSystemMessage] Channel not found: ${channelId}`);
    return;
  }

  const messages = await channel.messages.fetch({ limit: 50 });

  const botMessages = messages.filter((m) => m.author.id === client.user?.id);

  const existing = botMessages.last();

  if (!existing) {
    await channel.send(message);
  } else {
    if (!isSameSystemMessage(message, existing)) {
      await existing.edit(message);
    }
  }

  for (const [, msg] of botMessages) {
    if (msg.id !== existing?.id) {
      await msg.delete().catch(() => {});
    }
  }
}

export function isValidDate(month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if ([4, 6, 9, 11].includes(month) && day > 30) return false;
  if (month === 2 && day > 29) return false;
  return true;
}
