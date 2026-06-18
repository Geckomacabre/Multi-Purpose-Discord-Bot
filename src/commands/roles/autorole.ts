import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder,
  MessageFlags,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const Autorole: Command = {
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Manage roles automatically assigned to new members')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add an autorole')
      .addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true))
      .addIntegerOption(o => o.setName('delay').setDescription('Seconds to wait before assigning (0 = instant)').setMinValue(0))
    )
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove an autorole by ID')
      .addIntegerOption(o => o.setName('id').setDescription('Autorole ID from /autorole list').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List all autoroles')
    ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'add') {
      const role = interaction.options.getRole('role', true);
      const delay = interaction.options.getInteger('delay') ?? 0;
      const ar = await db.addAutorole(interaction.guildId!, role.id, delay);
      await interaction.editReply(`✅ <@&${role.id}> will be assigned to new members${delay ? ` after ${delay}s` : ' instantly'}. (ID: ${ar.id})`);

    } else if (sub === 'remove') {
      const id = interaction.options.getInteger('id', true);
      const ok = await db.removeAutorole(id, interaction.guildId!);
      await interaction.editReply(ok ? `✅ Autorole #${id} removed.` : `❌ Autorole #${id} not found.`);

    } else {
      const roles = await db.getAutoroles(interaction.guildId!);
      if (!roles.length) { await interaction.editReply('No autoroles configured.'); return; }
      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Autoroles')
        .setDescription(roles.map(r => `**#${r.id}** <@&${r.role_id}>${r.wait_seconds ? ` — ${r.wait_seconds}s delay` : ''}`).join('\n'));
      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default Autorole;
