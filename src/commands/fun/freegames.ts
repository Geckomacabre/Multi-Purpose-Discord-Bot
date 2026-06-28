import {
  ActionRowBuilder, ApplicationIntegrationType, ButtonBuilder, ButtonStyle,
  ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, MessageFlags, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { fetchAllFreeGames } from '../../features/freegames/index.js';

const PLATFORM_EMOJI: Record<string, string> = {
  'Epic Games Store': '<:epic:1>',
  'Steam': '🎮',
  'GOG': '🎁',
};

const FreeGames: Command = {
  data: new SlashCommandBuilder()
    .setName('freegames')
    .setDescription('Check what games are currently free to claim')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild]),

  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const games = await fetchAllFreeGames();

    if (!games.length) {
      await interaction.editReply({ embeds: [
        new EmbedBuilder()
          .setColor(Colors.Grey)
          .setTitle('🎮 Free Games')
          .setDescription('No free games found right now. Check back later!'),
      ]});
      return;
    }

    // Send one embed per game (up to 10 to avoid rate limits)
    const toShow = games.slice(0, 10);

    const embeds = toShow.map(game => {
      const embed = new EmbedBuilder()
        .setColor(Colors.Gold)
        .setTitle(`${game.title}`)
        .setURL(game.url)
        .setDescription(game.description ?? `Free on **${game.platform}**!`)
        .setFooter({ text: game.platform });

      if (game.image) embed.setThumbnail(game.image);

      const fields: { name: string; value: string; inline: boolean }[] = [];
      if (game.originalPrice) fields.push({ name: 'Value', value: `~~${game.originalPrice}~~  →  **FREE**`, inline: true });
      if (game.endDate) {
        const ts = Math.floor(new Date(game.endDate).getTime() / 1000);
        fields.push({ name: 'Free Until', value: `<t:${ts}:R>`, inline: true });
      }
      if (fields.length) embed.addFields(fields);
      return embed;
    });

    const buttons = toShow.map(game =>
      new ButtonBuilder()
        .setLabel(`Claim — ${game.title.slice(0, 40)}`)
        .setStyle(ButtonStyle.Link)
        .setURL(game.url)
        .setEmoji('🎮')
    );

    // Discord allows max 5 buttons per row, max 5 rows
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < buttons.length; i += 5) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
    }

    await interaction.editReply({
      content: `🎮 **${games.length} free game${games.length !== 1 ? 's' : ''} available right now:**`,
      embeds,
      components: rows.slice(0, 5),
    });
  },
};

export default FreeGames;
