import { ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../interfaces/command';

const Xkcd: Command = {
  data: new SlashCommandBuilder()
    .setName('xkcd')
    .setDescription('Get a random or specific xkcd comic')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM])
    .addIntegerOption(o => o.setName('number').setDescription('Comic number (omit for random)').setMinValue(1)) as any,

  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    try {
      // Get latest first to know max number
      const latest: any = await fetch('https://xkcd.com/info.0.json', { signal: AbortSignal.timeout(8000) }).then(r => r.json());
      const num = interaction.options.getInteger('number') ?? Math.floor(Math.random() * latest.num) + 1;
      const comic: any = num === latest.num ? latest : await fetch(`https://xkcd.com/${num}/info.0.json`, { signal: AbortSignal.timeout(8000) }).then(r => r.json());

      const embed = new EmbedBuilder()
        .setColor(Colors.White)
        .setTitle(`#${comic.num}: ${comic.title}`)
        .setImage(comic.img)
        .setDescription(comic.alt.slice(0, 4096))
        .setURL(`https://xkcd.com/${comic.num}`)
        .setFooter({ text: `${comic.year}-${comic.month}-${comic.day}` });

      await interaction.editReply({ embeds: [embed] });
    } catch {
      await interaction.editReply('❌ Could not fetch xkcd comic.');
    }
  },
};

export default Xkcd;
