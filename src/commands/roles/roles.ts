import {
  ApplicationIntegrationType, ChannelType, ChatInputCommandInteraction, Colors,
  ContainerBuilder, InteractionContextType, MessageFlags, PermissionFlagsBits,
  SlashCommandBuilder, TextDisplayBuilder,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';
import { cv2Text } from '../../utils/components.js';

const IS_CV2 = MessageFlags.IsComponentsV2;

function parseMessageLink(link: string): { channelId: string; messageId: string } | null {
  const match = link.match(/(?:channels\/\d+\/|^)(\d+)\/(\d+)$/);
  if (!match) return null;
  return { channelId: match[1], messageId: match[2] };
}

const Roles: Command = {
  data: new SlashCommandBuilder()
    .setName('roles')
    .setDescription('Role management commands')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    // ── Flat: self-assign & bulk ───────────────────────────────────────────────
    .addSubcommand(s => s.setName('self').setDescription('Toggle a self-assignable role')
      .addStringOption(o => o.setName('name').setDescription('Role command name').setRequired(true)))
    .addSubcommand(s => s.setName('bulk').setDescription('Assign or remove a role from many members at once')
      .addStringOption(o => o.setName('action').setDescription('assign or remove').setRequired(true)
        .addChoices({ name: 'assign', value: 'assign' }, { name: 'remove', value: 'remove' }))
      .addRoleOption(o => o.setName('role').setDescription('Role to assign/remove').setRequired(true))
      .addStringOption(o => o.setName('filter').setDescription('Which members').setRequired(true)
        .addChoices(
          { name: 'All members', value: 'all' },
          { name: 'Has specific role', value: 'has_role' },
          { name: 'Missing specific role', value: 'missing_role' },
          { name: 'Bots only', value: 'bots' },
          { name: 'Humans only', value: 'humans' },
        ))
      .addRoleOption(o => o.setName('filter_role').setDescription('Role used for has_role/missing_role filter')))
    // ── Self-assignable role definitions ──────────────────────────────────────
    .addSubcommandGroup(g => g.setName('self-assign').setDescription('Manage self-assignable role definitions')
      .addSubcommand(s => s.setName('add').setDescription('Register a self-assignable role')
        .addStringOption(o => o.setName('name').setDescription('Name users type with /roles self').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true))
        .addStringOption(o => o.setName('group').setDescription('Group name (only one per group can be held)')))
      .addSubcommand(s => s.setName('remove').setDescription('Remove a self-assignable role by ID')
        .addIntegerOption(o => o.setName('id').setDescription('Role command ID').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('List all self-assignable roles')))
    // ── Autoroles ─────────────────────────────────────────────────────────────
    .addSubcommandGroup(g => g.setName('auto').setDescription('Roles assigned automatically to new members')
      .addSubcommand(s => s.setName('add').setDescription('Add an autorole')
        .addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true))
        .addIntegerOption(o => o.setName('delay').setDescription('Seconds to wait before assigning (0 = instant)').setMinValue(0)))
      .addSubcommand(s => s.setName('remove').setDescription('Remove an autorole by ID')
        .addIntegerOption(o => o.setName('id').setDescription('Autorole ID').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('List all autoroles'))
      .addSubcommand(s => s.setName('test').setDescription('Diagnose autorole setup — checks permissions and hierarchy')))
    // ── Voice roles ───────────────────────────────────────────────────────────
    .addSubcommandGroup(g => g.setName('voice').setDescription('Roles assigned when joining a voice channel')
      .addSubcommand(s => s.setName('add').setDescription('Add a voice role binding')
        .addChannelOption(o => o.setName('channel').setDescription('Voice channel').setRequired(true).addChannelTypes(ChannelType.GuildVoice))
        .addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true)))
      .addSubcommand(s => s.setName('remove').setDescription('Remove a voice role binding by ID')
        .addIntegerOption(o => o.setName('id').setDescription('Binding ID').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('List all voice role bindings')))
    // ── Reaction roles ────────────────────────────────────────────────────────
    .addSubcommandGroup(g => g.setName('reaction').setDescription('Roles assigned via emoji reactions')
      .addSubcommand(s => s.setName('add').setDescription('Add a reaction role to a message')
        .addStringOption(o => o.setName('message_link').setDescription('Message link or channel_id/message_id').setRequired(true))
        .addStringOption(o => o.setName('emoji').setDescription('Emoji to react with').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true)))
      .addSubcommand(s => s.setName('remove').setDescription('Remove a reaction role by ID')
        .addIntegerOption(o => o.setName('id').setDescription('ID from /roles reaction list').setRequired(true)))
      .addSubcommand(s => s.setName('clear').setDescription('Remove all reaction roles from a message')
        .addStringOption(o => o.setName('message_link').setDescription('Message link or channel_id/message_id').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('List all reaction roles in this server'))) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild!;
    const guildId = guild.id;

    // ── /roles self ───────────────────────────────────────────────────────────
    if (sub === 'self' && !group) {
      const name = interaction.options.getString('name', true);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const rc = await db.getRoleCommandByName(guildId, name);
      if (!rc) { await interaction.editReply(cv2Text(`❌ No self-assignable role named \`${name}\`. Use \`/roles self-assign list\` to see available roles.`)); return; }
      const member = await guild.members.fetch(interaction.user.id);
      const hasRole = member.roles.cache.has(rc.role_id);
      if (!hasRole && rc.group_name) {
        const groupCmds = (await db.getRoleCommands(guildId)).filter(c => c.group_name === rc.group_name && c.id !== rc.id);
        for (const other of groupCmds) {
          if (member.roles.cache.has(other.role_id)) await member.roles.remove(other.role_id).catch(() => {});
        }
      }
      if (hasRole) {
        await member.roles.remove(rc.role_id).catch(() => {});
        await interaction.editReply(cv2Text(`✅ Removed <@&${rc.role_id}>.`));
      } else {
        await member.roles.add(rc.role_id).catch(() => {});
        await interaction.editReply(cv2Text(`✅ Added <@&${rc.role_id}>.`));
      }
      return;
    }

    // ── /roles bulk ───────────────────────────────────────────────────────────
    if (sub === 'bulk' && !group) {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.reply({ ...cv2Text('❌ You need **Manage Roles** to use bulk role.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return;
      }
      const action = interaction.options.getString('action', true);
      const role = interaction.options.getRole('role', true);
      const filter = interaction.options.getString('filter', true);
      const filterRole = interaction.options.getRole('filter_role');
      await interaction.deferReply();
      await interaction.editReply(cv2Text('⏳ Fetching members...'));
      let members = await guild.members.fetch();
      switch (filter) {
        case 'has_role':
          if (!filterRole) { await interaction.editReply(cv2Text('❌ Provide a filter_role for has_role filter.')); return; }
          members = members.filter(m => m.roles.cache.has(filterRole.id)); break;
        case 'missing_role':
          if (!filterRole) { await interaction.editReply(cv2Text('❌ Provide a filter_role for missing_role filter.')); return; }
          members = members.filter(m => !m.roles.cache.has(filterRole.id)); break;
        case 'bots': members = members.filter(m => m.user.bot); break;
        case 'humans': members = members.filter(m => !m.user.bot); break;
      }
      await interaction.editReply(cv2Text(`⏳ Processing **${members.size}** members...`));
      let count = 0;
      const batch = [...members.values()];
      for (const member of batch) {
        try {
          if (action === 'assign') await member.roles.add(role.id);
          else await member.roles.remove(role.id);
          count++;
        } catch {}
        if (count % 10 === 0) await new Promise(r => setTimeout(r, 1000));
      }
      await interaction.editReply(cv2Text(`✅ ${action === 'assign' ? 'Assigned' : 'Removed'} <@&${role.id}> ${action === 'assign' ? 'to' : 'from'} **${count}** member(s).`));
      return;
    }

    // ── /roles self-assign ────────────────────────────────────────────────────
    if (group === 'self-assign') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.reply({ ...cv2Text('❌ You need **Manage Roles** to manage self-assignable roles.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (sub === 'add') {
        const name = interaction.options.getString('name', true);
        const role = interaction.options.getRole('role', true);
        const grp = interaction.options.getString('group');
        const rc = await db.addRoleCommand(guildId, name, role.id, grp);
        await interaction.editReply(cv2Text(`✅ Role command **${name}** → <@&${role.id}> created (ID: ${rc.id}).`));
      } else if (sub === 'remove') {
        const id = interaction.options.getInteger('id', true);
        const ok = await db.removeRoleCommand(id, guildId);
        await interaction.editReply(cv2Text(ok ? `✅ Role command #${id} removed.` : `❌ Role command #${id} not found.`));
      } else {
        const cmds = await db.getRoleCommands(guildId);
        if (!cmds.length) { await interaction.editReply(cv2Text('No self-assignable roles configured.')); return; }
        const container = new ContainerBuilder().setAccentColor(Colors.Blurple)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Self-Assignable Roles**\n\n${cmds.map(c => `**#${c.id}** \`${c.name}\` → <@&${c.role_id}>${c.group_name ? ` [${c.group_name}]` : ''}`).join('\n')}`
          ));
        await interaction.editReply({ flags: IS_CV2, components: [container] });
      }
      return;
    }

    // ── /roles auto ───────────────────────────────────────────────────────────
    if (group === 'auto') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.reply({ ...cv2Text('❌ You need **Manage Roles** to manage autoroles.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (sub === 'add') {
        const role = interaction.options.getRole('role', true);
        const delay = interaction.options.getInteger('delay') ?? 0;
        const ar = await db.addAutorole(guildId, role.id, delay);
        await interaction.editReply(cv2Text(`✅ <@&${role.id}> will be assigned to new members${delay ? ` after ${delay}s` : ' instantly'}. (ID: ${ar.id})`));
      } else if (sub === 'remove') {
        const id = interaction.options.getInteger('id', true);
        const ok = await db.removeAutorole(id, guildId);
        await interaction.editReply(cv2Text(ok ? `✅ Autorole #${id} removed.` : `❌ Autorole #${id} not found.`));
      } else if (sub === 'test') {
        const roles = await db.getAutoroles(guildId);
        const botMember = await guild.members.fetchMe();
        const botHasManageRoles = botMember.permissions.has(PermissionFlagsBits.ManageRoles);
        const botHighestPos = botMember.roles.highest.position;

        const lines: string[] = [];
        lines.push(`**Bot has Manage Roles:** ${botHasManageRoles ? '✅ Yes' : '❌ No — grant this in Server Settings → Roles'}`);
        lines.push(`**Bot highest role position:** ${botHighestPos}`);
        lines.push('');

        if (!roles.length) {
          lines.push('❌ No autoroles configured. Use `/roles auto add` to add one.');
        } else {
          lines.push(`**Configured autoroles (${roles.length}):**`);
          for (const ar of roles) {
            const role = guild.roles.cache.get(ar.role_id);
            if (!role) {
              lines.push(`• <@&${ar.role_id}> — ❌ **Role not found** (deleted from server? Remove with \`/roles auto remove ${ar.id}\`)`);
              continue;
            }
            const canAssign = botHasManageRoles && botHighestPos > role.position;
            lines.push(`• <@&${role.id}> (pos ${role.position})${ar.wait_seconds ? ` — ${ar.wait_seconds}s delay` : ''} — ${canAssign ? '✅ Bot can assign this' : `❌ Bot cannot assign — bot role (pos ${botHighestPos}) must be above this role (pos ${role.position})`}`);
          }
        }

        const container = new ContainerBuilder().setAccentColor(botHasManageRoles ? Colors.Green : Colors.Red)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Autorole Diagnostics**\n\n${lines.join('\n')}`));
        await interaction.editReply({ flags: IS_CV2, components: [container] });
      } else {
        const roles = await db.getAutoroles(guildId);
        if (!roles.length) { await interaction.editReply(cv2Text('No autoroles configured.')); return; }
        const container = new ContainerBuilder().setAccentColor(Colors.Blurple)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Autoroles**\n\n${roles.map(r => `**#${r.id}** <@&${r.role_id}>${r.wait_seconds ? ` — ${r.wait_seconds}s delay` : ''}`).join('\n')}`
          ));
        await interaction.editReply({ flags: IS_CV2, components: [container] });
      }
      return;
    }

    // ── /roles voice ──────────────────────────────────────────────────────────
    if (group === 'voice') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.reply({ ...cv2Text('❌ You need **Manage Roles** to manage voice roles.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (sub === 'add') {
        const channel = interaction.options.getChannel('channel', true);
        const role = interaction.options.getRole('role', true);
        const vr = await db.addVoiceRole(guildId, channel.id, role.id);
        await interaction.editReply(cv2Text(`✅ <@&${role.id}> will be assigned when joining <#${channel.id}> (ID: ${vr.id}).`));
      } else if (sub === 'remove') {
        const id = interaction.options.getInteger('id', true);
        const ok = await db.removeVoiceRole(id, guildId);
        await interaction.editReply(cv2Text(ok ? `✅ Voice role #${id} removed.` : `❌ Voice role #${id} not found.`));
      } else {
        const vrs = await db.getVoiceRoles(guildId);
        if (!vrs.length) { await interaction.editReply(cv2Text('No voice role bindings configured.')); return; }
        const container = new ContainerBuilder().setAccentColor(Colors.Blurple)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Voice Roles**\n\n${vrs.map(v => `**#${v.id}** <#${v.voice_channel_id}> → <@&${v.role_id}>`).join('\n')}`
          ));
        await interaction.editReply({ flags: IS_CV2, components: [container] });
      }
      return;
    }

    // ── /roles reaction ───────────────────────────────────────────────────────
    if (group === 'reaction') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.reply({ ...cv2Text('❌ You need **Manage Roles** to manage reaction roles.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return;
      }
      if (sub === 'add') {
        const link = interaction.options.getString('message_link', true);
        const emojiStr = interaction.options.getString('emoji', true).trim();
        const role = interaction.options.getRole('role', true);
        const parsed = parseMessageLink(link);
        if (!parsed) { await interaction.reply({ ...cv2Text('❌ Invalid message link. Copy it via "Copy Message Link" in Discord.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return; }
        const ch = guild.channels.cache.get(parsed.channelId) as any;
        if (!ch?.isTextBased()) { await interaction.reply({ ...cv2Text('❌ Channel not found.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return; }
        const message = await ch.messages.fetch(parsed.messageId).catch(() => null);
        if (!message) { await interaction.reply({ ...cv2Text('❌ Message not found.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return; }
        await message.react(emojiStr).catch(() => {});
        await db.addReactionRole(guildId, parsed.channelId, parsed.messageId, emojiStr, role.id);
        await interaction.reply({ ...cv2Text(`✅ Reaction role added: ${emojiStr} → <@&${role.id}>`), flags: IS_CV2 | MessageFlags.Ephemeral });
      } else if (sub === 'remove') {
        const id = interaction.options.getInteger('id', true);
        const removed = await db.removeReactionRole(id, guildId);
        await interaction.reply({ ...cv2Text(removed ? '✅ Reaction role removed.' : '❌ No reaction role found with that ID.'), flags: IS_CV2 | MessageFlags.Ephemeral });
      } else if (sub === 'clear') {
        const link = interaction.options.getString('message_link', true);
        const parsed = parseMessageLink(link);
        if (!parsed) { await interaction.reply({ ...cv2Text('❌ Invalid message link.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return; }
        await db.clearReactionRolesForMessage(guildId, parsed.messageId);
        await interaction.reply({ ...cv2Text('✅ All reaction roles cleared for that message.'), flags: IS_CV2 | MessageFlags.Ephemeral });
      } else {
        const all = await db.getReactionRoles(guildId);
        if (!all.length) { await interaction.reply({ ...cv2Text('No reaction roles configured.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return; }
        const container = new ContainerBuilder().setAccentColor(Colors.Blurple)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Reaction Roles**\n\n${all.map(r => `**ID ${r.id}** — ${r.emoji} → <@&${r.role_id}> on [message](https://discord.com/channels/${guildId}/${r.channel_id}/${r.message_id})`).join('\n')}`
          ));
        await interaction.reply({ flags: IS_CV2 | MessageFlags.Ephemeral, components: [container] });
      }
    }
  },
};

export default Roles;
