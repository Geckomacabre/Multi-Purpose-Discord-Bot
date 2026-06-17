import { Message, TextChannel } from 'discord.js';
import * as db from '../utils/db';

export const onMessageCreate = async (message: Message) => {
  if (!message.guildId || message.author?.bot) return;
  const counting = await db.getCounting(message.channelId);
  if (!counting) return;

  const { count, highscore, last_msg } = counting;
  let lastUser = last_msg?.author_id;

  let lowerContent = (message.content || '').toLowerCase();
  if (lowerContent.includes('what is the count') || lowerContent.includes('what are we up to')) {
    if (!message.channel || !message.channel.isTextBased()) return;

    const channel = message.channel as TextChannel;

    await channel.send({
      content: `We are up to ${count.toLocaleString()}, so next number is **${(count + 1).toLocaleString()}!**`,
      reply: {
        messageReference: message.id,
      },
    });
    return;
  }

  // Respond to cheaty emojis
  if (message.content?.includes('☑️') || message.content?.includes('✅')) {
    setTimeout(async () => {
      try {
        await message.react('🤨');
      } catch (err) {
        console.error('Failed to react:', err);
      }
    }, 200);
  }

  const num = Number.parseInt(message.content.replaceAll(',', ''));
  if (isNaN(num) || !num || num === 0) return;
  if (lastUser && last_msg?.failed !== true && message.author.id === lastUser) {
    if (!message.channel.isTextBased()) return;

    await message.reply({
      content: `⚠️ <@${message.author.id}> Wait for someone else to send **${(count + 1).toLocaleString()}.**`,
    });

    await message.react('⚠️').catch(console.error);

    return;
  }
  if (!message.channel.isTextBased()) return;

  if (num === count + 2 || num === count) {
    await message.reply({
      content: `⚠️ <@${message.author.id}> You're close, but you actually need to send **${(count + 1).toLocaleString()}.**`,
    });

    await message.react('⚠️').catch(console.error);

    return;
  }

  if (num !== count + 1) {
    if (lastUser && last_msg?.failed && message.author.id === lastUser) {
      await message.react('❌').catch(console.error);

      return;
    }

    const punishmentNumber = Math.max(
      0,
      Math.min(
        Math.max(
          count - Math.round(Math.abs(count - num) * (Math.random() * 2 + 1.35)),
          Math.round(count * (1 - (count > 25 ? 0.15 : 0.5)))
        ),
        count - 1
      )
    );

    const nextMsg = {
      message_id: message.id,
      author_id: message.author.id,
      number: num,
      failed: true,
    };

    await db.updateCounting(message.channel.id, {
      count: punishmentNumber,
      last_msg: nextMsg,
    });

    await message.reply({
      content: `⚠️ <@${message.author.id}> RUINED IT AT **${count.toLocaleString()}**!! Now next number is **${(punishmentNumber + 1).toLocaleString()}.**`,
    });

    await message.react('❌').catch(console.error);

    return;
  }

  const nextMsg = {
    message_id: message.id,
    author_id: message.author.id,
    number: num,
  };

  await db.updateCounting(message.channel.id, {
    count: count + 1,
    highscore: Math.max(highscore ?? 0, count + 1),
    last_msg: nextMsg,
  });

  await message.react((highscore ?? 0) <= count + 1 ? '☑️' : '✅').catch(console.error);
};
