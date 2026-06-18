import { ButtonInteraction,
  MessageFlags,
} from 'discord.js';
import { EventModule } from '../feature';

const ticketsModule: EventModule = {
  name: 'tickets',
  handlers: {
    interactionCreate: async ({ data: [interaction], db }) => {
      if (!interaction.isButton()) return;
      const btn = interaction as ButtonInteraction;
      if (!btn.customId.startsWith('ticket:close:')) return;
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
    },
  },
};

export default ticketsModule;
