import { ApplicationIntegrationType, ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../interfaces/command';
import { getImageBuffer, imageReply } from '../../utils/image/index.js';
import { processImage } from '../../utils/image/native.js';
import os from 'os';
import path from 'path';
import fs from 'fs';

const Uncanny: Command = {
  data: new SlashCommandBuilder()
    .setName('uncanny')
    .setDescription('Side-by-side comparison meme with two labeled panels')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addStringOption(o => o.setName('left').setDescription('Left panel label').setRequired(true))
    .addStringOption(o => o.setName('right').setDescription('Right panel label').setRequired(true))
    .addAttachmentOption(o => o.setName('image').setDescription('Image to use')) as any,
  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const left = interaction.options.getString('left', true);
    const right = interaction.options.getString('right', true);
    const buf = await getImageBuffer(interaction);

    const tmpPath = path.join(os.tmpdir(), `uncanny_${Date.now()}.png`);
    fs.writeFileSync(tmpPath, buf);

    try {
      const result = await processImage('uncanny', { caption: left, caption2: right, path: tmpPath }, buf);
      await interaction.editReply(imageReply(result.data, result.type));
    } finally {
      fs.unlink(tmpPath, () => {});
    }
  },
};
export default Uncanny;
