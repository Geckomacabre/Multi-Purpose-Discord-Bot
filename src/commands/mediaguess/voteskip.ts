import {
  ApplicationIntegrationType, ChatInputCommandInteraction,
  InteractionContextType, MessageFlags, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { activeGames, resolveGame, VOTESKIP_DELAY_MS } from '../../utils/mediagame';

const VOTES_NEEDED = 2;

const VoteSkip: Command = {
  data: new SlashCommandBuilder()
    .setName('voteskip')
    .setDescription('Vote to skip the current guessing game (2 votes needed, available 5 min into the round)')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild]),

  async run(interaction: ChatInputCommandInteraction) {
    const state = activeGames.get(interaction.channelId);
    if (!state || state.answered) {
      await interaction.reply({ content: '❌ There is no active guessing game in this channel.', flags: MessageFlags.Ephemeral });
      return;
    }

    const remainingDelay = VOTESKIP_DELAY_MS - (Date.now() - state.startedAt);
    if (remainingDelay > 0) {
      const mins = Math.ceil(remainingDelay / 60_000);
      await interaction.reply({
        content: `⏳ Vote skip isn't available yet — everyone gets a fair shot first. Try again in **${mins} minute${mins !== 1 ? 's' : ''}**.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (state.voteskips.has(interaction.user.id)) {
      await interaction.reply({ content: '❌ You have already voted to skip this round.', flags: MessageFlags.Ephemeral });
      return;
    }

    state.voteskips.add(interaction.user.id);
    const votes = state.voteskips.size;

    if (votes >= VOTES_NEEDED) {
      state.answered = true; // lock before any await to prevent race with correct guess
      await interaction.reply({ content: `⏭️ **${votes}/${VOTES_NEEDED}** skip votes — skipping this round!` });
      await resolveGame(state, interaction.client, null, 'skip');
    } else {
      const remaining = VOTES_NEEDED - votes;
      await interaction.reply({
        content: `🗳️ Skip vote recorded: **${votes}/${VOTES_NEEDED}**. Need **${remaining}** more vote${remaining !== 1 ? 's' : ''} to skip.`,
      });
    }
  },
};

export default VoteSkip;
