import {
  ApplicationIntegrationType,
  ChatInputCommandInteraction,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import * as db from '../../utils/db';
import { findTimezoneMatch, generateTimezoneMessage, offsetToString } from '../../features/timezone';

const Timezone: Command = {
  data: new SlashCommandBuilder()
    .setName('timezone')
    .setDescription('Configure your timezone to show')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Set your timezone')
        .addStringOption((opt) =>
          opt
            .setName('timezone')
            .setDescription('Your current timezone that you want to set to be shown publicly')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) => sub.setName('remove').setDescription('Unset your timezone'))
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setDescription("View all user's timezones in this server")
        .addUserOption((opt) =>
          opt
            .setName('highlight')
            .setDescription('The user whose timezone you want to highlight (for easier finding in the list)')
            .setRequired(false)
        )
    )
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild]) as any,

  async run(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) return;
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    const updateTimezoneMessage = async () => {
      const timezoneMsg = await db.getGuildTimezoneMessage(guildId);
      if (!timezoneMsg) return;

      const channel = await interaction.guild!.channels.fetch(timezoneMsg.channel_id);
      if (!channel || !channel.isTextBased()) return;

      const message = await (channel as any).messages.fetch(timezoneMsg.message_id);
      const newContent = await generateTimezoneMessage(db, guildId, null);
      if (!newContent) return;

      await message.edit({
        content: newContent.content,
        components: newContent.components,
        allowedMentions: { parse: [] },
      });
    };

    if (subcommand === 'set') {
      const timezoneInput = interaction.options.getString('timezone', true);
      const userId = interaction.user.id;
      const match = timezoneInput ? findTimezoneMatch(timezoneInput) : undefined;
      if (!timezoneInput || !match) {
        await interaction.reply({
          content: `❌ Invalid timezone. Make sure to use a valid canonical timezone provided by autocomplete.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await db.setUserTimezone(guildId, userId, match.name);
      await interaction.reply({
        content:
          `✅ Your timezone has been set to **${match.displayName}**` +
          `\n-# (Timezone abbreviation: \`${match.abbr ?? 'N/A'}\`, Offset: \`${offsetToString(match.offset)}\`${match.hasDST ? ', observes DST' : ''})`,
      });
      await updateTimezoneMessage();

    } else if (subcommand === 'remove') {
      const removed = await db.removeUserTimezone(guildId, interaction.user.id);
      if (removed) {
        await interaction.reply({
          content: `🗑️ Your timezone setting has been removed.`,
          flags: MessageFlags.Ephemeral,
        });
        await updateTimezoneMessage();
      } else {
        await interaction.reply({
          content: `ℹ️ You didn't have a timezone set.`,
          flags: MessageFlags.Ephemeral,
        });
      }

    } else if (subcommand === 'view') {
      const highlightUser = interaction.options.getUser('highlight');
      const userid = highlightUser?.id ?? interaction.user.id;
      const result = await generateTimezoneMessage(db, guildId, userid);
      if (!result) {
        await interaction.reply({
          content: `ℹ️ No members in this server have set a timezone yet! Use \`/timezone set\` to get started.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await interaction.reply({
        ...result,
        allowedMentions: {},
      });
    }
  },
};

export default Timezone;
