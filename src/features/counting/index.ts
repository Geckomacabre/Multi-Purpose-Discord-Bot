import { ComponentType, InteractionType, MessageFlags, TextChannel } from 'discord.js';
import { EventModule } from '../feature';

const countingModule: EventModule = {
  name: 'counting',
  handlers: {
    messageCreate: async ({ data: [message], bot, db }) => {
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
    },
    messageUpdate: async ({ data: [oldMessage, newMessage], bot, db }) => {
      const counting = await db.getCounting(newMessage.channelId);
      if (!counting) return;

      const latest = counting.last_msg;
      if (!latest || latest.message_id !== newMessage.id) return;

      const newNumber = Number.parseInt(newMessage.content ?? '', 10);
      if (isNaN(newNumber) || newNumber === latest.number) return;

      const channel = newMessage.channel as TextChannel;
      if (!channel || !channel.isTextBased()) return;

      await channel.send({
        content: `<@${latest.author_id}> why change your message from **"${latest.number.toLocaleString()}"**?`,
      });
    },
    messageDelete: async ({ data: [message], bot, db }) => {
      const channelId = message.channelId;
      const counting = await db.getCounting(channelId);
      if (!counting) return;
      let latest = counting.last_msg;
      if (!latest || latest.message_id !== message.id) return;
      await message.channel.send({
        content: `<@${latest.author_id}> why u delete **"${latest.number.toLocaleString()}"**?`,
      });
    },
    messageDeleteBulk: async ({ data: [messages, channel], bot, db }) => {
      const counting = await db.getCounting(channel.id);
      if (!counting) return;

      const latest = counting.last_msg;
      if (!latest) return;

      const wasDeleted = messages.has(latest.message_id);
      if (!wasDeleted) return;

      await channel.send({
        content: `<@${latest.author_id}> why u delete **${latest.number.toLocaleString()}**?`,
        allowedMentions: { users: [latest.author_id] },
      });
    },
    channelDelete: async ({ data: [channel], bot, db }) => {
      if (!channel.isTextBased()) return;
      const textChannel = channel as TextChannel;
      if (!textChannel.guildId || !textChannel.guildId) return;
      await db.removeCountingByChannelId(textChannel.guildId, textChannel.id);
    },
    interactionCreate: async ({ data: [interaction], bot, db }) => {
      if (!interaction.guildId) return;
      if (interaction.type === InteractionType.ModalSubmit && interaction.customId.startsWith('counting_modal:')) {
        const channelId = interaction.channel?.id;
        if (!channelId) return;

        let newCount = 0;
        let newHighScore = 0;
        let resetMessages = false;

        for (const label of interaction.components) {
          if (label.type !== ComponentType.Label) continue;
          const c = label.component ?? label;
          if (!c) continue;
          if (c.type === ComponentType.TextInput) {
            if (c.customId === 'current_count' && c.value) newCount = Number(c.value.replaceAll(',', ''));
            if (c.customId === 'high_score' && c.value) newHighScore = Number(c.value.replaceAll(',', ''));
          } else if (c.type === ComponentType.Checkbox) {
            if (c.customId === 'reset_messages') resetMessages = c.value;
          }
        }

        if (isNaN(newCount) || isNaN(newHighScore)) {
          await interaction.reply({
            content: `❌ Please enter valid numbers for count and high score.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (resetMessages) {
          await db.unsetCounting(channelId);
          await interaction.reply({
            content: `🚫 Counting has been disabled for this channel and all data has been reset.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await db.setCounting(channelId, interaction.guildId, newCount, Math.max(newHighScore, newCount), undefined);
        await interaction.reply({
          content: `✅ Counting has been updated for this channel! The current count is now **${newCount.toLocaleString()}** with a high score of **${newHighScore.toLocaleString()}**.`,
        });
      }
    },
  },
};

export default countingModule;
