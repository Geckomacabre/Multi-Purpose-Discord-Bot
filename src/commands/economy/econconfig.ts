import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  EmbedBuilder, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getEconomyConfig, setEconomyConfig } from '../../utils/db';

const Econconfig: Command = {
  data: new SlashCommandBuilder()
    .setName('econconfig')
    .setDescription('Configure the server economy')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub
      .setName('currency')
      .setDescription('Set the currency name and symbol')
      .addStringOption(o => o.setName('name').setDescription('Currency name (e.g. coins, gems, tokens)').setRequired(true))
      .addStringOption(o => o.setName('symbol').setDescription('Currency symbol / emoji (e.g. 🪙, 💎)').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('starting')
      .setDescription('Set how many coins new users start with')
      .addIntegerOption(o => o.setName('amount').setDescription('Starting balance').setRequired(true).setMinValue(0))
    )
    .addSubcommand(sub => sub
      .setName('daily')
      .setDescription('Set the daily reward range')
      .addIntegerOption(o => o.setName('min').setDescription('Minimum daily reward').setRequired(true).setMinValue(1))
      .addIntegerOption(o => o.setName('max').setDescription('Maximum daily reward').setRequired(true).setMinValue(1))
    )
    .addSubcommand(sub => sub
      .setName('work')
      .setDescription('Set the work reward range')
      .addIntegerOption(o => o.setName('min').setDescription('Minimum work reward').setRequired(true).setMinValue(1))
      .addIntegerOption(o => o.setName('max').setDescription('Maximum work reward').setRequired(true).setMinValue(1))
    )
    .addSubcommand(sub => sub
      .setName('view')
      .setDescription('View current economy settings')
    ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (sub === 'currency') {
      const name = interaction.options.getString('name', true);
      const symbol = interaction.options.getString('symbol', true);
      await setEconomyConfig(guildId, { currency_name: name, currency_symbol: symbol });
      await interaction.reply({ content: `Currency set to **${symbol} ${name}**.`, ephemeral: true });
      return;
    }

    if (sub === 'starting') {
      const amount = interaction.options.getInteger('amount', true);
      await setEconomyConfig(guildId, { starting_balance: amount });
      await interaction.reply({ content: `New users will start with **${amount}** coins.`, ephemeral: true });
      return;
    }

    if (sub === 'daily') {
      const min = interaction.options.getInteger('min', true);
      const max = interaction.options.getInteger('max', true);
      if (min > max) { await interaction.reply({ content: '❌ Min cannot be greater than max.', ephemeral: true }); return; }
      await setEconomyConfig(guildId, { daily_min: min, daily_max: max });
      await interaction.reply({ content: `Daily reward set to **${min}–${max}** coins.`, ephemeral: true });
      return;
    }

    if (sub === 'work') {
      const min = interaction.options.getInteger('min', true);
      const max = interaction.options.getInteger('max', true);
      if (min > max) { await interaction.reply({ content: '❌ Min cannot be greater than max.', ephemeral: true }); return; }
      await setEconomyConfig(guildId, { work_min: min, work_max: max });
      await interaction.reply({ content: `Work reward set to **${min}–${max}** coins.`, ephemeral: true });
      return;
    }

    if (sub === 'view') {
      const cfg = await getEconomyConfig(guildId);
      const embed = new EmbedBuilder()
        .setColor(Colors.Gold)
        .setTitle('Economy Config')
        .addFields(
          { name: 'Currency', value: `${cfg.currency_symbol} ${cfg.currency_name}`, inline: true },
          { name: 'Starting Balance', value: `${cfg.currency_symbol} ${cfg.starting_balance}`, inline: true },
          { name: 'Daily Reward', value: `${cfg.currency_symbol} ${cfg.daily_min}–${cfg.daily_max}`, inline: true },
          { name: 'Work Reward', value: `${cfg.currency_symbol} ${cfg.work_min}–${cfg.work_max}`, inline: true },
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
  },
};

export default Econconfig;
