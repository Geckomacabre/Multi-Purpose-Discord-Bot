import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  ContainerBuilder, InteractionContextType, MessageFlags, PermissionFlagsBits,
  SlashCommandBuilder, TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import {
  getOrCreateEconomy, getEconomyConfig, getEconomyLeaderboard,
  getEconomyCooldown, setEconomyCooldown, adjustBalance, setEconomyConfig,
} from '../../utils/db';
import { cv2Text } from '../../utils/components.js';

const IS_CV2 = MessageFlags.IsComponentsV2;

const WORK_COOLDOWN_MS = 60 * 60 * 1000;
const DAILY_COOLDOWN_MS = 20 * 60 * 60 * 1000;
const pendingWorkNotifications = new Map<string, ReturnType<typeof setTimeout>>();

const WORK_JOBS = [
  'worked the night shift at a gas station', 'delivered pizzas', 'mowed lawns in the neighborhood',
  'streamed on Twitch for 3 hours', 'drove for a rideshare app', 'sold some old junk online',
  'walked dogs around the park', 'wrote an article for a blog', 'fixed a neighbor\'s computer',
  'washed cars at the carwash', 'sorted packages at a warehouse', 'helped move furniture',
  'tutored a kid in math', 'flipped burgers at the local diner',
];

const REEL = ['🍒','🍒','🍒','🍒','🍒','🍋','🍋','🍋','🍋','🔔','🔔','🔔','💎','💎','7️⃣'];
const SLOT_MULTIPLIERS: Record<string, number> = { '7️⃣': 10, '💎': 5, '🔔': 3, '🍋': 2, '🍒': 1.5 };
function spinReel() { return REEL[Math.floor(Math.random() * REEL.length)]; }
function pick<T>(arr: T[]) { return arr[Math.floor(Math.random() * arr.length)]; }

