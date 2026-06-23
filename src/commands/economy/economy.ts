import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  ContainerBuilder, InteractionContextType, MessageFlags, PermissionFlagsBits,
  SlashCommandBuilder, TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import {
  getEconomyConfig, getEconomyLeaderboard, setEconomyConfig,
} from '../../utils/db';
import { cv2Text } from '../../utils/components.js';

const IS_CV2 = MessageFlags.IsComponentsV2;

const Economy: Command = {
  data: new SlashCommandBuilder()
    .setName('economy')
    .setDescription('Economy commands')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(s => s.setName('leaderboard').setDescription('Show the richest users in the server')
      .addIntegerOption(o => o.setName('limit').setDescription('Number of users to show (default 10, max 25)').setMinValue(1).setMaxValue(25)))
    .addSubcommandGroup(g => g.setName('config').setDescription('Configure the server economy')
      .addSubcommand(s => s.setName('currency').setDescription('Set the currency name and symbol')
        .addStringOption(o => o.setName('name').setDescription('Currency name (e.g. coins, gems, tokens)').setRequired(true))
        .addStringOption(o => o.setName('symbol').setDescription('Currency symbol / emoji (e.g. 🪙, 💎)').setRequired(true)))
      .addSubcommand(s => s.setName('starting').setDescription('Set how many coins new users start with')
        .addIntegerOption(o => o.setName('amount').setDescription('Starting balance').setRequired(true).setMinValue(0)))
      .addSubcommand(s => s.setName('daily').setDescription('Set the daily reward range')
        .addIntegerOption(o => o.setName('min').setDescription('Minimum daily reward').setRequired(true).setMinValue(1))
        .addIntegerOption(o => o.setName('max').setDescription('Maximum daily reward').setRequired(true).setMinValue(1)))
      .addSubcommand(s => s.setName('weekly').setDescription('Set the weekly reward range')
        .addIntegerOption(o => o.setName('min').setDescription('Minimum weekly reward').setRequired(true).setMinValue(1))
        .addIntegerOption(o => o.setName('max').setDescription('Maximum weekly reward').setRequired(true).setMinValue(1)))
      .addSubcommand(s => s.setName('monthly').setDescription('Set the monthly reward range')
        .addIntegerOption(o => o.setName('min').setDescription('Minimum monthly reward').setRequired(true).setMinValue(1))
        .addIntegerOption(o => o.setName('max').setDescription('Maximum monthly reward').setRequired(true).setMinValue(1)))
      .addSubcommand(s => s.setName('yearly').setDescription('Set the yearly reward range')
        .addIntegerOption(o => o.setName('min').setDescription('Minimum yearly reward').setRequired(true).setMinValue(1))
        .addIntegerOption(o => o.setName('max').setDescription('Maximum yearly reward').setRequired(true).setMinValue(1)))
      .addSubcommand(s => s.setName('work').setDescription('Set the work reward range')
        .addIntegerOption(o => o.setName('min').setDescription('Minimum work reward').setRequired(true).setMinValue(1))
        .addIntegerOption(o => o.setName('max').setDescription('Maximum work reward').setRequired(true).setMinValue(1)))
      .addSubcommand(s => s.setName('view').setDescription('View current economy settings'))) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    // ── Config ─────────────────────────────────────────────────────────────────
    if (group === 'config') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ ...cv2Text('❌ You need **Manage Server** to configure the economy.'), flags: IS_CV2 | MessageFlags.Ephemeral });
        return;
      }
      if (sub === 'currency') {
        const name = interaction.options.getString('name', true);
        const symbol = interaction.options.getString('symbol', true);
        await setEconomyConfig(guildId, { currency_name: name, currency_symbol: symbol });
        await interaction.reply({ ...cv2Text(`Currency set to **${symbol} ${name}**.`), flags: IS_CV2 | MessageFlags.Ephemeral });
      } else if (sub === 'starting') {
        const amount = interaction.options.getInteger('amount', true);
        await setEconomyConfig(guildId, { starting_balance: amount });
        await interaction.reply({ ...cv2Text(`New users will start with **${amount}** coins.`), flags: IS_CV2 | MessageFlags.Ephemeral });
      } else if (sub === 'daily') {
        const min = interaction.options.getInteger('min', true), max = interaction.options.getInteger('max', true);
        if (min > max) { await interaction.reply({ ...cv2Text('❌ Min cannot be greater than max.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return; }
        await setEconomyConfig(guildId, { daily_min: min, daily_max: max });
        await interaction.reply({ ...cv2Text(`Daily reward set to **${min}–${max}** coins.`), flags: IS_CV2 | MessageFlags.Ephemeral });
      } else if (sub === 'weekly') {
        const min = interaction.options.getInteger('min', true), max = interaction.options.getInteger('max', true);
        if (min > max) { await interaction.reply({ ...cv2Text('❌ Min cannot be greater than max.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return; }
        await setEconomyConfig(guildId, { weekly_min: min, weekly_max: max });
        await interaction.reply({ ...cv2Text(`Weekly reward set to **${min}–${max}** coins.`), flags: IS_CV2 | MessageFlags.Ephemeral });
      } else if (sub === 'monthly') {
        const min = interaction.options.getInteger('min', true), max = interaction.options.getInteger('max', true);
        if (min > max) { await interaction.reply({ ...cv2Text('❌ Min cannot be greater than max.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return; }
        await setEconomyConfig(guildId, { monthly_min: min, monthly_max: max });
        await interaction.reply({ ...cv2Text(`Monthly reward set to **${min}–${max}** coins.`), flags: IS_CV2 | MessageFlags.Ephemeral });
      } else if (sub === 'yearly') {
        const min = interaction.options.getInteger('min', true), max = interaction.options.getInteger('max', true);
        if (min > max) { await interaction.reply({ ...cv2Text('❌ Min cannot be greater than max.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return; }
        await setEconomyConfig(guildId, { yearly_min: min, yearly_max: max });
        await interaction.reply({ ...cv2Text(`Yearly reward set to **${min}–${max}** coins.`), flags: IS_CV2 | MessageFlags.Ephemeral });
      } else if (sub === 'work') {
        const min = interaction.options.getInteger('min', true), max = interaction.options.getInteger('max', true);
        if (min > max) { await interaction.reply({ ...cv2Text('❌ Min cannot be greater than max.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return; }
        await setEconomyConfig(guildId, { work_min: min, work_max: max });
        await interaction.reply({ ...cv2Text(`Work reward set to **${min}–${max}** coins.`), flags: IS_CV2 | MessageFlags.Ephemeral });
      } else {
        const cfg = await getEconomyConfig(guildId);
        const container = new ContainerBuilder()
          .setAccentColor(Colors.Gold)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Economy Config**\n**Currency:** ${cfg.currency_symbol} ${cfg.currency_name}\n**Starting Balance:** ${cfg.currency_symbol} ${cfg.starting_balance}\n**Daily Reward:** ${cfg.currency_symbol} ${cfg.daily_min}–${cfg.daily_max}\n**Weekly Reward:** ${cfg.currency_symbol} ${cfg.weekly_min}–${cfg.weekly_max}\n**Monthly Reward:** ${cfg.currency_symbol} ${cfg.monthly_min}–${cfg.monthly_max}\n**Yearly Reward:** ${cfg.currency_symbol} ${cfg.yearly_min}–${cfg.yearly_max}\n**Work Reward:** ${cfg.currency_symbol} ${cfg.work_min}–${cfg.work_max}`
          ));
        await interaction.reply({ flags: IS_CV2 | MessageFlags.Ephemeral, components: [container] });
      }
      return;
    }

    if (sub === 'leaderboard') {
      await interaction.deferReply();
      const limit = interaction.options.getInteger('limit') ?? 10;
      let members = interaction.guild!.members.cache;
      if (members.size <= 1) members = await interaction.guild!.members.fetch();
      const memberIds = [...members.keys()];
      const [rows, cfg] = await Promise.all([getEconomyLeaderboard(memberIds, limit), getEconomyConfig(guildId)]);
      if (!rows.length) { await interaction.editReply(cv2Text('No economy data yet. Start earning with `/daily` and `/work`!')); return; }
      const medals = ['🥇', '🥈', '🥉'];
      const lines = rows.map((row, i) => `${medals[i] ?? `**${i + 1}.**`} <@${row.user_id}> — ${cfg.currency_symbol} **${row.balance.toLocaleString()}**`);
      const container = new ContainerBuilder()
        .setAccentColor(Colors.Gold)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${cfg.currency_symbol} Richest Users**\n\n${lines.join('\n')}`));
      await interaction.editReply({ flags: IS_CV2, components: [container] });
      return;
    }
  },
};

export default Economy;
