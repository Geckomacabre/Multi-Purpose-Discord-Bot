import {
  ApplicationIntegrationType, ChatInputCommandInteraction, InteractionContextType,
  PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';

const Bulkrole: Command = {
  data: new SlashCommandBuilder()
    .setName('bulkrole')
    .setDescription('Assign or remove a role from many members at once')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addStringOption(o => o.setName('action').setDescription('assign or remove').setRequired(true)
      .addChoices({ name: 'assign', value: 'assign' }, { name: 'remove', value: 'remove' }))
    .addRoleOption(o => o.setName('role').setDescription('Role to assign/remove').setRequired(true))
    .addStringOption(o => o.setName('filter').setDescription('Filter: all, has_role, missing_role, bots, humans').setRequired(true)
      .addChoices(
        { name: 'All members', value: 'all' },
        { name: 'Has specific role', value: 'has_role' },
        { name: 'Missing specific role', value: 'missing_role' },
        { name: 'Bots only', value: 'bots' },
        { name: 'Humans only', value: 'humans' },
      ))
    .addRoleOption(o => o.setName('filter_role').setDescription('Role used for has_role/missing_role filter')) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const action = interaction.options.getString('action', true);
    const role = interaction.options.getRole('role', true);
    const filter = interaction.options.getString('filter', true);
    const filterRole = interaction.options.getRole('filter_role');

    await interaction.deferReply();

    await interaction.editReply(`⏳ Fetching members...`);

    let members = await interaction.guild!.members.fetch();

    switch (filter) {
      case 'has_role':
        if (!filterRole) { await interaction.editReply('❌ Provide a filter_role for has_role filter.'); return; }
        members = members.filter(m => m.roles.cache.has(filterRole.id));
        break;
      case 'missing_role':
        if (!filterRole) { await interaction.editReply('❌ Provide a filter_role for missing_role filter.'); return; }
        members = members.filter(m => !m.roles.cache.has(filterRole.id));
        break;
      case 'bots':
        members = members.filter(m => m.user.bot);
        break;
      case 'humans':
        members = members.filter(m => !m.user.bot);
        break;
    }

    let count = 0;
    const batch = [...members.values()];
    await interaction.editReply(`⏳ Processing **${batch.length}** members...`);

    for (const member of batch) {
      try {
        if (action === 'assign') await member.roles.add(role.id);
        else await member.roles.remove(role.id);
        count++;
      } catch {}
      // Small delay to avoid rate limits
      if (count % 10 === 0) await new Promise(r => setTimeout(r, 1000));
    }

    await interaction.editReply(`✅ ${action === 'assign' ? 'Assigned' : 'Removed'} <@&${role.id}> ${action === 'assign' ? 'to' : 'from'} **${count}** member(s).`);
  },
};

export default Bulkrole;
