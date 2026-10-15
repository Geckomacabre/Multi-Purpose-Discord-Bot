import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  ContainerBuilder, InteractionContextType, PermissionFlagsBits,
  SlashCommandBuilder, TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getEconomyConfig, adjustBalance } from '../../utils/db';
import { cv2Err, IS_CV2 } from '../../utils/components.js';

const Admin: Command = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin tools (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(s => s.setName('givemoney').setDescription('Give coins to a user')
      .addUserOption(o => o.setName('user').setDescription('User to give coins to').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount to give').setRequired(true).setMinValue(1).setMaxValue(1_000_000_000))),

  async run(interaction: ChatInputCommandInteraction) {
    // Default permissions can be overridden in server settings, so enforce Administrator here too.
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply(cv2Err('❌ You need the Administrator permission to use this command.')); return;
    }
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (sub === 'givemoney') {
      const target = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      if (target.bot) { await interaction.reply(cv2Err('❌ You cannot give coins to bots.')); return; }
      const cfg = await getEconomyConfig(guildId);
      const { newBalance } = await adjustBalance(guildId, target.id, amount);
      const container = new ContainerBuilder()
        .setAccentColor(Colors.Green)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `**${cfg.currency_symbol} Coins Granted**\n<@${interaction.user.id}> gave **${cfg.currency_symbol} ${amount.toLocaleString()} ${cfg.currency_name}** to <@${target.id}>.\nNew balance: **${cfg.currency_symbol} ${newBalance.toLocaleString()}**`
        ));
      await interaction.reply({ flags: IS_CV2, components: [container] });
    }
  },
};

export default Admin;
