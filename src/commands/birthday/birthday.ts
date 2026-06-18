import {
  ApplicationIntegrationType, ChatInputCommandInteraction, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder, Colors, MessageFlags,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import * as db from '../../utils/db';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_IN_MONTH = [31,29,31,30,31,30,31,31,30,31,30,31];

function ordinal(n: number): string {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function daysUntilBirthday(month: number, day: number): number {
  const now = new Date();
  const year = now.getFullYear();
  let next = new Date(year, month - 1, day);
  if (next <= now) next = new Date(year + 1, month - 1, day);
  return Math.ceil((next.getTime() - now.getTime()) / 86_400_000);
}

const Birthday: Command = {
  data: new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('Birthday tracker commands')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(s =>
      s.setName('set').setDescription('Set your birthday')
        .addIntegerOption(o => o.setName('month').setDescription('Month (1-12)').setRequired(true).setMinValue(1).setMaxValue(12))
        .addIntegerOption(o => o.setName('day').setDescription('Day').setRequired(true).setMinValue(1).setMaxValue(31)))
    .addSubcommand(s =>
      s.setName('remove').setDescription('Remove your birthday from this server'))
    .addSubcommand(s =>
      s.setName('view').setDescription('View a user\'s birthday')
        .addUserOption(o => o.setName('user').setDescription('User to view (defaults to you)')))
    .addSubcommand(s =>
      s.setName('list').setDescription('List upcoming birthdays in this server'))
    .addSubcommand(s =>
      s.setName('delete').setDescription('Delete a user\'s birthday (Manage Server)')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const month = interaction.options.getInteger('month', true);
      const day = interaction.options.getInteger('day', true);
      if (day > DAYS_IN_MONTH[month - 1]) {
        return interaction.reply({ content: `${MONTHS[month - 1]} only has ${DAYS_IN_MONTH[month - 1]} days.`, flags: MessageFlags.Ephemeral });
      }
      await db.setBirthday(interaction.guildId!, interaction.user.id, month, day);
      return interaction.reply({ content: `✅ Your birthday has been set to **${MONTHS[month - 1]} ${ordinal(day)}**.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'remove') {
      await db.removeBirthday(interaction.guildId!, interaction.user.id);
      return interaction.reply({ content: '✅ Your birthday has been removed.', flags: MessageFlags.Ephemeral });
    }

    if (sub === 'delete') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: 'You need **Manage Server** to delete other users\' birthdays.', flags: MessageFlags.Ephemeral });
      }
      const user = interaction.options.getUser('user', true);
      await db.removeBirthday(interaction.guildId!, user.id);
      return interaction.reply({ content: `✅ Removed birthday for ${user.username}.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'view') {
      const user = interaction.options.getUser('user') ?? interaction.user;
      const bday = await db.getBirthday(interaction.guildId!, user.id);
      if (!bday) {
        return interaction.reply({ content: `${user.id === interaction.user.id ? 'You have' : `${user.username} has`} no birthday set.`, flags: MessageFlags.Ephemeral });
      }
      const days = daysUntilBirthday(bday.month, bday.day);
      const embed = new EmbedBuilder()
        .setColor(Colors.Gold)
        .setTitle(`🎂 ${user.username}'s Birthday`)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
          { name: 'Date', value: `${MONTHS[bday.month - 1]} ${ordinal(bday.day)}`, inline: true },
          { name: 'Coming up in', value: days === 0 ? '🎉 Today!' : `${days} day${days === 1 ? '' : 's'}`, inline: true },
        );
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'list') {
      const birthdays = await db.getBirthdays(interaction.guildId!);
      if (!birthdays.length) return interaction.reply({ content: 'No birthdays set in this server yet.', flags: MessageFlags.Ephemeral });

      const sorted = birthdays
        .map(b => ({ ...b, days: daysUntilBirthday(b.month, b.day) }))
        .sort((a, b) => a.days - b.days)
        .slice(0, 20);

      const lines = sorted.map(b =>
        `<@${b.user_id}> — ${MONTHS[b.month - 1]} ${ordinal(b.day)} (${b.days === 0 ? '🎉 Today!' : `in ${b.days}d`})`,
      );

      const embed = new EmbedBuilder()
        .setColor(Colors.Gold)
        .setTitle('🎂 Upcoming Birthdays')
        .setDescription(lines.join('\n'));
      return interaction.reply({ embeds: [embed] });
    }
  },
};

export default Birthday;