const Economy: Command = {
  data: new SlashCommandBuilder()
    .setName('economy')
    .setDescription('Economy commands')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(s => s.setName('balance').setDescription('Check your or another user\'s coin balance')
      .addUserOption(o => o.setName('user').setDescription('User to check (default: yourself)')))
    .addSubcommand(s => s.setName('leaderboard').setDescription('Show the richest users in the server')
      .addIntegerOption(o => o.setName('limit').setDescription('Number of users to show (default 10, max 25)').setMinValue(1).setMaxValue(25)))
    .addSubcommand(s => s.setName('daily').setDescription('Claim your daily coin reward'))
    .addSubcommand(s => s.setName('work').setDescription('Work to earn some coins (1-hour cooldown)'))
    .addSubcommand(s => s.setName('pay').setDescription('Send coins to another user')
      .addUserOption(o => o.setName('user').setDescription('User to pay').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount to send').setRequired(true).setMinValue(1)))
    .addSubcommandGroup(g => g.setName('gamble').setDescription('Gambling minigames')
      .addSubcommand(s => s.setName('flip').setDescription('Bet on a coin flip (50/50 — win doubles your bet)')
        .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1)))
      .addSubcommand(s => s.setName('roll').setDescription('Roll 1–100 against the bot — higher roll wins')
        .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1)))
      .addSubcommand(s => s.setName('slots').setDescription('Spin the slot machine — match 3 to win!')
        .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1))))
    .addSubcommandGroup(g => g.setName('config').setDescription('Configure the server economy')
      .addSubcommand(s => s.setName('currency').setDescription('Set the currency name and symbol')
        .addStringOption(o => o.setName('name').setDescription('Currency name (e.g. coins, gems, tokens)').setRequired(true))
        .addStringOption(o => o.setName('symbol').setDescription('Currency symbol / emoji (e.g. 🪙, 💎)').setRequired(true)))
      .addSubcommand(s => s.setName('starting').setDescription('Set how many coins new users start with')
        .addIntegerOption(o => o.setName('amount').setDescription('Starting balance').setRequired(true).setMinValue(0)))
      .addSubcommand(s => s.setName('daily').setDescription('Set the daily reward range')
        .addIntegerOption(o => o.setName('min').setDescription('Minimum daily reward').setRequired(true).setMinValue(1))
        .addIntegerOption(o => o.setName('max').setDescription('Maximum daily reward').setRequired(true).setMinValue(1)))
      .addSubcommand(s => s.setName('work').setDescription('Set the work reward range')
        .addIntegerOption(o => o.setName('min').setDescription('Minimum work reward').setRequired(true).setMinValue(1))
        .addIntegerOption(o => o.setName('max').setDescription('Maximum work reward').setRequired(true).setMinValue(1)))
      .addSubcommand(s => s.setName('view').setDescription('View current economy settings'))) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;

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
            `**Economy Config**\n**Currency:** ${cfg.currency_symbol} ${cfg.currency_name}\n**Starting Balance:** ${cfg.currency_symbol} ${cfg.starting_balance}\n**Daily Reward:** ${cfg.currency_symbol} ${cfg.daily_min}–${cfg.daily_max}\n**Work Reward:** ${cfg.currency_symbol} ${cfg.work_min}–${cfg.work_max}`
          ));
        await interaction.reply({ flags: IS_CV2 | MessageFlags.Ephemeral, components: [container] });
      }
      return;
    }

    // ── Gamble ─────────────────────────────────────────────────────────────────
    if (group === 'gamble') {
      const bet = interaction.options.getInteger('bet', true);
      const [eco, cfg] = await Promise.all([getOrCreateEconomy(guildId, userId), getEconomyConfig(guildId)]);
      if (eco.balance < bet) {
        await interaction.reply({ ...cv2Text(`❌ Not enough ${cfg.currency_name}. Your balance: **${cfg.currency_symbol} ${eco.balance.toLocaleString()}**.`), flags: IS_CV2 | MessageFlags.Ephemeral });
        return;
      }
      const sym = cfg.currency_symbol;

      if (sub === 'flip') {
        const win = Math.random() < 0.5;
        const { newBalance } = await adjustBalance(guildId, userId, win ? bet : -bet);
        const container = new ContainerBuilder()
          .setAccentColor(win ? Colors.Green : Colors.Red)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**${win ? '🪙 Heads!' : '🌑 Tails!'}**\n${win ? `You won **${sym} ${bet.toLocaleString()}**!` : `You lost **${sym} ${bet.toLocaleString()}**.`}\n**Balance:** ${sym} **${newBalance.toLocaleString()}**`
          ));
        await interaction.reply({ flags: IS_CV2, components: [container] });
      } else if (sub === 'roll') {
        const playerRoll = Math.floor(Math.random() * 100) + 1;
        const botRoll = Math.floor(Math.random() * 100) + 1;
        const win = playerRoll > botRoll, tie = playerRoll === botRoll;
        const { newBalance } = await adjustBalance(guildId, userId, win ? bet : tie ? 0 : -bet);
        const result = tie ? `It's a tie! Your bet of **${sym} ${bet.toLocaleString()}** is refunded.` : win ? `You won **${sym} ${bet.toLocaleString()}**!` : `You lost **${sym} ${bet.toLocaleString()}**.`;
        const container = new ContainerBuilder()
          .setAccentColor(win ? Colors.Green : tie ? Colors.Yellow : Colors.Red)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**🎲 Roll**\n**Your Roll:** ${playerRoll} | **Bot Roll:** ${botRoll}\n${result}\n**Balance:** ${sym} **${newBalance.toLocaleString()}**`
          ));
        await interaction.reply({ flags: IS_CV2, components: [container] });
      } else if (sub === 'slots') {
        const reels = [spinReel(), spinReel(), spinReel()];
        const isJackpot = reels[0] === reels[1] && reels[1] === reels[2];
        const multiplier = isJackpot ? (SLOT_MULTIPLIERS[reels[0]] ?? 1) : 0;
        const winnings = Math.floor(bet * multiplier);
        const delta = winnings > 0 ? winnings - bet : -bet;
        const { newBalance } = await adjustBalance(guildId, userId, delta);
        const label = isJackpot ? `**JACKPOT!** Triple ${reels[0]}` : 'No match — better luck next time!';
        const container = new ContainerBuilder()
          .setAccentColor(multiplier > 0 ? Colors.Gold : Colors.Red)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**🎰 Slots**\n${reels.join(' ｜ ')}\n${label}\n${multiplier > 0 ? `**${multiplier}x** — you won **${sym} ${winnings.toLocaleString()}**!` : `You lost **${sym} ${bet.toLocaleString()}**.`}\n**Balance:** ${sym} **${newBalance.toLocaleString()}**\n*🍒×3=1.5x | 🍋×3=2x | 🔔×3=3x | 💎×3=5x | 7️⃣×3=10x*`
          ));
        await interaction.reply({ flags: IS_CV2, components: [container] });
      }
      return;
    }

    // ── Balance ────────────────────────────────────────────────────────────────
    if (sub === 'balance') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const [eco, cfg] = await Promise.all([getOrCreateEconomy(guildId, target.id), getEconomyConfig(guildId)]);
      const container = new ContainerBuilder()
        .setAccentColor(Colors.Gold)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `**${cfg.currency_symbol} Balance — ${target.username}**\n**Balance:** ${cfg.currency_symbol} **${eco.balance.toLocaleString()}** ${cfg.currency_name}\n**Total Earned:** ${cfg.currency_symbol} **${eco.total_earned.toLocaleString()}** ${cfg.currency_name}`
        ));
      await interaction.reply({ flags: IS_CV2, components: [container] });
      return;
    }

    if (sub === 'leaderboard') {
      await interaction.deferReply();
      const limit = interaction.options.getInteger('limit') ?? 10;
      const [rows, cfg] = await Promise.all([getEconomyLeaderboard(guildId, limit), getEconomyConfig(guildId)]);
      if (!rows.length) { await interaction.editReply(cv2Text('No economy data yet. Start earning with `/economy daily` and `/economy work`!')); return; }
      const medals = ['🥇', '🥈', '🥉'];
      const lines = rows.map((row, i) => `${medals[i] ?? `**${i + 1}.**`} <@${row.user_id}> — ${cfg.currency_symbol} **${row.balance.toLocaleString()}**`);
      const container = new ContainerBuilder()
        .setAccentColor(Colors.Gold)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${cfg.currency_symbol} Richest Users**\n\n${lines.join('\n')}`));
      await interaction.editReply({ flags: IS_CV2, components: [container] });
      return;
    }

    if (sub === 'daily') {
      const cfg = await getEconomyConfig(guildId);
      const lastUsed = await getEconomyCooldown(guildId, userId, 'daily');
      const elapsed = Date.now() - lastUsed;
      if (elapsed < DAILY_COOLDOWN_MS) {
        const remaining = DAILY_COOLDOWN_MS - elapsed;
        const hours = Math.floor(remaining / 3_600_000);
        const minutes = Math.floor((remaining % 3_600_000) / 60_000);
        await interaction.reply({ ...cv2Text(`You already claimed your daily reward. Come back in **${hours}h ${minutes}m**.`), flags: IS_CV2 | MessageFlags.Ephemeral });
        return;
      }
      const amount = Math.floor(Math.random() * (cfg.daily_max - cfg.daily_min + 1)) + cfg.daily_min;
      const { newBalance } = await adjustBalance(guildId, userId, amount);
      await setEconomyCooldown(guildId, userId, 'daily');
      const container = new ContainerBuilder()
        .setAccentColor(Colors.Green)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `**${cfg.currency_symbol} Daily Reward**\nYou claimed **${cfg.currency_symbol} ${amount.toLocaleString()} ${cfg.currency_name}**!\nNew balance: **${newBalance.toLocaleString()}**\n*Come back in 20 hours for your next reward.*`
        ));
      await interaction.reply({ flags: IS_CV2, components: [container] });
      return;
    }

    if (sub === 'work') {
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
          if (channel?.isTextBased()) await (channel as any).send(`⏰ <@${userId}> Your work cooldown is up! Run \`/economy work\` to earn more ${cfg.currency_symbol} ${cfg.currency_name}.`);
        } catch {}
      }, WORK_COOLDOWN_MS);
      pendingWorkNotifications.set(userId, timer);
      return;
    }

    if (sub === 'pay') {
      const sender = interaction.user;
      const target = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      if (target.id === sender.id) { await interaction.reply({ ...cv2Text('❌ You cannot pay yourself.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return; }
      if (target.bot) { await interaction.reply({ ...cv2Text('❌ You cannot pay bots.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return; }
      const cfg = await getEconomyConfig(guildId);
      const senderEco = await getOrCreateEconomy(guildId, sender.id);
      if (senderEco.balance < amount) {
        await interaction.reply({ ...cv2Text(`❌ Insufficient balance. You have **${cfg.currency_symbol} ${senderEco.balance.toLocaleString()}**.`), flags: IS_CV2 | MessageFlags.Ephemeral }); return;
      }
      await adjustBalance(guildId, sender.id, -amount);
      await adjustBalance(guildId, target.id, amount);
      const container = new ContainerBuilder()
        .setAccentColor(Colors.Green)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `**${cfg.currency_symbol} Payment Sent**\n<@${sender.id}> sent **${cfg.currency_symbol} ${amount.toLocaleString()} ${cfg.currency_name}** to <@${target.id}>.`
        ));
      await interaction.reply({ flags: IS_CV2, components: [container] });
    }
  },
};

export default Economy;
