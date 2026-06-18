import {
  ApplicationIntegrationType, ChatInputCommandInteraction, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder, Colors, MessageFlags,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import * as db from '../../utils/db';

function parseMessageLink(link: string): { channelId: string; messageId: string } | null {
  const match = link.match(/(?:channels\/\d+\/|^)(\d+)\/(\d+)$/);
  if (!match) return null;
  return { channelId: match[1], messageId: match[2] };
}

const ReactionRoles: Command = {
  data: new SlashCommandBuilder()
    .setName('reactionroles')
    .setDescription('Manage reaction roles')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(s =>
      s.setName('add').setDescription('Add a reaction role to a message')
        .addStringOption(o => o.setName('message_link').setDescription('Message link or channel_id/message_id').setRequired(true))
        .addStringOption(o => o.setName('emoji').setDescription('Emoji to react with').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true)))
    .addSubcommand(s =>
      s.setName('remove').setDescription('Remove a reaction role by ID')
        .addIntegerOption(o => o.setName('id').setDescription('ID from /reactionroles list').setRequired(true)))
    .addSubcommand(s =>
      s.setName('clear').setDescription('Remove all reaction roles from a message')
        .addStringOption(o => o.setName('message_link').setDescription('Message link or channel_id/message_id').setRequired(true)))
    .addSubcommand(s =>
      s.setName('list').setDescription('List all reaction roles in this server')) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild!;

    if (sub === 'add') {
      const link = interaction.options.getString('message_link', true);
      const emojiStr = interaction.options.getString('emoji', true).trim();
      const role = interaction.options.getRole('role', true);

      const parsed = parseMessageLink(link);
      if (!parsed) return interaction.reply({ content: 'Invalid message link. Copy it via "Copy Message Link" in Discord.', flags: MessageFlags.Ephemeral });

      const channel = guild.channels.cache.get(parsed.channelId) as any;
      if (!channel?.isTextBased()) return interaction.reply({ content: 'Channel not found.', flags: MessageFlags.Ephemeral });

      const message = await channel.messages.fetch(parsed.messageId).catch(() => null);
      if (!message) return interaction.reply({ content: 'Message not found.', flags: MessageFlags.Ephemeral });

      // Add the reaction so users can see it
      await message.react(emojiStr).catch(() => {});

      // Normalize custom emoji to <:name:id> format
      const customEmojiMatch = emojiStr.match(/^<a?:(\w+):(\d+)>$/);
      const emoji = customEmojiMatch ? emojiStr : emojiStr;

      await db.addReactionRole(guild.id, parsed.channelId, parsed.messageId, emoji, role.id);
      return interaction.reply({ content: `✅ Reaction role added: ${emojiStr} → <@&${role.id}>`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'remove') {
      const id = interaction.options.getInteger('id', true);
      const removed = await db.removeReactionRole(id, guild.id);
      if (!removed) return interaction.reply({ content: 'No reaction role found with that ID.', flags: MessageFlags.Ephemeral });
      return interaction.reply({ content: '✅ Reaction role removed.', flags: MessageFlags.Ephemeral });
    }

    if (sub === 'clear') {
      const link = interaction.options.getString('message_link', true);
      const parsed = parseMessageLink(link);
      if (!parsed) return interaction.reply({ content: 'Invalid message link.', flags: MessageFlags.Ephemeral });

      await db.clearReactionRolesForMessage(guild.id, parsed.messageId);
      return interaction.reply({ content: '✅ All reaction roles cleared for that message.', flags: MessageFlags.Ephemeral });
    }

    if (sub === 'list') {
      const all = await db.getReactionRoles(guild.id);
      if (!all.length) return interaction.reply({ content: 'No reaction roles configured.', flags: MessageFlags.Ephemeral });

      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('⚡ Reaction Roles')
        .setDescription(
          all.map(r => `**ID ${r.id}** — ${r.emoji} → <@&${r.role_id}> on [message](https://discord.com/channels/${guild.id}/${r.channel_id}/${r.message_id})`).join('\n'),
        );
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};

export default ReactionRoles;
