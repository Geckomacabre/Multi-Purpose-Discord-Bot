import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  EmbedBuilder, InteractionContextType, SlashCommandBuilder,
  MessageFlags,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getEconomyConfig, getEconomyCooldown, setEconomyCooldown, adjustBalance } from '../../utils/db';

const WORK_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

const WORK_JOBS = [
  'worked the night shift at a gas station',
  'delivered pizzas',
  'mowed lawns in the neighborhood',
  'streamed on Twitch for 3 hours',
  'drove for a rideshare app',
  'sold some old junk online',
  'walked dogs around the park',
  'wrote an article for a blog',
  'fixed a neighbor\'s computer',
  'washed cars at the carwash',
  'sorted packages at a warehouse',
  'helped move furniture',
  'tutored a kid in math',
  'flipped burgers at the local diner',
];

const Work: Command = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Work to earn some coins (1-hour cooldown)')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild]) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const cfg = await getEconomyConfig(guildId);

    const lastUsed = await getEconomyCooldown(guildId, userId, 'work');
    const elapsed = Date.now() - lastUsed;
    if (elapsed < WORK_COOLDOWN_MS) {
      const remaining = WORK_COOLDOWN_MS - elapsed;
      const minutes = Math.floor(remaining / 60_000);
      const seconds = Math.floor((remaining % 60_000) / 1000);
      await interaction.reply({
        content: `You're tired from your last job. Rest for **${minutes}m ${seconds}s** before working again.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const amount = Math.floor(Math.random() * (cfg.work_max - cfg.work_min + 1)) + cfg.work_min;
    const job = WORK_JOBS[Math.floor(Math.random() * WORK_JOBS.length)];
    const { newBalance } = await adjustBalance(guildId, userId, amount);
    await setEconomyCooldown(guildId, userId, 'work');

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle(`${cfg.currency_symbol} Work Complete`)
      .setDescription(`You ${job} and earned **${cfg.currency_symbol} ${amount.toLocaleString()} ${cfg.currency_name}**!\nNew balance: **${newBalance.toLocaleString()}**`)
      .setFooter({ text: 'You can work again in 1 hour.' });

    await interaction.reply({ embeds: [embed] });
  },
};

export default Work;
