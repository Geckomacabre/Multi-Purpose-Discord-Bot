import {
  ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle,
  EmbedBuilder, Guild, MessageFlags, ModalBuilder, ModalSubmitInteraction,
  PermissionFlagsBits, TextChannel, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { EventModule } from '../feature';
import { cv2Text } from '../../utils/components.js';
import {
  APPLICATION_TOPIC, archiveTicket, buildModPanel, buildTranscriptFile,
  canCloseTicket, fetchAllMessages, isTicketStaff, ticketCategoryId, ticketChannelName, ticketKind, ticketRoleId,
  type TicketKind,
} from '../../utils/tickets.js';
import {
  APPLICATION_ROLE_NAMES, APPLY_CANCEL_ID, APPLY_MODAL_PREFIX, APPLY_PAGE_PREFIX, APPLY_RESTART_ID, FIRST_PAGE,
  buildAnswerEmbeds, buildApplicationPages, buildPageModal, buildPagePrompt, parseApplicationRoles,
  type ApplicationPage, type ApplicationRole,
} from '../../utils/applicationForm.js';
import type { IApplicationDraft, ITicketConfig } from '../../utils/db';

type TicketDb = typeof import('../../utils/db');

/** A saved application draft older than this starts over. */
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Who gets a DM about a new application: the configured notify role, else the reviewers role, else a role named "founder". */
function applicationNotifyRoleId(guild: Guild, cfg: ITicketConfig | null): string | null {
  if (cfg?.notify_role_id) return cfg.notify_role_id;
  if (cfg?.apply_role_id) return cfg.apply_role_id;
  return guild.roles.cache.find(r => r.name.toLowerCase().replace(/[\s_-]/g, '') === 'founder')?.id ?? null;
}

function draftRoles(draft: IApplicationDraft | null): ApplicationRole[] {
  return (draft?.roles ?? []).filter((r): r is ApplicationRole => r in APPLICATION_ROLE_NAMES);
}

type EphemeralPayload = { content?: string; embeds?: EmbedBuilder[]; components?: ActionRowBuilder<ButtonBuilder>[] };

/**
 * Answer a modal ephemerally. A modal opened from one of our own ephemeral prompts edits that
 * prompt in place (`update`); one opened from the public panel gets a fresh ephemeral reply, so
 * the panel itself is never touched.
 */
async function respondEphemeral(modal: ModalSubmitInteraction, payload: EphemeralPayload): Promise<void> {
  if (modal.isFromMessage() && modal.message.flags.has(MessageFlags.Ephemeral)) await modal.update(payload);
  else await modal.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

async function deferEphemeral(modal: ModalSubmitInteraction): Promise<void> {
  if (modal.isFromMessage() && modal.message.flags.has(MessageFlags.Ephemeral)) await modal.deferUpdate();
  else await modal.deferReply({ flags: MessageFlags.Ephemeral });
}

/**
 * After the final page: post every answer in the new application channel (one embed per
 * page), DM the applicant that staff will be in contact, and DM everyone in the notify role.
 * Each step is best-effort; a closed DM must never fail the application.
 */
async function afterApplicationCreated(
  modal: ModalSubmitInteraction,
  channel: TextChannel,
  cfg: ITicketConfig | null,
  pages: ApplicationPage[],
  roles: ApplicationRole[],
  answers: Record<string, string>,
): Promise<{ notified: number; notifyRoleId: string | null }> {
  const guild = modal.guild!;
  const roleText = roles.length ? roles.map(r => APPLICATION_ROLE_NAMES[r]).join(' / ') : 'Not sure, place me';

  // 1. The full application. Embeds share a 6,000-character budget per message, so one per message.
  for (const embed of buildAnswerEmbeds(pages, answers)) {
    await channel.send({ embeds: [embed] }).catch(err => console.error('[tickets] answers post failed:', err));
  }

  // 2. Tell the applicant.
  await modal.user.send({
    embeds: [new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📋 Your staff application to ${guild.name}`)
      .setDescription(
        `Thanks for applying! Your application has been received and the staff team has been notified.\n\n` +
        `Your answers are in <#${channel.id}>. Staff will be in contact with you in that channel.`
      )
      .setFooter({ text: guild.name, iconURL: guild.iconURL() ?? undefined })
      .setTimestamp()],
  }).catch(() => { /* DMs closed; the channel covers it */ });

  // 3. DM the notify role's members (the founders on CTI).
  const notifyRoleId = applicationNotifyRoleId(guild, cfg);
  let notified = 0;
  if (notifyRoleId) {
    await guild.members.fetch().catch(() => null); // role.members only knows cached members
    const role = guild.roles.cache.get(notifyRoleId);
    const summary = new EmbedBuilder()
      .setColor(0x57F287)
      .setAuthor({ name: modal.user.tag, iconURL: modal.user.displayAvatarURL() })
      .setTitle(`📋 New staff application in ${guild.name}`)
      .setDescription(`<@${modal.user.id}> (${modal.user.tag}, ID ${modal.user.id}) applied for **${roleText}**.\n\nFull answers: <#${channel.id}> — https://discord.com/channels/${guild.id}/${channel.id}`)
      .addFields(FIRST_PAGE.questions.slice(1).map(q => ({ name: q.text.slice(0, 256), value: (answers[q.id]?.trim() || '-').slice(0, 1024) })))
      .setTimestamp();
    for (const member of role?.members.values() ?? []) {
      if (member.user.bot) continue;
      const ok = await member.send({ embeds: [summary] }).then(() => true).catch(() => false);
      if (ok) notified++;
    }
  }
  return { notified, notifyRoleId };
}

/**
 * Create the private channel for a support ticket or a staff application.
 * `summary` (application only) is the short who-you-are part, posted as fields on the welcome embed.
 */
async function createTicketChannel(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  kind: TicketKind,
  topic: string,
  db: TicketDb,
  summary: { name: string; value: string }[] = [],
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
        `Thanks for applying, **${interaction.user.username}**! Your full answers are posted below.\n` +
        `The team will read your application and reply here. Feel free to add anything you forgot.\n\n` +
        `Please don't ping staff about your application; you'll hear back in this channel either way.`
      )
      .addFields(summary.map(a => ({ name: a.name.slice(0, 256), value: `\`\`\`${a.value.slice(0, 1000) || '-'}\`\`\`` })));
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

        // Panel button → staff application. Resumes a saved draft, else opens page 1.
        if (btn.customId === 'ticket:apply') {
          const existing = await db.getOpenTicketByUser(btn.guildId!, btn.user.id, 'application');
          if (existing) {
            await btn.reply({ content: `You already have an open application: <#${existing.channel_id}>. Add anything new there.`, flags: MessageFlags.Ephemeral });
            return;
          }
          const draft = await db.getApplicationDraft(btn.guildId!, btn.user.id);
          const fresh = draft && draft.roles !== null && Date.now() - draft.updated_at < DRAFT_TTL_MS;
          if (fresh) {
            const roles = draftRoles(draft);
            const pages = buildApplicationPages(roles);
            const page = Math.min(draft.page, pages.length - 1);
            await btn.reply({ ...buildPagePrompt(pages[page], page, pages.length, roles), flags: MessageFlags.Ephemeral });
            return;
          }
          await btn.showModal(buildPageModal(FIRST_PAGE, 0, 0));
          return;
        }

        // "Answer page N" on an ephemeral prompt → that page's form
        if (btn.customId.startsWith(APPLY_PAGE_PREFIX)) {
          const index = parseInt(btn.customId.slice(APPLY_PAGE_PREFIX.length));
          const draft = await db.getApplicationDraft(btn.guildId!, btn.user.id);
          if (!draft || draft.roles === null || isNaN(index)) {
            await btn.showModal(buildPageModal(FIRST_PAGE, 0, 0));
            return;
          }
          const pages = buildApplicationPages(draftRoles(draft));
          const page = Math.min(Math.max(index, 0), pages.length - 1);
          await btn.showModal(buildPageModal(pages[page], page, pages.length));
          return;
        }

        if (btn.customId === APPLY_RESTART_ID) {
          await db.deleteApplicationDraft(btn.guildId!, btn.user.id);
          await btn.showModal(buildPageModal(FIRST_PAGE, 0, 0)); // its submit replaces this prompt with page 2
          return;
        }

        if (btn.customId === APPLY_CANCEL_ID) {
          await db.deleteApplicationDraft(btn.guildId!, btn.user.id);
          await btn.update({ content: '🗑️ Application cancelled; nothing was sent to staff. You can start again any time with **Apply for Staff**.', embeds: [], components: [] }).catch(() => {});
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

      // ── Modal submits ────────────────────────────────────────────────────
      if ((interaction as any).isModalSubmit()) {
        const modal = interaction as ModalSubmitInteraction;

        // Support ticket
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

        // Staff application, one page at a time. Only the last page creates anything.
        if (modal.customId.startsWith(APPLY_MODAL_PREFIX)) {
          const index = parseInt(modal.customId.slice(APPLY_MODAL_PREFIX.length));
          const guildId = modal.guildId!;
          const userId = modal.user.id;

          const existing = await db.getOpenTicketByUser(guildId, userId, 'application');
          if (existing) {
            await respondEphemeral(modal, { content: `You already have an open application: <#${existing.channel_id}>. Add anything new there.`, embeds: [], components: [] });
            return;
          }

          // Page 0 decides the role and therefore the page list; later pages need the saved draft.
          const draft = index === 0 ? null : await db.getApplicationDraft(guildId, userId);
          if (index !== 0 && (!draft || draft.roles === null)) {
            await respondEphemeral(modal, { content: 'Your application draft has expired. Press **Apply for Staff** to start again.', embeds: [], components: [] });
            return;
          }

          // Read this page's answers using the page list the form was built from.
          const answers: Record<string, string> = { ...(draft?.answers ?? {}) };
          const builtPages = buildApplicationPages(draftRoles(draft));
          const page = index === 0 ? FIRST_PAGE : builtPages[Math.min(index, builtPages.length - 1)];
          for (const q of page.questions) {
            try { answers[q.id] = modal.fields.getTextInputValue(q.id).trim(); } catch { /* optional field left out */ }
          }
          const roles = index === 0 ? parseApplicationRoles(answers.role ?? '') : draftRoles(draft);
          const pages = buildApplicationPages(roles);
          const next = index + 1;

          if (next < pages.length) {
            await db.saveApplicationDraft(guildId, userId, { roles, answers, page: next });
            await respondEphemeral(modal, buildPagePrompt(pages[next], next, pages.length, roles));
            return;
          }

          // Last page: create the channel, post everything, send the DMs.
          await deferEphemeral(modal);
          try {
            const summary = FIRST_PAGE.questions.map(q => ({ name: q.text, value: answers[q.id] ?? '' })).filter(a => a.value);
            const channel = await createTicketChannel(modal, 'application', APPLICATION_TOPIC, db, summary);
            await db.deleteApplicationDraft(guildId, userId);
            const cfg = await db.getTicketConfig(guildId);
            const { notified, notifyRoleId } = await afterApplicationCreated(modal, channel, cfg, pages, roles, answers);
            await channel.send(
              notifyRoleId
                ? `-# ${notified} staff member${notified === 1 ? '' : 's'} notified by DM.`
                : `-# No staff were DMed: set a role with \`/ticket config set applications_notify:@role\`.`
            ).catch(() => {});
            await modal.editReply({ content: `✅ Application sent! Your answers are in <#${channel.id}>, and staff will be in contact with you there.`, embeds: [], components: [] });
          } catch (err) {
            console.error('[tickets] application create error:', err);
            await db.saveApplicationDraft(guildId, userId, { roles, answers, page: index }).catch(() => {});
            await modal.editReply({ content: '❌ Could not create your application channel; your answers are saved. Press **Apply for Staff** to try the last page again, or tell a staff member.', embeds: [], components: [] });
          }
          return;
        }
      }
    },
  },
};

export default ticketsModule;
