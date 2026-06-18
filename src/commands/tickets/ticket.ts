import {
  ActionRowBuilder, ApplicationIntegrationType, ButtonBuilder, ButtonStyle,
  CategoryChannel, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, OverwriteType, PermissionFlagsBits, SlashCommandBuilder, TextChannel,
  MessageFlags,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const Ticket: Command = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage support tickets')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(sub => sub
      .setName('create')
      .setDescription('Open a new support ticket')
      .addStringOption(o => o.setName('topic').setDescription('Brief description of your issue'))
    )
    .addSubcommand(sub => sub
      .setName('close')
      .setDescription('Close this ticket')
    )
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add a user to this ticket')
      .addUserOption(o => o.setName('user').setDescription('User to add').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove a user from this ticket')
      .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true))
    ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'create') {
      const topic = interaction.options.getString('topic') ?? 'No topic specified';
      const cfg = await db.getTicketConfig(interaction.guildId!);

      const permOverwrites: any[] = [
        { id: interaction.guildId!, deny: [PermissionFlagsBits.ViewChannel], type: OverwriteType.Role },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages], type: OverwriteType.Member },
        { id: interaction.guild!.members.me!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels], type: OverwriteType.Member },
      ];

      if (cfg?.support_role_id) {
        permOverwrites.push({ id: cfg.support_role_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages], type: OverwriteType.Role });
      }

      // Figure out ticket number to name the channel
      await db.ensureConfig(interaction.guildId!);
      await db.db`INSERT OR IGNORE INTO ticket_config (guild_id) VALUES (${interaction.guildId!})`;
      const cfgNow = await db.getTicketConfig(interaction.guildId!);
      const ticketNum = cfgNow?.next_ticket_num ?? 1;

      const channelOptions: any = {
        name: `ticket-${ticketNum}`,
        permissionOverwrites: permOverwrites,
        topic: `Ticket by ${interaction.user.tag} — ${topic}`,
      };
      if (cfg?.category_id) channelOptions.parent = cfg.category_id;

      const channel = await interaction.guild!.channels.create(channelOptions) as TextChannel;
      const ticket = await db.createTicket(interaction.guildId!, channel.id, interaction.user.id, topic);

      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle(`Ticket #${ticket.ticket_num}`)
        .setDescription(`Welcome <@${interaction.user.id}>! Support will be with you shortly.\n\n**Topic:** ${topic}`)
        .setTimestamp();

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`ticket:close:${channel.id}`).setLabel('Close Ticket').setStyle(ButtonStyle.Danger)
      );

      await channel.send({ content: `<@${interaction.user.id}>${cfg?.support_role_id ? ` <@&${cfg.support_role_id}>` : ''}`, embeds: [embed], components: [row] });
      await interaction.editReply(`✅ Your ticket has been created: <#${channel.id}>`);

    } else if (sub === 'close') {
      const ticket = await db.getTicketByChannel(interaction.channelId);
      if (!ticket) { await interaction.editReply('This channel is not an open ticket.'); return; }
      await db.closeTicket(interaction.channelId);
      await interaction.editReply('Ticket closed. This channel will be deleted in 5 seconds.');
      setTimeout(() => interaction.channel?.delete().catch(() => {}), 5000);

    } else if (sub === 'add') {
      const user = interaction.options.getUser('user', true);
      await interaction.channel?.permissionOverwrites.create(user.id, { ViewChannel: true, SendMessages: true }).catch(() => {});
      await interaction.editReply(`✅ Added <@${user.id}> to this ticket.`);

    } else if (sub === 'remove') {
      const user = interaction.options.getUser('user', true);
      await interaction.channel?.permissionOverwrites.delete(user.id).catch(() => {});
      await interaction.editReply(`✅ Removed <@${user.id}> from this ticket.`);
    }
  },
};

export default Ticket;
