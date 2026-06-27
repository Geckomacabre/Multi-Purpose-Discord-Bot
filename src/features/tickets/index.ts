import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonInteraction,
  ButtonStyle, ContainerBuilder, MessageFlags, ModalBuilder,
  ModalSubmitInteraction, PermissionFlagsBits, TextChannel,
  TextDisplayBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { EventModule } from '../feature';
import { cv2Text } from '../../utils/components.js';
import { archiveTicket, buildModPanel, fetchAllMessages } from '../../utils/tickets.js';

const IS_CV2 = MessageFlags.IsComponentsV2;

async function createTicketChannel(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  topic: string,
  db: any,
): Promise<TextChannel> {
  const guildId = interaction.guildId!;
  const cfg = await db.getTicketConfig(guildId);

  const permOverwrites: any[] = [
    { id: guildId, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
    { id: interaction.guild!.members.me!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
  ];
  if (cfg?.support_role_id) permOverwrites.push({ id: cfg.support_role_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });

  await db.ensureConfig(guildId);
  await db.db`INSERT OR IGNORE INTO ticket_config (guild_id) VALUES (${guildId})`;
  const cfgNow = await db.getTicketConfig(guildId);
  const ticketNum = cfgNow?.next_ticket_num ?? 1;

  const opts: any = { name: `ticket-${ticketNum}`, permissionOverwrites: permOverwrites, topic: `Ticket by ${interaction.user.tag} — ${topic}` };
  if (cfg?.category_id) opts.parent = cfg.category_id;

  const channel = await interaction.guild!.channels.create(opts) as TextChannel;
  const ticket = await db.createTicket(guildId, channel.id, interaction.user.id, topic);

  const container = new ContainerBuilder()
    .setAccentColor(0x5865F2)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `**Ticket #${ticket.ticket_num}**\nWelcome <@${interaction.user.id}>! Support will be with you shortly.\n**Topic:** ${topic}`
    ));

  await channel.send({
    content: `<@${interaction.user.id}>${cfg?.support_role_id ? ` <@&${cfg.support_role_id}>` : ''}`,
    flags: IS_CV2,
    components: [container],
  });

  const modRows = buildModPanel(channel.id);
  await channel.send({ content: '**Staff Controls**', components: modRows });

  return channel;
}

