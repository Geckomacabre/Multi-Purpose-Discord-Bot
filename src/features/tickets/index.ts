import {
  ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle,
  EmbedBuilder, MessageFlags, ModalBuilder, ModalSubmitInteraction,
  PermissionFlagsBits, TextChannel, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { EventModule } from '../feature';
import { cv2Text } from '../../utils/components.js';
import {
  APPLICATION_QUESTIONS, APPLICATION_TOPIC, archiveTicket, buildApplicationModal, buildModPanel, buildTranscriptFile,
  canCloseTicket, fetchAllMessages, isTicketStaff, ticketCategoryId, ticketChannelName, ticketKind, ticketRoleId,
  type TicketKind,
} from '../../utils/tickets.js';

type TicketDb = typeof import('../../utils/db');

/**
 * Create the private channel for a support ticket or a staff application.
 * `answers` (application only) are the form's question/answer pairs, posted as embed fields.
 */
async function createTicketChannel(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  kind: TicketKind,
  topic: string,
  db: TicketDb,
  answers: { name: string; value: string }[] = [],
): Promise<TextChannel> {
  const guildId = interaction.guildId!;
  const cfg = await db.getTicketConfig(guildId);
  const roleId = ticketRoleId(cfg, kind);
  const categoryId = ticketCategoryId(cfg, kind);

  const permOverwrites: any[] = [
    { id: guildId, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
    { id: interaction.guild!.members.me!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
  ];
  if (roleId) permOverwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });

  await db.ensureConfig(guildId);
  await db.db`INSERT OR IGNORE INTO ticket_config (guild_id) VALUES (${guildId})`;
  const cfgNow = await db.getTicketConfig(guildId);
  const ticketNum = cfgNow?.next_ticket_num ?? 1;

  const opts: any = {
    name: ticketChannelName(kind, ticketNum),
    permissionOverwrites: permOverwrites,
    topic: kind === 'application' ? `Staff application by ${interaction.user.tag}` : `Ticket by ${interaction.user.tag} — ${topic}`,
  };
  if (categoryId) opts.parent = categoryId;

  const channel = await interaction.guild!.channels.create(opts) as TextChannel;
  await db.createTicket(guildId, channel.id, interaction.user.id, topic, kind);

  // Ping mention
  await channel.send(`${roleId ? `<@&${roleId}> ` : ''}<@${interaction.user.id}>`);

  // Welcome embed
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
    .setFooter({ text: interaction.guild!.name, iconURL: interaction.guild!.iconURL() ?? undefined })
    .setTimestamp();

  if (kind === 'application') {
    embed
      .setTitle('📋 Staff Application')
      .setDescription(
        `Thanks for applying, **${interaction.user.username}**! Your answers are below.\n` +
        `The team will read your application and reply here. Feel free to add anything you forgot.\n\n` +
        `Please don't ping staff about your application; you'll hear back in this channel either way.`
      )
      .addFields(answers.map(a => ({ name: a.name.slice(0, 256), value: `\`\`\`${a.value.slice(0, 1000) || '-'}\`\`\`` })));
  } else {
    embed
      .setTitle('New Ticket!')
      .setDescription(
        `Hello **${interaction.user.username}**, this is your ticket!\n` +
        `Please provide details about your problem below. Support will be with you shortly.\n\n` +
        `You may ping a support member once after 30 minutes of no response; avoid mass-pinging.\n\n` +
        `Staff can manage this ticket using the **Staff Panel** button.`
      )
      .addFields({ name: 'Ticket Subject', value: `\`\`\`${topic}\`\`\`` });
  }

  // Staff panel buttons
  const modRows = buildModPanel(channel.id);
  await channel.send({ embeds: [embed], components: modRows });

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

        // Panel button → staff application form
        if (btn.customId === 'ticket:apply') {
          const existing = await db.getOpenTicketByUser(btn.guildId!, btn.user.id, 'application');
          if (existing) {
            await btn.reply({ content: `You already have an open application: <#${existing.channel_id}>. Add anything new there.`, flags: MessageFlags.Ephemeral });
            return;
          }
          await btn.showModal(buildApplicationModal());
          return;
        }

        // Claim ticket
        if (btn.customId.startsWith('ticket:claim:')) {
          const channelId = btn.customId.split(':')[2];
          if (btn.channelId !== channelId) return;
          await btn.deferReply({ flags: MessageFlags.Ephemeral });
          const ticket = await db.getTicketByChannel(channelId);
          if (!ticket) { await btn.editReply('This is not an open ticket.'); return; }
          const cfg = await db.getTicketConfig(ticket.guild_id);
          const isApplication = ticketKind(ticket) === 'application';
          if (!isTicketStaff(btn, cfg, ticket)) {
            await btn.editReply(isApplication ? '❌ Only the application reviewers can claim applications.' : '❌ Only support staff can claim tickets.');
            return;
          }
          if (ticket.claimed_by) { await btn.editReply(`This ${isApplication ? 'application' : 'ticket'} is already claimed by <@${ticket.claimed_by}>.`); return; }
          await db.claimTicket(channelId, btn.user.id);
          const roleId = ticketRoleId(cfg, ticketKind(ticket));
          if (roleId) {
            await (btn.channel as TextChannel).permissionOverwrites.delete(roleId).catch(() => {});
          }
          await (btn.channel as TextChannel).permissionOverwrites.create(btn.user.id, { ViewChannel: true, SendMessages: true }).catch(() => {});
          const topicText = isApplication
            ? `Staff application by <@${ticket.user_id}> — Reviewed by ${btn.user.username}`
            : `Ticket by <@${ticket.user_id}> — Claimed by ${btn.user.username}`;
          await (btn.channel as TextChannel).setTopic(topicText).catch(() => {});
          await (btn.channel as TextChannel | null)?.send(`🙋 ${isApplication ? 'Application' : 'Ticket'} claimed by <@${btn.user.id}>.`).catch(() => {});
          await btn.editReply(`✅ You have claimed this ${isApplication ? 'application' : 'ticket'}.`);
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
          const messages = await fetchAllMessages(btn.channel as TextChannel);
          const file = buildTranscriptFile(ticket, messages);
          try {
            const logCh = await bot.channels.fetch(cfg.log_channel_id) as TextChannel;
            await logCh.send({ content: `💾 **Ticket #${ticket.ticket_num}** transcript saved by <@${btn.user.id}>`, files: [file] });
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
          const check = canCloseTicket(btn, ticket);
          if (!check.allowed) { await btn.editReply(check.reason); return; }
          await db.closeTicket(channelId);
          await btn.editReply('✅ Ticket closed. Generating transcript and deleting channel...');
          const cfg = await db.getTicketConfig(ticket.guild_id);
          await archiveTicket(btn.channel as TextChannel, ticket, cfg, bot);
          return;
        }

        // Rating buttons — delete channel immediately after rating
        if (btn.customId.startsWith('ticket:rate:')) {
          const parts = btn.customId.split(':');
          const rating = parseInt(parts[2]);
          const channelId = parts[3];
          if (isNaN(rating) || rating < 1 || rating > 5) return;
          if (btn.channelId !== channelId) return;
          await btn.deferUpdate();
          await db.rateTicket(channelId, rating);
          await btn.editReply({ content: `${'⭐'.repeat(rating)} Thanks for your feedback! This channel will be deleted in 5 seconds.`, components: [] });
          setTimeout(() => (btn.channel as TextChannel)?.delete().catch(() => {}), 5000);
          return;
        }
      }

      // ── Modal submit: create ticket ──────────────────────────────────────
      if ((interaction as any).isModalSubmit()) {
        const modal = interaction as ModalSubmitInteraction;

        if (modal.customId === 'ticket:modal') {
          await modal.deferReply({ flags: MessageFlags.Ephemeral });
          const topic = modal.fields.getTextInputValue('topic') || 'No topic specified';
          try {
            const channel = await createTicketChannel(modal, 'support', topic, db);
            await modal.editReply(`✅ Your ticket has been created: <#${channel.id}>`);
          } catch (err) {
            console.error('[tickets] create error:', err);
            await modal.editReply('❌ Could not create ticket. Make sure the bot has permission to create channels.');
          }
          return;
        }

        // Staff application form → private application channel for the reviewers
        if (modal.customId === 'ticket:apply-modal') {
          await modal.deferReply({ flags: MessageFlags.Ephemeral });
          const existing = await db.getOpenTicketByUser(modal.guildId!, modal.user.id, 'application');
          if (existing) {
            await modal.editReply(`You already have an open application: <#${existing.channel_id}>. Add anything new there.`);
            return;
          }
          const answers = APPLICATION_QUESTIONS.map(q => {
            let value = '';
            try { value = modal.fields.getTextInputValue(q.id); } catch {}
            return { name: q.label, value: value.trim() };
          }).filter(a => a.value);
          try {
            const channel = await createTicketChannel(modal, 'application', APPLICATION_TOPIC, db, answers);
            await modal.editReply(`✅ Your application is in: <#${channel.id}>. The team will reply there.`);
          } catch (err) {
            console.error('[tickets] application create error:', err);
            await modal.editReply('❌ Could not create your application channel. Make sure the bot has permission to create channels.');
          }
          return;
        }
      }
    },
  },
};

export default ticketsModule;
