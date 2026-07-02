import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  ContainerBuilder, InteractionContextType, SlashCommandBuilder, TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getEconomyConfig, getEconomyCooldown, setEconomyCooldown, adjustBalance, getActiveBoost } from '../../utils/db';
import { cv2Err, IS_CV2 } from '../../utils/components.js';

const DAILY_COOLDOWN_MS = 20 * 60 * 60 * 1000;

const Daily: Command = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily coin reward')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild]),

  async run(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const cfg = await getEconomyConfig(guildId);
    const lastUsed = await getEconomyCooldown(userId, 'daily');
    const elapsed = Date.now() - lastUsed;
    if (elapsed < DAILY_COOLDOWN_MS) {
      const remaining = DAILY_COOLDOWN_MS - elapsed;
      const hours = Math.floor(remaining / 3_600_000);
      const minutes = Math.floor((remaining % 3_600_000) / 60_000);
      await interaction.reply(cv2Err(`You already claimed your daily reward. Come back in **${hours}h ${minutes}m**.`)); return;
    }
    const magnet = await getActiveBoost(guildId, userId, 'magnet');
    const base = Math.floor(Math.random() * (cfg.daily_max - cfg.daily_min + 1)) + cfg.daily_min;
    const amount = magnet ? Math.floor(base * magnet.multiplier) : base;
    const { newBalance } = await adjustBalance(guildId, userId, amount);
    await setEconomyCooldown(userId, 'daily');
    const magnetNote = magnet ? '\n🧲 *Coin Magnet boosted your reward!*' : '';
    const container = new ContainerBuilder()
      .setAccentColor(Colors.Green)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**${cfg.currency_symbol} Daily Reward**\nYou claimed **${cfg.currency_symbol} ${amount.toLocaleString()} ${cfg.currency_name}**!\nNew balance: **${newBalance.toLocaleString()}**${magnetNote}\n*Come back in 20 hours for your next reward.*`
      ));
    await interaction.reply({ flags: IS_CV2, components: [container] });
  },
};

export default Daily;
