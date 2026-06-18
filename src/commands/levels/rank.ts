import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  EmbedBuilder, InteractionContextType, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getXp, calcLevelFromXp, xpForLevel } from '../../utils/db';

const Rank: Command = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('View your or another user\'s level and XP')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addUserOption(o => o.setName('user').setDescription('User to check (default: yourself)')) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    const guildId = interaction.guildId!;

    const xpRow = await getXp(guildId, target.id);
    if (!xpRow || xpRow.xp === 0) {
      await interaction.reply({
        content: target.id === interaction.user.id
          ? 'You haven\'t earned any XP yet — start chatting!'
          : `**${target.username}** hasn\'t earned any XP yet.`,
        ephemeral: true,
      });
      return;
    }

    const { level, currentXp, xpNeeded } = calcLevelFromXp(xpRow.xp);
    const progressPct = Math.round((currentXp / xpNeeded) * 100);

    // Simple ASCII progress bar
    const filled = Math.round(progressPct / 5);
    const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);

    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })
      .setTitle(`Level ${level}`)
      .addFields(
        { name: 'XP Progress', value: `\`[${bar}]\` ${currentXp} / ${xpNeeded} XP (${progressPct}%)` },
        { name: 'Total XP', value: `**${xpRow.xp.toLocaleString()}**`, inline: true },
        { name: 'Messages', value: `**${xpRow.total_messages.toLocaleString()}**`, inline: true },
        { name: 'Next Level', value: `Need **${(xpNeeded - currentXp).toLocaleString()}** more XP for level ${level + 1}`, inline: true },
      );

    await interaction.reply({ embeds: [embed] });
  },
};

export default Rank;
