import { ApplicationIntegrationType, AttachmentBuilder, ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../interfaces/command';
import QRCode from 'qrcode';

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
    const buffer = await QRCode.toBuffer(text, { width: 400, margin: 2 });
    await interaction.editReply({ files: [new AttachmentBuilder(buffer, { name: 'qr.png' })] });
  },
};
export default QR;
