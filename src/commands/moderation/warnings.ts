import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const Warnings: Command = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View and manage user warnings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List warnings for a user')
      .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('clear')
      .setDescription('Clear all warnings for a user')
      .addUserOption(o => o.setName('user').setDescription('User to clear').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('delete')
      .setDescription('Delete a specific warning by ID')
      .addIntegerOption(o => o.setName('id').setDescription('Warning ID').setRequired(true))
    ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const sub = interaction.options.getSubcommand();

    if (sub === 'clear') {
      const user = interaction.options.getUser('user', true);
      const count = await db.clearWarnings(interaction.guildId!, user.id);
      await interaction.editReply(`✅ Cleared **${count}** warning(s) for ${user.tag}.`);
      return;
    }

    if (sub === 'delete') {
      const id = interaction.options.getInteger('id', true);
      const deleted = await db.deleteWarning(id, interaction.guildId!);
      await interaction.editReply(deleted ? `✅ Warning #${id} deleted.` : `❌ Warning #${id} not found.`);
      return;
    }

    // list
    const user = interaction.options.getUser('user', true);
    const warnings = await db.getWarnings(interaction.guildId!, user.id);

    if (!warnings.length) {
      await interaction.editReply(`✅ **${user.tag}** has no warnings.`);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Yellow)
      .setTitle(`Warnings for ${user.tag}`)
      .setThumbnail(user.displayAvatarURL())
      .setDescription(
        warnings.slice(0, 25).map(w =>
          `**#${w.id}** — <t:${Math.floor(w.created_at / 1000)}:d> by <@${w.mod_id}>\n${w.reason}`
        ).join('\n\n')
      )
      .setFooter({ text: `Total: ${warnings.length}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

export default Warnings;
