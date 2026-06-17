import { ComponentType, InteractionType, MessageFlags, TextChannel } from 'discord.js';
import { EventModule } from '../feature';

const countingModule: EventModule = {
  name: 'counting',
  handlers: {
    messageCreate: async ({ data: bot, db }) => {},
    messageUpdate: async ({ data: message, bot, db }) => {},
    messageDelete: async ({ data: message, bot, db }) => {
      const channelId = message.channelId;
      const counting = await db.getCounting(channelId);
      if (!counting) return;
      let latest = counting.last_msg;
      if (!latest || latest.message_id !== message.id) return;
      await message.channel.send({
        content: `<@${latest.author_id}> why u delete **"${latest.number.toLocaleString()}"**?`,
      });
    },
    messageDeleteBulk: async ({ data: bot, db }) => {},
    channelDelete: async ({ data: channel, bot, db }) => {
      if (!channel.isTextBased()) return;
      const textChannel = channel as TextChannel;
      if (!textChannel.guildId || !textChannel.guildId) return;
      await db.removeCountingByChannelId(textChannel.guildId, textChannel.id);
    },
    interactionCreate: async ({ data: interaction, bot, db }) => {
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
