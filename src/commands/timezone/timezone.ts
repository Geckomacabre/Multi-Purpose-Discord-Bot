import {
  ApplicationIntegrationType, ChatInputCommandInteraction, EmbedBuilder,
  InteractionContextType, SlashCommandBuilder, Colors, MessageFlags,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import * as db from '../../utils/db';

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function formatTime(tz: string): string {
  return new Date().toLocaleString('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

const Timezone: Command = {
  data: new SlashCommandBuilder()
    .setName('timezone')
    .setDescription('Timezone tracker commands')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(s =>
      s.setName('set').setDescription('Set your timezone (IANA format, e.g. America/New_York)')
        .addStringOption(o => o.setName('timezone').setDescription('Your IANA timezone').setRequired(true)))
    .addSubcommand(s =>
      s.setName('remove').setDescription('Remove your timezone'))
    .addSubcommand(s =>
      s.setName('view').setDescription('View current time for a user')
        .addUserOption(o => o.setName('user').setDescription('User to check (defaults to you)')))
    .addSubcommand(s =>
      s.setName('list').setDescription('List timezones of members in this server')) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const tz = interaction.options.getString('timezone', true);
      if (!isValidTimezone(tz)) {
        return interaction.reply({
          content: `❌ \`${tz}\` is not a valid IANA timezone.\nExamples: \`America/New_York\`, \`Europe/London\`, \`Asia/Tokyo\``,
          flags: MessageFlags.Ephemeral,
        });
      }
      await db.setTimezone(interaction.user.id, tz);
      return interaction.reply({
        content: `✅ Your timezone is set to **${tz}** (current time: ${formatTime(tz)}).`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'remove') {
      await db.removeTimezone(interaction.user.id);
      return interaction.reply({ content: '✅ Your timezone has been removed.', flags: MessageFlags.Ephemeral });
    }

    if (sub === 'view') {
      const user = interaction.options.getUser('user') ?? interaction.user;
      const record = await db.getTimezone(user.id);
      if (!record) {
        return interaction.reply({
          content: `${user.id === interaction.user.id ? 'You have' : `${user.username} has`} no timezone set.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle(`🕐 ${user.username}'s Time`)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
          { name: 'Timezone', value: record.timezone, inline: true },
          { name: 'Current Time', value: formatTime(record.timezone), inline: true },
        );
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'list') {
      const members = await interaction.guild!.members.fetch();
      const memberIds = [...members.keys()];
      const allTzRows = await Promise.all(memberIds.map(id => db.getTimezone(id)));
      const rows = allTzRows.filter(Boolean) as Awaited<ReturnType<typeof db.getTimezone>>[];

      if (!rows.length) return interaction.reply({ content: 'No members have set a timezone yet.', flags: MessageFlags.Ephemeral });

      const lines = rows
        .sort((a, b) => a!.timezone.localeCompare(b!.timezone))
        .slice(0, 20)
        .map(r => `<@${r!.user_id}> — \`${r!.timezone}\` (${formatTime(r!.timezone)})`);

      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('🌍 Member Timezones')
        .setDescription(lines.join('\n'));
      return interaction.reply({ embeds: [embed] });
    }
  },
};

export default Timezone;
