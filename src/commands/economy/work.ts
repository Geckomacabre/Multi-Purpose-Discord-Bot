import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  ContainerBuilder, InteractionContextType, MessageFlags,
  SlashCommandBuilder, TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getEconomyConfig, getEconomyCooldown, setEconomyCooldown, adjustBalance } from '../../utils/db';
import { cv2Text } from '../../utils/components.js';

const IS_CV2 = MessageFlags.IsComponentsV2;
const WORK_COOLDOWN_MS = 60 * 60 * 1000;
const pendingWorkNotifications = new Map<string, ReturnType<typeof setTimeout>>();

const WORK_JOBS = [
  'worked the night shift at a gas station', 'delivered pizzas', 'mowed lawns in the neighborhood',
  'streamed on Twitch for 3 hours', 'drove for a rideshare app', 'sold some old junk online',
  'walked dogs around the park', 'wrote an article for a blog', 'fixed a neighbor\'s computer',
  'washed cars at the carwash', 'sorted packages at a warehouse', 'helped move furniture',
  'tutored a kid in math', 'flipped burgers at the local diner',
];

function pick<T>(arr: T[]) { return arr[Math.floor(Math.random() * arr.length)]; }

const Work: Command = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Work to earn some coins (1-hour cooldown)')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild]),

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
      await interaction.reply({ ...cv2Text(`You're tired from your last job. Rest for **${minutes}m ${seconds}s** before working again.`), flags: IS_CV2 | MessageFlags.Ephemeral });
      return;
    }
    const amount = Math.floor(Math.random() * (cfg.work_max - cfg.work_min + 1)) + cfg.work_min;
    const job = pick(WORK_JOBS);
    const { newBalance } = await adjustBalance(guildId, userId, amount);
    await setEconomyCooldown(guildId, userId, 'work');
    const container = new ContainerBuilder()
      .setAccentColor(Colors.Blue)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**${cfg.currency_symbol} Work Complete**\nYou ${job} and earned **${cfg.currency_symbol} ${amount.toLocaleString()} ${cfg.currency_name}**!\nNew balance: **${newBalance.toLocaleString()}**\n*You can work again in 1 hour.*`
      ));
    await interaction.reply({ flags: IS_CV2, components: [container] });
    const existing = pendingWorkNotifications.get(userId);
    if (existing) clearTimeout(existing);
    const { channelId, client } = interaction;
    const timer = setTimeout(async () => {
      pendingWorkNotifications.delete(userId);
      try {
        const channel = await client.channels.fetch(channelId);
        if (channel?.isTextBased()) await (channel as any).send(`⏰ <@${userId}> Your work cooldown is up! Run \`/work\` to earn more ${cfg.currency_symbol} ${cfg.currency_name}.`);
      } catch {}
    }, WORK_COOLDOWN_MS);
    pendingWorkNotifications.set(userId, timer);
  },
};

export default Work;
