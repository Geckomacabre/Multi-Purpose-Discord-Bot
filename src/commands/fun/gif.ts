import {
  ApplicationIntegrationType, ChatInputCommandInteraction, EmbedBuilder,
  InteractionContextType, SlashCommandBuilder, Colors, MessageFlags,
} from 'discord.js';
import { Command } from '../../interfaces/command';

const Gif: Command = {
  data: new SlashCommandBuilder()
    .setName('gif')
    .setDescription('Search for a GIF using Tenor')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addStringOption(o => o.setName('query').setDescription('What to search for').setRequired(true)) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const apiKey = Bun.env.TENOR_API_KEY;
    if (!apiKey) {
      return interaction.reply({ content: '⚠️ `TENOR_API_KEY` is not set in `.env`. Get a free key at https://developers.google.com/tenor', flags: MessageFlags.Ephemeral });
    }

    const query = interaction.options.getString('query', true);
    await interaction.deferReply();

    const res = await fetch(
      `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${apiKey}&limit=20&media_filter=gif&contentfilter=medium`,
    );
    if (!res.ok) { await interaction.editReply('Failed to fetch GIFs. Try again later.'); return; }

    const data: any = await res.json();
    if (!data.results?.length) { await interaction.editReply(`No GIFs found for **${query}**.`); return; }

    const result = data.results[Math.floor(Math.random() * data.results.length)];
    const gifUrl: string = result.media_formats?.gif?.url ?? result.media_formats?.tinygif?.url ?? '';
    if (!gifUrl) { await interaction.editReply('Could not extract GIF URL.'); return; }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.Purple)
          .setTitle(`🎞️ ${query}`)
          .setImage(gifUrl)
          .setFooter({ text: 'Powered by Tenor' }),
      ],
    });
  },
};

export default Gif;
