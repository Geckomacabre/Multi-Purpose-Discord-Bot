import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  InteractionContextType, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getJackpot, getEconomyConfig } from '../../utils/db';
import { cv2Text } from '../../utils/components.js';
import { JACKPOT_LOSS_CUT } from '../../utils/gamble.js';

const Jackpot: Command = {
  data: new SlashCommandBuilder()
    .setName('jackpot')
    .setDescription('See the current progressive jackpot pool')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild]),

  async run(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const [jp, cfg] = await Promise.all([getJackpot(guildId), getEconomyConfig(guildId)]);
    const sym = cfg.currency_symbol;

    const last = jp.last_winner && jp.last_won_at
      ? `\n\n🏆 Last won by <@${jp.last_winner}> — **${sym} ${jp.last_amount.toLocaleString()}** <t:${Math.floor(jp.last_won_at / 1000)}:R>`
      : '\n\n*Nobody has hit it yet.*';

    await interaction.reply(cv2Text(
      `## 🎰 Progressive Jackpot\n\n` +
      `### ${sym} ${jp.amount.toLocaleString()}\n` +
      `Every casino game feeds the pot — **${Math.round(JACKPOT_LOSS_CUT * 100)}%** of every loss goes in, ` +
      `and any bet can hit it. Bigger bets have proportionally better odds.\n` +
      `Win it and the whole pool is yours; it resets to ${sym} ${jp.seed.toLocaleString()} and starts climbing again.` +
      last,
      Colors.Gold,
    ));
  },
};

export default Jackpot;