const ticketsModule: EventModule = {
  name: 'tickets',
  handlers: {
    interactionCreate: async ({ data: [interaction], db, bot }) => {

      // ── Button interactions ──────────────────────────────────────────────
      if ((interaction as any).isButton()) {
        const btn = interaction as ButtonInteraction;

        // Panel button → show modal
        if (btn.customId === 'ticket:open') {
          const modal = new ModalBuilder()
            .setCustomId('ticket:modal')
            .setTitle('Open a Support Ticket')
            .addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId('topic')
                  .setLabel('What do you need help with?')
                  .setStyle(TextInputStyle.Paragraph)
                  .setPlaceholder('Briefly describe your issue...')
                  .setMaxLength(200)
                  .setRequired(true)
              )
            );
          await btn.showModal(modal);
          return;
        }

        // Claim ticket
        if (btn.customId.startsWith('ticket:claim:')) {
          const channelId = btn.customId.split(':')[2];
          if (btn.channelId !== channelId) return;
          await btn.deferReply({ flags: MessageFlags.Ephemeral });
          const ticket = await db.getTicketByChannel(channelId);
          if (!ticket) { await btn.editReply('This is not an open ticket.'); return; }
          if (ticket.claimed_by) { await btn.editReply(`This ticket is already claimed by <@${ticket.claimed_by}>.`); return; }
          await db.claimTicket(channelId, btn.user.id);
          // Remove support role access, add only this mod
          if (ticket.guild_id) {
            const cfg = await db.getTicketConfig(ticket.guild_id);
            if (cfg?.support_role_id) {
              await (btn.channel as TextChannel).permissionOverwrites.delete(cfg.support_role_id).catch(() => {});
            }
          }
          await (btn.channel as TextChannel).permissionOverwrites.create(btn.user.id, { ViewChannel: true, SendMessages: true }).catch(() => {});
          await (btn.channel as TextChannel).setTopic(`Ticket by <@${ticket.user_id}> — Claimed by ${btn.user.username}`).catch(() => {});
          await btn.channel?.send(`🙋 Ticket claimed by <@${btn.user.id}>.`).catch(() => {});
          await btn.editReply('✅ You have claimed this ticket.');
          return;
        }

        // Unclaim ticket
        if (btn.customId.startsWith('ticket:unclaim:')) {
          const channelId = btn.customId.split(':')[2];
          if (btn.channelId !== channelId) return;
          await btn.deferReply({ flags: MessageFlags.Ephemeral });
          const ticket = await db.getTicketByChannelAny(channelId);
          if (!ticket) { await btn.editReply('No ticket found.'); return; }
          await db.unclaimTicket(channelId);
          const cfg = await db.getTicketConfig(ticket.guild_id);
          if (cfg?.support_role_id) {
            await (btn.channel as TextChannel).permissionOverwrites.create(cfg.support_role_id, { ViewChannel: true, SendMessages: true }).catch(() => {});
          }
          await (btn.channel as TextChannel).setTopic(`Ticket by <@${ticket.user_id}> — ${ticket.topic ?? ''}`).catch(() => {});
          await btn.channel?.send(`🔓 Ticket unclaimed by <@${btn.user.id}>.`).catch(() => {});
          await btn.editReply('✅ Ticket unclaimed.');
          return;
        }

        // Save transcript (without closing)
        if (btn.customId.startsWith('ticket:save:')) {
          const channelId = btn.customId.split(':')[2];
          if (btn.channelId !== channelId) return;
          await btn.deferReply({ flags: MessageFlags.Ephemeral });
          const ticket = await db.getTicketByChannelAny(channelId);
          if (!ticket) { await btn.editReply('No ticket record found.'); return; }
          const cfg = await db.getTicketConfig(ticket.guild_id);
          if (!cfg?.log_channel_id) { await btn.editReply('No log channel configured. Use `/ticket config set log:#channel` first.'); return; }

          const { buildTranscriptFile } = await import('../../utils/tickets.js');
          const messages = await fetchAllMessages(btn.channel as TextChannel);
          const file = await buildTranscriptFile(ticket, messages);
          try {
            const logCh = await bot.channels.fetch(cfg.log_channel_id) as TextChannel;
            await logCh.send({
              content: `💾 **Ticket #${ticket.ticket_num}** transcript saved by <@${btn.user.id}>`,
              files: [file],
            });
            await btn.editReply('✅ Transcript saved to the log channel.');
          } catch {
            await btn.editReply('❌ Could not post to log channel.');
          }
          return;
        }

        // Close ticket
        if (btn.customId.startsWith('ticket:close:')) {
          const channelId = btn.customId.split(':')[2];
          if (btn.channelId !== channelId) return;
          await btn.deferReply({ flags: MessageFlags.Ephemeral });
          const ticket = await db.getTicketByChannel(channelId);
          if (!ticket) { await btn.editReply('This channel is not an open ticket.'); return; }
          await db.closeTicket(channelId);
          await btn.editReply('✅ Ticket closed. Generating transcript...');
          const cfg = await db.getTicketConfig(ticket.guild_id);
          await archiveTicket(btn.channel as TextChannel, ticket, cfg, bot);
          return;
        }

        // Reopen ticket
        if (btn.customId.startsWith('ticket:reopen:')) {
          const channelId = btn.customId.split(':')[2];
          if (btn.channelId !== channelId) return;
          await btn.deferReply({ flags: MessageFlags.Ephemeral });
          const ticket = await db.getTicketByChannelAny(channelId);
          if (!ticket || ticket.status !== 'closed') { await btn.editReply('This ticket is not closed.'); return; }
          await db.reopenTicket(channelId);
          await (btn.channel as TextChannel).permissionOverwrites.create(ticket.user_id, { ViewChannel: true, SendMessages: true }).catch(() => {});
          await (btn.channel as TextChannel).setName(`ticket-${ticket.ticket_num}`).catch(() => {});
          const modRows = buildModPanel(channelId);
          await btn.channel?.send({ content: `🔓 Ticket reopened by <@${btn.user.id}>. <@${ticket.user_id}>`, components: modRows }).catch(() => {});
          await btn.editReply('✅ Ticket reopened.');
          return;
        }

        // Delete ticket
        if (btn.customId.startsWith('ticket:delete:')) {
          const channelId = btn.customId.split(':')[2];
          if (btn.channelId !== channelId) return;
          await btn.deferReply({ flags: MessageFlags.Ephemeral });
          const ticket = await db.getTicketByChannelAny(channelId);
          if (!ticket) { await btn.editReply('No ticket record found.'); return; }
          await btn.editReply('🗑️ Deleting channel in 3 seconds...');
          setTimeout(() => btn.channel?.delete().catch(() => {}), 3000);
          return;
        }

        // Rating buttons (come from DMs — no channelId check)
        if (btn.customId.startsWith('ticket:rate:')) {
          const parts = btn.customId.split(':');
          const rating = parseInt(parts[2]);
          const channelId = parts[3];
          if (isNaN(rating) || rating < 1 || rating > 5) return;
          await btn.deferUpdate();
          await db.rateTicket(channelId, rating);
          const stars = '⭐'.repeat(rating);
          await btn.editReply({ content: `${stars} Thanks for your feedback! Your rating of **${rating}/5** has been recorded.`, components: [] });
          return;
        }
      }

      // ── Modal submit: create ticket ──────────────────────────────────────
      if ((interaction as any).isModalSubmit()) {
        const modal = interaction as ModalSubmitInteraction;
        if (modal.customId !== 'ticket:modal') return;
        await modal.deferReply({ flags: MessageFlags.Ephemeral });
        const topic = modal.fields.getTextInputValue('topic') || 'No topic specified';
        try {
          const channel = await createTicketChannel(modal as any, topic, db);
          await modal.editReply(cv2Text(`✅ Your ticket has been created: <#${channel.id}>`));
        } catch {
          await modal.editReply(cv2Text('❌ Could not create ticket. Make sure the bot has permission to create channels.'));
        }
      }
    },
  },
};

export default ticketsModule;
