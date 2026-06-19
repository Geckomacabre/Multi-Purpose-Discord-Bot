import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, MessageFlags, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';

const Emote: Command = {
  data: new SlashCommandBuilder()
    .setName('emote')
    .setDescription('Get info and the full image of a custom emoji')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addStringOption(o => o.setName('emoji').setDescription('Custom emoji').setRequired(true)) as any,
  async run(interaction: ChatInputCommandInteraction) {
    const raw = interaction.options.getString('emoji', true).trim();
    const match = raw.match(/^<(a?):(\w+):(\d+)>$/);
    if (!match) { await interaction.reply({ content: '❌ Please provide a custom Discord emoji (e.g. `<:name:id>` or `<a:name:id>`).', flags: MessageFlags.Ephemeral }); return; }
    const animated = match[1] === 'a';
    const name = match[2]!;
    const id = match[3]!;
    const ext = animated ? 'gif' : 'png';
    const url = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=256`;
    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle(`:${name}:`)
      .setImage(url)
      .addFields(
        { name: 'ID', value: id, inline: true },
        { name: 'Animated', value: animated ? 'Yes' : 'No', inline: true },
        { name: 'URL', value: url, inline: false },
      );
    await interaction.reply({ embeds: [embed] });
  },
};
export default Emote;
