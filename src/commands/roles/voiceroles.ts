import {
  ApplicationIntegrationType, ChannelType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder,
  MessageFlags,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const Voiceroles: Command = {
  data: new SlashCommandBuilder()
    .setName('voiceroles')
    .setDescription('Assign roles when members join specific voice channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add a voice role binding')
      .addChannelOption(o => o.setName('channel').setDescription('Voice channel').setRequired(true).addChannelTypes(ChannelType.GuildVoice))
      .addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove a voice role binding')
      .addIntegerOption(o => o.setName('id').setDescription('Binding ID').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List all voice role bindings')
    ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'add') {
      const channel = interaction.options.getChannel('channel', true);
      const role = interaction.options.getRole('role', true);
      const vr = await db.addVoiceRole(interaction.guildId!, channel.id, role.id);
      await interaction.editReply(`✅ <@&${role.id}> will be assigned when joining <#${channel.id}> (ID: ${vr.id}).`);

    } else if (sub === 'remove') {
      const id = interaction.options.getInteger('id', true);
      const ok = await db.removeVoiceRole(id, interaction.guildId!);
      await interaction.editReply(ok ? `✅ Voice role #${id} removed.` : `❌ Voice role #${id} not found.`);

    } else {
      const vrs = await db.getVoiceRoles(interaction.guildId!);
      if (!vrs.length) { await interaction.editReply('No voice role bindings configured.'); return; }
      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Voice Roles')
        .setDescription(vrs.map(v => `**#${v.id}** <#${v.voice_channel_id}> → <@&${v.role_id}>`).join('\n'));
      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default Voiceroles;
