import {
  ApplicationIntegrationType, ChatInputCommandInteraction, InteractionContextType, MessageFlags,
  PermissionFlagsBits, SlashCommandBuilder, TextChannel,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';
import { buildRedirectMessage, resolveRedirectTargets } from '../../utils/tickets.js';
import { TicketRedirectChannels } from '../../constants';

/**
 * /support — the quick "this is not a support channel" reply, posted right here.
 * Same message as /ticket redirect: an Open a Ticket button plus links to the support
 * channels set for this server with /ticket config redirect-add.
 */
const Support: Command = {
  data: new SlashCommandBuilder()
    .setName('support')
    .setDescription('Tell people this is not a support channel: open a ticket or use the support channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild]),

  async run(interaction: ChatInputCommandInteraction) {
    const channel = interaction.channel as TextChannel | null;
    if (!channel || !interaction.guild) {
      await interaction.reply({ content: 'Use this in a server channel.', flags: MessageFlags.Ephemeral });
      return;
    }
    const configured = (await db.getTicketRedirects(interaction.guildId!)).map(r => ({ id: r.channel_id, label: r.label }));
    const targets = resolveRedirectTargets(interaction.guild, configured, TicketRedirectChannels);
    try {
      // The reply itself is the message, so it is visible and needs no extra "posted" confirmation.
      await interaction.reply(buildRedirectMessage(interaction.guild, targets, interaction.client.user.displayAvatarURL()));
    } catch {
      await interaction.reply({ content: '❌ Could not post here.', flags: MessageFlags.Ephemeral });
    }
  },
};

export default Support;
