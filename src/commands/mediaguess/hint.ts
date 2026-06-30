import {
  ApplicationIntegrationType, ChatInputCommandInteraction,
  InteractionContextType, MessageFlags, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { activeGames, buildNextHint } from '../../utils/mediagame';
import { getActiveBoost } from '../../utils/db';

const Hint: Command = {
  data: new SlashCommandBuilder()
    .setName('hint')
    .setDescription('Reveal the next clue for the guessing game in this channel')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild]),

  async run(interaction: ChatInputCommandInteraction) {
    const state = activeGames.get(interaction.channelId);
    if (!state || state.answered) {
      await interaction.reply({ content: '❌ There is no active guessing game in this channel.', flags: MessageFlags.Ephemeral });
      return;
    }

    // ⚡ Hint Rush boost (from /shop) lets the buyer skip the hint cooldown
    const rush = interaction.guildId
      ? await getActiveBoost(interaction.guildId, interaction.user.id, 'guesscd')
      : null;

    const payload = buildNextHint(interaction.channelId, interaction.user.displayName, !!rush);
    if (!payload) {
      await interaction.reply({ content: '❌ No active game.', flags: MessageFlags.Ephemeral });
      return;
    }

    // Content-only means all hints are exhausted
    if (payload.content && !payload.embeds) {
      await interaction.reply({ content: payload.content, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply(payload as any);
  },
};

export default Hint;
