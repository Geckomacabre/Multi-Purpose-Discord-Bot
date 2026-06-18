import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  EmbedBuilder, InteractionContextType, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getEconomyConfig, getOrCreateEconomy, adjustBalance } from '../../utils/db';

const Pay: Command = {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Send coins to another user')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addUserOption(o => o.setName('user').setDescription('User to pay').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount to send').setRequired(true).setMinValue(1)) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const sender = interaction.user;
    const target = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);

    if (target.id === sender.id) {
      await interaction.reply({ content: '❌ You cannot pay yourself.', ephemeral: true }); return;
    }
    if (target.bot) {
      await interaction.reply({ content: '❌ You cannot pay bots.', ephemeral: true }); return;
    }

    const cfg = await getEconomyConfig(guildId);
    const senderEco = await getOrCreateEconomy(guildId, sender.id);
    if (senderEco.balance < amount) {
      await interaction.reply({
        content: `❌ Insufficient balance. You have **${cfg.currency_symbol} ${senderEco.balance.toLocaleString()}**.`,
        ephemeral: true,
      });
      return;
    }

    await adjustBalance(guildId, sender.id, -amount);
    await adjustBalance(guildId, target.id, amount);

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle(`${cfg.currency_symbol} Payment Sent`)
      .setDescription(`<@${sender.id}> sent **${cfg.currency_symbol} ${amount.toLocaleString()} ${cfg.currency_name}** to <@${target.id}>.`);

    await interaction.reply({ embeds: [embed] });
  },
};

export default Pay;
