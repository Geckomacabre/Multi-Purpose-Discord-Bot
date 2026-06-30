import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  ContainerBuilder, InteractionContextType, SlashCommandBuilder, TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getOrCreateEconomy, getEconomyConfig, adjustBalance, getActiveBoost, addBoost } from '../../utils/db';
import { cv2Err, IS_CV2 } from '../../utils/components.js';

const SHOP_ITEMS = [
  {
    id: 'xp_surge',
    name: 'XP Surge',
    emoji: '🔮',
    description: '2× XP from all sources for **1 hour**',
    price: 25_000,
    type: 'xp',
    multiplier: 2.0,
    durationMs: 3_600_000,
  },
  {
    id: 'lucky_charm',
    name: 'Lucky Charm',
    emoji: '🍀',
    description: '1.5× gambling winnings for **30 minutes**',
    price: 30_000,
    type: 'luck',
    multiplier: 1.5,
    durationMs: 1_800_000,
  },
  {
    id: 'no_cooldown',
    name: 'Hint Rush',
    emoji: '⚡',
    description: 'No hint cooldown in the guessing games for **15 minutes**',
    price: 75_000,
    type: 'guesscd',
    multiplier: 1.0,
    durationMs: 900_000,
  },
] as const;

type ItemId = (typeof SHOP_ITEMS)[number]['id'];

const Shop: Command = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Buy boosts and multipliers with your coins')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(sub =>
      sub.setName('browse').setDescription('View all available items')
    )
    .addSubcommand(sub =>
      sub.setName('buy')
        .setDescription('Purchase an item from the shop')
        .addStringOption(o =>
          o.setName('item')
            .setDescription('Item to purchase')
            .setRequired(true)
            .addChoices(
              { name: '🔮 XP Surge — 2× XP for 1 hour (25,000 coins)', value: 'xp_surge' },
              { name: '🍀 Lucky Charm — 1.5× gambling wins 30 min (30,000 coins)', value: 'lucky_charm' },
              { name: '⚡ Hint Rush — no hint cooldown 15 min (75,000 coins)', value: 'no_cooldown' },
            )
        )
    ),

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand(true);
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const cfg = await getEconomyConfig(guildId);
    const sym = cfg.currency_symbol;

    if (sub === 'browse') {
      const lines = SHOP_ITEMS.map(item => {
        return `${item.emoji} **${item.name}** — ${sym} ${item.price.toLocaleString()}\n> ${item.description}`;
      }).join('\n\n');

      const container = new ContainerBuilder()
        .setAccentColor(Colors.Blurple)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `🏪 **Shop**\nBuy boosts with your coins! Use \`/shop buy\` to purchase.\n\n${lines}`
        ));
      await interaction.reply({ flags: IS_CV2, components: [container] });
      return;
    }

    // buy subcommand
    const itemId = interaction.options.getString('item', true) as ItemId;
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) {
      await interaction.reply(cv2Err('Unknown item.')); return;
    }

    // Check for existing active boost of same type
    const existing = await getActiveBoost(guildId, userId, item.type);
    if (existing) {
      const expiresIn = Math.ceil((existing.expires_at - Date.now()) / 60_000);
      await interaction.reply(cv2Err(`You already have an active **${item.name}** — expires in ~${expiresIn} min.`));
      return;
    }

    const eco = await getOrCreateEconomy(guildId, userId);
    if (eco.balance < item.price) {
      await interaction.reply(cv2Err(`You need **${sym} ${item.price.toLocaleString()}** to buy **${item.name}**. Balance: **${sym} ${eco.balance.toLocaleString()}**.`));
      return;
    }

    const expiresAt = Date.now() + item.durationMs;
    await Promise.all([
      adjustBalance(guildId, userId, -item.price),
      addBoost(guildId, userId, item.type, item.multiplier, expiresAt),
    ]);

    const durationText = item.durationMs >= 3_600_000
      ? `${item.durationMs / 3_600_000} hour`
      : `${item.durationMs / 60_000} minutes`;

    const container = new ContainerBuilder()
      .setAccentColor(Colors.Gold)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `${item.emoji} **${item.name} Purchased!**\nYou spent **${sym} ${item.price.toLocaleString()}** and activated:\n> ${item.description}\nActive for the next **${durationText}**.`
      ));
    await interaction.reply({ flags: IS_CV2, components: [container] });
  },
};

export default Shop;
