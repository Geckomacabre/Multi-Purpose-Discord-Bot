import {
  ActionRowBuilder, ApplicationIntegrationType, ButtonBuilder, ButtonStyle,
  ChannelType, ContainerBuilder, ChatInputCommandInteraction, Colors,
  EmbedBuilder, InteractionContextType, MessageFlags, PermissionFlagsBits,
  SlashCommandBuilder, TextChannel, TextDisplayBuilder,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';
import { cv2Text } from '../../utils/components.js';
import { archiveTicket } from '../../utils/tickets.js';

const IS_CV2 = MessageFlags.IsComponentsV2;

const Ticket: Command = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage support tickets')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(sub => sub.setName('create').setDescription('Open a new support ticket')
      .addStringOption(o => o.setName('topic').setDescription('Brief description of your issue')))
    .addSubcommand(sub => sub.setName('close').setDescription('Close this ticket'))
    .addSubcommand(sub => sub.setName('reopen').setDescription('Reopen a closed ticket'))
    .addSubcommand(sub => sub.setName('delete').setDescription('Permanently delete this ticket channel'))
    .addSubcommand(sub => sub.setName('add').setDescription('Add a user to this ticket')
      .addUserOption(o => o.setName('user').setDescription('User to add').setRequired(true)))
    .addSubcommand(sub => sub.setName('remove').setDescription('Remove a user from this ticket')
      .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true)))
    .addSubcommand(sub => sub.setName('panel').setDescription('Post a ticket panel with an Open Ticket button')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to post the panel in').setRequired(true))
      .addStringOption(o => o.setName('title').setDescription('Panel title').setRequired(false))
      .addStringOption(o => o.setName('description').setDescription('Panel description').setRequired(false)))
    .addSubcommandGroup(g => g.setName('config').setDescription('Configure the ticket system')
      .addSubcommand(sub => sub.setName('set').setDescription('Set ticket system settings')
        .addChannelOption(o => o.setName('category').setDescription('Category for ticket channels').addChannelTypes(ChannelType.GuildCategory))
        .addChannelOption(o => o.setName('log').setDescription('Channel to log closed tickets'))
        .addRoleOption(o => o.setName('support').setDescription('Support role added to all tickets')))
      .addSubcommand(sub => sub.setName('view').setDescription('View current ticket settings'))) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (group === 'config') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ ...cv2Text('❌ You need **Manage Server** to configure tickets.'), flags: IS_CV2 | MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (sub === 'set') {
        const category = interaction.options.getChannel('category');
        const log = interaction.options.getChannel('log');
        const support = interaction.options.getRole('support');
        await db.setTicketConfig(interaction.guildId!, { category_id: category?.id, log_channel_id: log?.id, support_role_id: support?.id });
        await interaction.editReply(cv2Text('✅ Ticket settings updated.'));
      } else {
        const cfg = await db.getTicketConfig(interaction.guildId!);
        if (!cfg) { await interaction.editReply(cv2Text('Ticket system not configured yet.')); return; }
        const container = new ContainerBuilder()
          .setAccentColor(Colors.Blue)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Ticket Config**\n**Category:** ${cfg.category_id ? `<#${cfg.category_id}>` : 'Not set'}\n**Log Channel:** ${cfg.log_channel_id ? `<#${cfg.log_channel_id}>` : 'Not set'}\n**Support Role:** ${cfg.support_role_id ? `<@&${cfg.support_role_id}>` : 'Not set'}\n**Next Ticket #:** ${cfg.next_ticket_num}`
          ));
        await interaction.editReply({ flags: IS_CV2, components: [container] });
      }
      return;
    }

    if (sub === 'panel') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: '❌ You need **Manage Server** to post a ticket panel.', flags: MessageFlags.Ephemeral });
        return;
      }
      const channel = interaction.options.getChannel('channel', true) as TextChannel;
      const title = interaction.options.getString('title') ?? '🎫 Support Tickets';
      const description = interaction.options.getString('description') ?? 'Click the button below to open a support ticket. Our team will be with you shortly.';
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(Colors.Blurple);
      const button = new ButtonBuilder()
        .setCustomId('ticket:open')
        .setLabel('Open a Ticket')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎫');
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
      try {
        await channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: `✅ Ticket panel posted in <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
      } catch {
        await interaction.reply({ content: '❌ Could not post in that channel. Check my permissions.', flags: MessageFlags.Ephemeral });
      }
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'create') {
      const topic = interaction.options.getString('topic') ?? 'No topic specified';
      const cfg = await db.getTicketConfig(interaction.guildId!);
      const permOverwrites: any[] = [
        { id: interaction.guildId!, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: interaction.guild!.members.me!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
      ];
      if (cfg?.support_role_id) permOverwrites.push({ id: cfg.support_role_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
      await db.ensureConfig(interaction.guildId!);
      await db.db`INSERT OR IGNORE INTO ticket_config (guild_id) VALUES (${interaction.guildId!})`;
      const cfgNow = await db.getTicketConfig(interaction.guildId!);
      const ticketNum = cfgNow?.next_ticket_num ?? 1;
      const channelOptions: any = { name: `ticket-${ticketNum}`, permissionOverwrites: permOverwrites, topic: `Ticket by ${interaction.user.tag} — ${topic}` };
      if (cfg?.category_id) channelOptions.parent = cfg.category_id;
      const channel = await interaction.guild!.channels.create(channelOptions) as TextChannel;
      const ticket = await db.createTicket(interaction.guildId!, channel.id, interaction.user.id, topic);
      const container = new ContainerBuilder()
        .setAccentColor(Colors.Green)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `**Ticket #${ticket.ticket_num}**\nWelcome <@${interaction.user.id}>! Support will be with you shortly.\n**Topic:** ${topic}`
        ));
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`ticket:close:${channel.id}`).setLabel('Close Ticket').setStyle(ButtonStyle.Danger)
      );
      await channel.send({ content: `<@${interaction.user.id}>${cfg?.support_role_id ? ` <@&${cfg.support_role_id}>` : ''}`, flags: IS_CV2, components: [container, row] });
      await interaction.editReply(cv2Text(`✅ Your ticket has been created: <#${channel.id}>`));

    } else if (sub === 'close') {
      const ticket = await db.getTicketByChannel(interaction.channelId);
      if (!ticket) { await interaction.editReply(cv2Text('This channel is not an open ticket.')); return; }
      await db.closeTicket(interaction.channelId);
      await interaction.editReply(cv2Text('✅ Ticket closed. Generating transcript...'));
      const cfg = await db.getTicketConfig(ticket.guild_id);
      await archiveTicket(interaction.channel as TextChannel, ticket, cfg, interaction.client);

    } else if (sub === 'reopen') {
      const ticket = await db.getTicketByChannelAny(interaction.channelId);
      if (!ticket || ticket.status !== 'closed') { await interaction.editReply(cv2Text('This channel is not a closed ticket.')); return; }
      await db.reopenTicket(interaction.channelId);
      await (interaction.channel as TextChannel).permissionOverwrites.create(ticket.user_id, { ViewChannel: true, SendMessages: true }).catch(() => {});
      await (interaction.channel as TextChannel).setName(`ticket-${ticket.ticket_num}`).catch(() => {});
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`ticket:close:${interaction.channelId}`).setLabel('Close Ticket').setStyle(ButtonStyle.Danger)
      );
      await interaction.channel?.send({ content: `🔓 Ticket reopened by <@${interaction.user.id}>. <@${ticket.user_id}>`, components: [row] }).catch(() => {});
      await interaction.editReply(cv2Text('✅ Ticket reopened.'));

    } else if (sub === 'delete') {
      const ticket = await db.getTicketByChannelAny(interaction.channelId);
      if (!ticket) { await interaction.editReply(cv2Text('No ticket record found for this channel.')); return; }
      await interaction.editReply(cv2Text('🗑️ Deleting channel in 3 seconds...'));
      setTimeout(() => interaction.channel?.delete().catch(() => {}), 3000);

    } else if (sub === 'add') {
      const user = interaction.options.getUser('user', true);
      await interaction.channel?.permissionOverwrites.create(user.id, { ViewChannel: true, SendMessages: true }).catch(() => {});
      await interaction.editReply(cv2Text(`✅ Added <@${user.id}> to this ticket.`));

    } else if (sub === 'remove') {
      const user = interaction.options.getUser('user', true);
      await interaction.channel?.permissionOverwrites.delete(user.id).catch(() => {});
      await interaction.editReply(cv2Text(`✅ Removed <@${user.id}> from this ticket.`));
    }
  },
};

export default Ticket;
