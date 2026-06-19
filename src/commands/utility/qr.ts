import {
  ApplicationIntegrationType, AttachmentBuilder, ChatInputCommandInteraction,
  ContainerBuilder, FileBuilder, InteractionContextType, MessageFlags,
  SlashCommandBuilder, TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { qrCreate, qrRead } from '../../utils/image/effects.js';
import { getRecentImage } from '../../utils/image/index.js';
import { cv2Text } from '../../utils/components.js';

const IS_CV2 = MessageFlags.IsComponentsV2;

const QR: Command = {
  data: new SlashCommandBuilder()
    .setName('qr')
    .setDescription('Generate or read a QR code')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM])
    .addSubcommand(s => s.setName('create').setDescription('Generate a QR code from text or a URL')
      .addStringOption(o => o.setName('text').setDescription('Text or URL to encode').setRequired(true)))
    .addSubcommand(s => s.setName('read').setDescription('Read and decode a QR code from an image')
      .addAttachmentOption(o => o.setName('image').setDescription('Image containing a QR code'))) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply();

    if (sub === 'create') {
      const text = interaction.options.getString('text', true);
      const result = await qrCreate(text);
      const name = `qr.${result.type}`;
      const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`QR code for: \`${text.slice(0, 100)}${text.length > 100 ? '…' : ''}\``))
        .addFileComponents(new FileBuilder().setURL(`attachment://${name}`));
      await interaction.editReply({
        flags: IS_CV2,
        files: [new AttachmentBuilder(result.data, { name })],
        components: [container],
      });
      return;
    }

    if (sub === 'read') {
      const attachment = interaction.options.getAttachment('image');
      let buf: Buffer;

      if (attachment) {
        const res = await fetch(attachment.url);
        buf = Buffer.from(await res.arrayBuffer());
      } else {
        const recent = await getRecentImage(interaction);
        if (!recent) {
          await interaction.editReply(cv2Text('❌ No image found. Attach an image or make sure there\'s a recent one in this channel.'));
          return;
        }
        const res = await fetch(recent);
        buf = Buffer.from(await res.arrayBuffer());
      }

      const result = await qrRead(buf);

      if (result.type === 'empty' || !result.data?.length) {
        await interaction.editReply(cv2Text('❌ No QR code found in that image.'));
        return;
      }

      const text = result.data.toString('utf8');
      const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**QR Code Contents:**\n\`\`\`\n${text.slice(0, 1900)}\n\`\`\``));
      await interaction.editReply({ flags: IS_CV2, components: [container] });
    }
  },
};

export default QR;
