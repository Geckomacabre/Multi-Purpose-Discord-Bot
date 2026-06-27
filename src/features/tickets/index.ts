import {
  ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle,
  ContainerBuilder, MessageFlags, ModalBuilder, ModalSubmitInteraction,
  PermissionFlagsBits, TextChannel, TextDisplayBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { EventModule } from '../feature';
import { cv2Text } from '../../utils/components.js';

const IS_CV2 = MessageFlags.IsComponentsV2;

async function createTicketChannel(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  topic: string,
  db: any,
) {
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

  const channelOptions: any = {
    name: `ticket-${ticketNum}`,
    permissionOverwrites: permOverwrites,
    topic: `Ticket by ${interaction.user.tag} — ${topic}`,
  };
  if (cfg?.category_id) channelOptions.parent = cfg.category_id;

  const channel = await interaction.guild!.channels.create(channelOptions) as TextChannel;
  const ticket = await db.createTicket(guildId, channel.id, interaction.user.id, topic);

  const container = new ContainerBuilder()
    .setAccentColor(0x5865F2)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `**Ticket #${ticket.ticket_num}**\nWelcome <@${interaction.user.id}>! Support will be with you shortly.\n**Topic:** ${topic}`
    ));
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ticket:close:${channel.id}`).setLabel('Close Ticket').setStyle(ButtonStyle.Danger)
  );
  await channel.send({
    content: `<@${interaction.user.id}>${cfg?.support_role_id ? ` <@&${cfg.support_role_id}>` : ''}`,
    flags: IS_CV2,
    components: [container, row],
  });

  return channel;
}

const ticketsModule: EventModule = {
  name: 'tickets',
  handlers: {
    interactionCreate: async ({ data: [interaction], db }) => {
      // ── Button: open ticket panel ────────────────────────────────────────
      if ((interaction as any).isButton()) {
        const btn = interaction as ButtonInteraction;

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

        // ── Button: close ticket ───────────────────────────────────────────
        if (btn.customId.startsWith('ticket:close:')) {
          const channelId = btn.customId.split(':')[2];
          if (btn.channelId !== channelId) return;
          await btn.deferReply({ flags: MessageFlags.Ephemeral });
          const ticket = await db.getTicketByChannel(channelId);
          if (!ticket) {
            await btn.editReply('This channel is not an open ticket.');
            return;
          }
          await db.closeTicket(channelId);
          await btn.editReply('Ticket closed. This channel will be deleted in 5 seconds.');
          setTimeout(() => btn.channel?.delete().catch(() => {}), 5000);
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
        } catch (err) {
          await modal.editReply(cv2Text('❌ Could not create ticket. Make sure the bot has permission to create channels.'));
        }
      }
    },
  },
};

export default ticketsModule;
