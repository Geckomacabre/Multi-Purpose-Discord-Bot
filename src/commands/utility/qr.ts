import { ApplicationIntegrationType, AttachmentBuilder, ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../interfaces/command';
import { qrCreate } from '../../utils/image/effects.js';

const QR: Command = {
  data: new SlashCommandBuilder()
    .setName('qr')
    .setDescription('Generate a QR code')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM])
    .addStringOption(o => o.setName('text').setDescription('Text or URL to encode').setRequired(true)) as any,
  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const text = interaction.options.getString('text', true);
    const result = await qrCreate(text);
    await interaction.editReply({ files: [new AttachmentBuilder(result.data, { name: `qr.${result.type}` })] });
  },
};
export default QR;
