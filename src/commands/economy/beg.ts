import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  ContainerBuilder, InteractionContextType, SlashCommandBuilder, TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getEconomyConfig, getEconomyCooldown, setEconomyCooldown, adjustBalance } from '../../utils/db';
import { cv2Err, IS_CV2 } from '../../utils/components.js';

const BEG_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

const RESPONSES = [
  'Someone took pity on you.',
  'A passerby dropped some change.',
  'You found a crumpled bill on the ground.',
  'A kind stranger helped you out.',
  'You performed a sad little dance and earned some coins.',
  'The vending machine gave back your money.',
  'You recycled some cans.',
  'A generous soul blessed you today.',
];

const Beg: Command = {
  data: new SlashCommandBuilder()
    .setName('beg')
    .setDescription('Beg for coins — can be used every 15 minutes')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild]),

  async run(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;

    const cfg = await getEconomyConfig(guildId);
    const lastUsed = await getEconomyCooldown(userId, 'beg');
    const elapsed = Date.now() - lastUsed;

    if (elapsed < BEG_COOLDOWN_MS) {
      const remaining = BEG_COOLDOWN_MS - elapsed;
      const minutes = Math.ceil(remaining / 60_000);
      await interaction.reply(cv2Err(`You can't beg again yet. Come back in **${minutes} minute${minutes !== 1 ? 's' : ''}**.`));
      return;
    }

    const amount = Math.floor(Math.random() * 91) + 10; // 10–100 coins
    const { newBalance } = await adjustBalance(guildId, userId, amount);
    await setEconomyCooldown(userId, 'beg');

    const flavor = RESPONSES[Math.floor(Math.random() * RESPONSES.length)]!;
    const sym = cfg.currency_symbol;

    const container = new ContainerBuilder()
      .setAccentColor(Colors.Blurple)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `🙏 **Beg**\n${flavor}\nYou received **${sym} ${amount.toLocaleString()} ${cfg.currency_name}**.\n**Balance:** ${sym} **${newBalance.toLocaleString()}**\n*Come back in 15 minutes.*`
      ));
    await interaction.reply({ flags: IS_CV2, components: [container] });
  },
};

export default Beg;
