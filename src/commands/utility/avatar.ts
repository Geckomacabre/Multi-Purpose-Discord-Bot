import { ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../interfaces/command';

const Avatar: Command = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Get a user's avatar")
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM])
    .addUserOption(o => o.setName('user').setDescription('User (defaults to you)')) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser('user') ?? interaction.user;
    const avatar = user.displayAvatarURL({ size: 4096 });
    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle(`${user.username}'s Avatar`)
      .setImage(avatar)
      .setURL(avatar);
    await interaction.reply({ embeds: [embed] });
  },
};

export default Avatar;
