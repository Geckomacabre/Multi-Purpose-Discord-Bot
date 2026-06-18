import {
  ApplicationIntegrationType, ChannelType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder,
  MessageFlags,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const Ticketconfig: Command = {
  data: new SlashCommandBuilder()
    .setName('ticketconfig')
    .setDescription('Configure the ticket system')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(sub => sub
      .setName('set')
      .setDescription('Set ticket system settings')
      .addChannelOption(o => o.setName('category').setDescription('Category for ticket channels').addChannelTypes(ChannelType.GuildCategory))
      .addChannelOption(o => o.setName('log').setDescription('Channel to log closed tickets'))
      .addRoleOption(o => o.setName('support').setDescription('Support role added to all tickets'))
    )
    .addSubcommand(sub => sub
      .setName('view')
      .setDescription('View current ticket settings')
    ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'set') {
      const category = interaction.options.getChannel('category');
      const log = interaction.options.getChannel('log');
      const support = interaction.options.getRole('support');
      await db.setTicketConfig(interaction.guildId!, {
        category_id: category?.id,
        log_channel_id: log?.id,
        support_role_id: support?.id,
      });
      await interaction.editReply('✅ Ticket settings updated.');
    } else {
      const cfg = await db.getTicketConfig(interaction.guildId!);
      if (!cfg) { await interaction.editReply('Ticket system not configured yet.'); return; }
      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Ticket Config')
        .addFields(
          { name: 'Category', value: cfg.category_id ? `<#${cfg.category_id}>` : 'Not set', inline: true },
          { name: 'Log Channel', value: cfg.log_channel_id ? `<#${cfg.log_channel_id}>` : 'Not set', inline: true },
          { name: 'Support Role', value: cfg.support_role_id ? `<@&${cfg.support_role_id}>` : 'Not set', inline: true },
          { name: 'Next Ticket #', value: String(cfg.next_ticket_num), inline: true },
        );
      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default Ticketconfig;
