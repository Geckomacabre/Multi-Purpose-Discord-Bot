import { ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../interfaces/command';

const DISCORD_EPOCH = 1420070400000n;

const Snowflake: Command = {
  data: new SlashCommandBuilder()
    .setName('snowflake')
    .setDescription('Decode a Discord snowflake ID')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM])
    .addStringOption(o => o.setName('id').setDescription('Discord ID / snowflake').setRequired(true)) as any,
  async run(interaction: ChatInputCommandInteraction) {
    const id = interaction.options.getString('id', true).trim();
    if (!/^\d{15,21}$/.test(id)) { await interaction.reply({ content: '❌ That doesn\'t look like a valid Discord ID.', flags: MessageFlags.Ephemeral }); return; }
    const snowflake = BigInt(id);
    const timestamp = Number((snowflake >> 22n) + DISCORD_EPOCH);
    const workerId = Number((snowflake & 0x3E0000n) >> 17n);
    const processId = Number((snowflake & 0x1F000n) >> 12n);
    const increment = Number(snowflake & 0xFFFn);
    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle(`Snowflake: ${id}`)
      .addFields(
        { name: 'Timestamp', value: `<t:${Math.floor(timestamp / 1000)}:F> (<t:${Math.floor(timestamp / 1000)}:R>)`, inline: false },
        { name: 'Worker ID', value: String(workerId), inline: true },
        { name: 'Process ID', value: String(processId), inline: true },
        { name: 'Increment', value: String(increment), inline: true },
      );
    await interaction.reply({ embeds: [embed] });
  },
};
export default Snowflake;
