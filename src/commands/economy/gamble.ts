import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  EmbedBuilder, InteractionContextType, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getEconomyConfig, getOrCreateEconomy, adjustBalance } from '../../utils/db';

// ─── Slots setup ─────────────────────────────────────────────────────────────

const REEL: string[] = [
  '🍒', '🍒', '🍒', '🍒', '🍒',
  '🍋', '🍋', '🍋', '🍋',
  '🔔', '🔔', '🔔',
  '💎', '💎',
  '7️⃣',
]; // 15-slot pool: cherry 5/15, lemon 4/15, bell 3/15, diamond 2/15, seven 1/15

function spinReel() { return REEL[Math.floor(Math.random() * REEL.length)]; }

const SLOT_MULTIPLIERS: Record<string, number> = {
  '7️⃣': 10,
  '💎': 5,
  '🔔': 3,
  '🍋': 2,
  '🍒': 1.5,
};

function resolveSlots(reels: string[]): { label: string; multiplier: number } {
  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    const m = SLOT_MULTIPLIERS[reels[0]] ?? 1;
    return { label: `**JACKPOT!** Triple ${reels[0]}`, multiplier: m };
  }
  return { label: 'No match — better luck next time!', multiplier: 0 };
}

// ─── Command ──────────────────────────────────────────────────────────────────

const Gamble: Command = {
  data: new SlashCommandBuilder()
    .setName('gamble')
    .setDescription('Gambling minigames')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(sub => sub
      .setName('flip')
      .setDescription('Bet on a coin flip (50/50 — win doubles your bet)')
      .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1))
    )
    .addSubcommand(sub => sub
      .setName('roll')
      .setDescription('Roll 1–100 against the bot — higher roll wins (tie = refund)')
      .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1))
    )
    .addSubcommand(sub => sub
      .setName('slots')
      .setDescription('Spin the slot machine — match 3 to win!')
      .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1))
    ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const bet = interaction.options.getInteger('bet', true);

    const [eco, cfg] = await Promise.all([
      getOrCreateEconomy(guildId, userId),
      getEconomyConfig(guildId),
    ]);

    if (eco.balance < bet) {
      await interaction.reply({
        content: `❌ Not enough ${cfg.currency_name}. Your balance: **${cfg.currency_symbol} ${eco.balance.toLocaleString()}**.`,
        ephemeral: true,
      });
      return;
    }

    const sym = cfg.currency_symbol;

    if (sub === 'flip') {
      const win = Math.random() < 0.5;
      const delta = win ? bet : -bet;
      const { newBalance } = await adjustBalance(guildId, userId, delta);

      const embed = new EmbedBuilder()
        .setColor(win ? Colors.Green : Colors.Red)
        .setTitle(`${win ? '🪙 Heads!' : '🌑 Tails!'}`)
        .addFields(
          { name: 'Result', value: win ? `You won **${sym} ${bet.toLocaleString()}**!` : `You lost **${sym} ${bet.toLocaleString()}**.` },
          { name: 'Balance', value: `${sym} **${newBalance.toLocaleString()}**` },
        );
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'roll') {
      const playerRoll = Math.floor(Math.random() * 100) + 1;
      const botRoll = Math.floor(Math.random() * 100) + 1;
      const win = playerRoll > botRoll;
      const tie = playerRoll === botRoll;
      const delta = win ? bet : tie ? 0 : -bet;
      const { newBalance } = await adjustBalance(guildId, userId, delta);

      let result: string;
      if (tie) result = `It's a tie! Your bet of **${sym} ${bet.toLocaleString()}** is refunded.`;
      else if (win) result = `You won **${sym} ${bet.toLocaleString()}**!`;
      else result = `You lost **${sym} ${bet.toLocaleString()}**.`;

      const embed = new EmbedBuilder()
        .setColor(win ? Colors.Green : tie ? Colors.Yellow : Colors.Red)
        .setTitle('🎲 Roll')
        .addFields(
          { name: 'Your Roll', value: `**${playerRoll}**`, inline: true },
          { name: 'Bot Roll', value: `**${botRoll}**`, inline: true },
          { name: 'Result', value: result },
          { name: 'Balance', value: `${sym} **${newBalance.toLocaleString()}**` },
        );
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'slots') {
      const reels = [spinReel(), spinReel(), spinReel()];
      const { label, multiplier } = resolveSlots(reels);
      const winnings = Math.floor(bet * multiplier);
      const delta = winnings > 0 ? winnings - bet : -bet;
      const { newBalance } = await adjustBalance(guildId, userId, delta);

      const embed = new EmbedBuilder()
        .setColor(multiplier > 0 ? Colors.Gold : Colors.Red)
        .setTitle('🎰 Slots')
        .addFields(
          { name: 'Reels', value: reels.join(' ｜ ') },
          { name: 'Result', value: label },
          {
            name: 'Payout',
            value: multiplier > 0
              ? `**${multiplier}x** — you won **${sym} ${winnings.toLocaleString()}**!`
              : `You lost **${sym} ${bet.toLocaleString()}**.`,
          },
          { name: 'Balance', value: `${sym} **${newBalance.toLocaleString()}**` },
        )
        .setFooter({ text: 'Payouts: 🍒×3=1.5x | 🍋×3=2x | 🔔×3=3x | 💎×3=5x | 7️⃣×3=10x' });
      await interaction.reply({ embeds: [embed] });
      return;
    }
  },
};

export default Gamble;
