import type { Client, Message, PartialMessage, TextChannel } from "discord.js";
import type { Feature } from "../feature";
import { getCounting, updateCounting } from "../../infrastructure/db";

async function handleMessageCreate(message: Message) {
  try {
    if (message.author.bot) return;

    const lowerContent = (message.content || "").toLowerCase();
    const counting = await getCounting(message.channelId);
    if (!counting) return;

    const { count, highscore, last_msg } = counting;
    const lastUser = last_msg?.author_id;

    if (
      lowerContent.includes("what is the count") ||
      lowerContent.includes("what are we up to")
    ) {
      await message.reply({
        content: `We are up to ${count.toLocaleString()}, so next number is **${(count + 1).toLocaleString()}!**`,
      });
      return;
    }

    if (message.content?.includes("☑️") || message.content?.includes("✅")) {
      setTimeout(() => message.react("🤨"), 200);
    }

    const num = Number.parseInt(message.content.replaceAll(",", ""));
    if (isNaN(num) || num <= 0) return;

    if (lastUser && message.author.id === lastUser) {
      await message.reply({
        content: `⚠️ <@${message.author.id}> Wait for someone else to send **${(count + 1).toLocaleString()}.**`,
      });
      await message.react("⚠️");
      return;
    }

    if (num === count + 2 || num === count) {
      await message.reply({
        content: `⚠️ You're close, but you actually need to send **${(count + 1).toLocaleString()}.**`,
      });
      await message.react("⚠️");
      return;
    }

    if (num !== count + 1) {
      const punishmentNumber = Math.max(
        0,
        Math.min(
          Math.max(
            count - Math.abs(count - num),
            Math.round(count * (1 - (count > 25 ? 0.15 : 0.5))),
          ),
          count - 1,
        ),
      );

      await updateCounting(message.channelId, {
        count: punishmentNumber,
        last_msg: null,
      });

      await message.reply({
        content: `⚠️ <@${message.author.id}> RUINED IT AT **${count.toLocaleString()}**!! Now next number is **${punishmentNumber + 1}.**`,
      });
      await message.react("❌");
      return;
    }

    const nextMsg = {
      message_id: message.id,
      author_id: message.author.id,
      number: num,
    };

    await updateCounting(message.channelId, {
      count: count + 1,
      highscore: Math.max(highscore ?? 0, count + 1),
      last_msg: nextMsg,
    });

    await message.react((highscore ?? 0) <= count + 1 ? "☑️" : "✅");
  } catch (err) {
    console.error("Error handling counting messageCreate:", err);
  }
}

async function handleMessageDelete(message: Message | PartialMessage) {
  try {
    const counting = await getCounting(message.channelId);
    if (!counting) return;

    const latest = counting.last_msg;
    if (!latest || latest.message_id !== message.id) return;

    await (message.channel as TextChannel).send({
      content: `<@${latest.author_id}> why u delete **"${latest.number.toLocaleString()}"**?`,
    });
  } catch (err) {
    console.error("Error handling counting messageDelete:", err);
  }
}

export default {
  name: "counting",
  register: async () => {},
  onMessageCreate: handleMessageCreate,
  onMessageDelete: handleMessageDelete,
} satisfies Feature;
