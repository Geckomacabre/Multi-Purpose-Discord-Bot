import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const Streaming: Command = {
  data: new SlashCommandBuilder()
    .setName('streaming')
    .setDescription('Configure streaming announcements')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(sub => sub
      .setName('set')
      .setDescription('Configure streaming settings')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to post live announcements'))
      .addRoleOption(o => o.setName('role').setDescription('Role to assign while streaming'))
      .addStringOption(o => o.setName('message').setDescription('Announcement message ({username}, {game}, {url})'))
    )
    .addSubcommand(sub => sub
      .setName('view')
      .setDescription('View current streaming settings')
    ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel');
      const role = interaction.options.getRole('role');
      const message = interaction.options.getString('message');
      await db.setStreamingConfig(interaction.guildId!, {
        announce_channel_id: channel?.id,
        give_role_id: role?.id,
        message: message ?? undefined,
      });
      await interaction.editReply('✅ Streaming config updated.');
    } else {
      const cfg = await db.getStreamingConfig(interaction.guildId!);
      if (!cfg) { await interaction.editReply('Streaming not configured yet.'); return; }
      const embed = new EmbedBuilder()
        .setColor(Colors.Purple)
        .setTitle('Streaming Config')
        .addFields(
          { name: 'Announce Channel', value: cfg.announce_channel_id ? `<#${cfg.announce_channel_id}>` : 'Not set', inline: true },
          { name: 'Streaming Role', value: cfg.give_role_id ? `<@&${cfg.give_role_id}>` : 'Not set', inline: true },
          { name: 'Message Template', value: cfg.message },
        );
      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default Streaming;
