import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, SlashCommandBuilder,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

function parseTimestamp(s: string): number | null {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.getTime();
}

const Rsvp: Command = {
  data: new SlashCommandBuilder()
    .setName('rsvp')
    .setDescription('Manage server events and RSVPs')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(sub => sub
      .setName('create')
      .setDescription('Create an event')
      .addStringOption(o => o.setName('title').setDescription('Event title').setRequired(true))
      .addStringOption(o => o.setName('time').setDescription('Start time (e.g. "2025-06-20 18:00 UTC")').setRequired(true))
      .addStringOption(o => o.setName('description').setDescription('Event description'))
    )
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List upcoming events')
    )
    .addSubcommand(sub => sub
      .setName('attend')
      .setDescription('RSVP as attending')
      .addIntegerOption(o => o.setName('id').setDescription('Event ID').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('decline')
      .setDescription('RSVP as not attending')
      .addIntegerOption(o => o.setName('id').setDescription('Event ID').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('maybe')
      .setDescription('RSVP as maybe attending')
      .addIntegerOption(o => o.setName('id').setDescription('Event ID').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('view')
      .setDescription('View event details and attendees')
      .addIntegerOption(o => o.setName('id').setDescription('Event ID').setRequired(true))
    ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply();

    if (sub === 'create') {
      const title = interaction.options.getString('title', true);
      const timeStr = interaction.options.getString('time', true);
      const description = interaction.options.getString('description');
      const ts = parseTimestamp(timeStr);
      if (!ts || ts < Date.now()) { await interaction.editReply('❌ Invalid or past date/time. Use e.g. `2025-06-20 18:00 UTC`'); return; }

      const event = await db.createRsvpEvent(interaction.guildId!, interaction.channelId, title, description, ts, interaction.user.id);

      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle(`📅 ${title}`)
        .setDescription(description ?? '')
        .addFields(
          { name: 'Starts', value: `<t:${Math.floor(ts / 1000)}:F>`, inline: true },
          { name: 'Created by', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Event ID', value: String(event.id), inline: true },
          { name: 'Attending ✅', value: '0', inline: true },
          { name: 'Declined ❌', value: '0', inline: true },
          { name: 'Maybe 🤔', value: '0', inline: true },
        )
        .setFooter({ text: `Use /rsvp attend|decline|maybe ${event.id} to respond` });

      const msg = await interaction.editReply({ embeds: [embed] });
      if ('id' in msg) await db.updateRsvpMessageId(event.id, msg.id);

    } else if (sub === 'list') {
      const events = await db.listRsvpEvents(interaction.guildId!);
      if (!events.length) { await interaction.editReply('No upcoming events.'); return; }
      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Upcoming Events')
        .setDescription(events.map(e => `**#${e.id}** **${e.title}** — <t:${Math.floor(e.starts_at / 1000)}:R>`).join('\n'));
      await interaction.editReply({ embeds: [embed] });

    } else if (['attend', 'decline', 'maybe'].includes(sub)) {
      const id = interaction.options.getInteger('id', true);
      const event = await db.getRsvpEvent(id, interaction.guildId!);
      if (!event) { await interaction.editReply(`❌ Event #${id} not found.`); return; }
      const status = sub === 'attend' ? 'attending' : sub === 'decline' ? 'declined' : 'maybe';
      await db.setRsvpResponse(id, interaction.user.id, status as any);
      const emojis = { attending: '✅', declined: '❌', maybe: '🤔' };
      await interaction.editReply(`${emojis[status]} You're marked as **${status}** for **${event.title}**.`);

    } else if (sub === 'view') {
      const id = interaction.options.getInteger('id', true);
      const event = await db.getRsvpEvent(id, interaction.guildId!);
      if (!event) { await interaction.editReply(`❌ Event #${id} not found.`); return; }
      const responses = await db.getRsvpResponses(id);
      const attending = responses.filter(r => r.status === 'attending');
      const declined = responses.filter(r => r.status === 'declined');
      const maybe = responses.filter(r => r.status === 'maybe');

      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle(`📅 ${event.title}`)
        .setDescription(event.description ?? '')
        .addFields(
          { name: 'Starts', value: `<t:${Math.floor(event.starts_at / 1000)}:F>`, inline: true },
          { name: 'Created by', value: `<@${event.created_by}>`, inline: true },
          { name: `✅ Attending (${attending.length})`, value: attending.map(r => `<@${r.user_id}>`).join(', ') || 'None' },
          { name: `❌ Declined (${declined.length})`, value: declined.map(r => `<@${r.user_id}>`).join(', ') || 'None' },
          { name: `🤔 Maybe (${maybe.length})`, value: maybe.map(r => `<@${r.user_id}>`).join(', ') || 'None' },
        );
      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default Rsvp;
