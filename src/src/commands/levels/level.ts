import {
  ApplicationIntegrationType, ChannelType, ChatInputCommandInteraction, Colors,
  ContainerBuilder, InteractionContextType, MessageFlags, PermissionFlagsBits,
  SlashCommandBuilder, TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getXp, calcLevelFromXp, getXpLeaderboard, getLevelRoles, addLevelRole, removeLevelRole, getXpConfig, setXpConfig } from '../../utils/db';
import { cv2Text } from '../../utils/components.js';

const IS_CV2 = MessageFlags.IsComponentsV2;

const Level: Command = {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('Leveling and XP commands')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(s => s.setName('rank').setDescription('View your or another user\'s level and XP')
      .addUserOption(o => o.setName('user').setDescription('User to check (default: yourself)')))
    .addSubcommand(s => s.setName('leaderboard').setDescription('Show the top chatters by XP and level')
      .addIntegerOption(o => o.setName('limit').setDescription('Number of users to show (default 10, max 25)').setMinValue(1).setMaxValue(25)))
    .addSubcommandGroup(g => g.setName('roles').setDescription('Manage level-up role rewards')
      .addSubcommand(s => s.setName('add').setDescription('Assign a role when a user reaches a specific level')
        .addIntegerOption(o => o.setName('level').setDescription('Level required').setRequired(true).setMinValue(1))
        .addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true)))
      .addSubcommand(s => s.setName('remove').setDescription('Remove a level role binding')
        .addIntegerOption(o => o.setName('id').setDescription('Binding ID from /level roles list').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('List all level role bindings')))
    .addSubcommandGroup(g => g.setName('config').setDescription('Configure the leveling / XP system')
      .addSubcommand(s => s.setName('toggle').setDescription('Enable or disable XP gain')
        .addBooleanOption(o => o.setName('enabled').setDescription('Enable XP?').setRequired(true)))
      .addSubcommand(s => s.setName('channel').setDescription('Set the channel for level-up announcements')
        .addChannelOption(o => o.setName('channel').setDescription('Announcement channel (leave blank to announce in the message channel)').addChannelTypes(ChannelType.GuildText)))
      .addSubcommand(s => s.setName('xp').setDescription('Set XP per message and cooldown')
        .addIntegerOption(o => o.setName('min').setDescription('Minimum XP per message (default 15)').setMinValue(1))
        .addIntegerOption(o => o.setName('max').setDescription('Maximum XP per message (default 25)').setMinValue(1))
        .addIntegerOption(o => o.setName('cooldown').setDescription('Cooldown between XP awards in seconds (default 60)').setMinValue(5)))
      .addSubcommand(s => s.setName('message').setDescription('Set the level-up announcement message')
        .addStringOption(o => o.setName('text').setDescription('Message text. Use {user}, {username}, {level}').setRequired(true)))
      .addSubcommand(s => s.setName('view').setDescription('View current leveling settings'))) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (group === 'roles') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.reply({ ...cv2Text('❌ You need **Manage Roles** to manage level roles.'), flags: IS_CV2 | MessageFlags.Ephemeral });
        return;
      }
      if (sub === 'add') {
        const level = interaction.options.getInteger('level', true);
        const role = interaction.options.getRole('role', true);
        const binding = await addLevelRole(guildId, level, role.id);
        await interaction.reply({ ...cv2Text(`✅ <@&${role.id}> will be assigned when users reach **level ${level}**. (ID: ${binding.id})`), flags: IS_CV2 | MessageFlags.Ephemeral });
      } else if (sub === 'remove') {
        const id = interaction.options.getInteger('id', true);
        const removed = await removeLevelRole(id, guildId);
        await interaction.reply({ ...cv2Text(removed ? `✅ Level role binding #${id} removed.` : `❌ No binding found with ID ${id}.`), flags: IS_CV2 | MessageFlags.Ephemeral });
      } else {
        const rows = await getLevelRoles(guildId);
        if (!rows.length) { await interaction.reply({ ...cv2Text('No level roles configured.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return; }
        const container = new ContainerBuilder()
          .setAccentColor(Colors.Blurple)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Level Roles**\n\n${rows.map(r => `**ID ${r.id}** — Level **${r.level}** → <@&${r.role_id}>`).join('\n')}`
          ));
        await interaction.reply({ flags: IS_CV2 | MessageFlags.Ephemeral, components: [container] });
      }
      return;
    }

    if (group === 'config') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ ...cv2Text('❌ You need **Manage Server** to configure leveling.'), flags: IS_CV2 | MessageFlags.Ephemeral });
        return;
      }
      if (sub === 'toggle') {
        const enabled = interaction.options.getBoolean('enabled', true);
        await setXpConfig(guildId, { enabled: enabled ? 1 : 0 });
        await interaction.reply({ ...cv2Text(`XP system **${enabled ? 'enabled' : 'disabled'}**.`), flags: IS_CV2 | MessageFlags.Ephemeral });
      } else if (sub === 'channel') {
        const channel = interaction.options.getChannel('channel');
        await setXpConfig(guildId, { level_up_channel_id: channel?.id ?? null });
        await interaction.reply({ ...cv2Text(channel ? `Level-up announcements will post in <#${channel.id}>.` : 'Level-up announcements will post in the channel where the user is chatting.'), flags: IS_CV2 | MessageFlags.Ephemeral });
      } else if (sub === 'xp') {
        const min = interaction.options.getInteger('min');
        const max = interaction.options.getInteger('max');
        const cooldown = interaction.options.getInteger('cooldown');
        if (min !== null && max !== null && min > max) { await interaction.reply({ ...cv2Text('❌ Min XP cannot be greater than max XP.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return; }
        const fields: any = {};
        if (min !== null) fields.xp_min = min;
        if (max !== null) fields.xp_max = max;
        if (cooldown !== null) fields.cooldown_seconds = cooldown;
        await setXpConfig(guildId, fields);
        await interaction.reply({ ...cv2Text('XP settings updated.'), flags: IS_CV2 | MessageFlags.Ephemeral });
      } else if (sub === 'message') {
        const text = interaction.options.getString('text', true);
        await setXpConfig(guildId, { level_up_message: text });
        await interaction.reply({ ...cv2Text(`Level-up message set to:\n> ${text}`), flags: IS_CV2 | MessageFlags.Ephemeral });
      } else {
        const cfg = await getXpConfig(guildId);
        const container = new ContainerBuilder()
          .setAccentColor(Colors.Blurple)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Leveling Config**\n**Status:** ${cfg.enabled ? '✅ Enabled' : '❌ Disabled'}\n**XP per Message:** ${cfg.xp_min}–${cfg.xp_max} XP\n**Cooldown:** ${cfg.cooldown_seconds}s\n**Announce Channel:** ${cfg.level_up_channel_id ? `<#${cfg.level_up_channel_id}>` : 'Message channel'}\n**Level-up Message:** ${cfg.level_up_message}`
          ));
        await interaction.reply({ flags: IS_CV2 | MessageFlags.Ephemeral, components: [container] });
      }
      return;
    }

    if (sub === 'rank') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const xpRow = await getXp(guildId, target.id);
      if (!xpRow || xpRow.xp === 0) {
        await interaction.reply({ ...cv2Text(target.id === interaction.user.id ? 'You haven\'t earned any XP yet — start chatting!' : `**${target.username}** hasn't earned any XP yet.`), flags: IS_CV2 | MessageFlags.Ephemeral });
        return;
      }
      const { level, currentXp, xpNeeded } = calcLevelFromXp(xpRow.xp);
      const progressPct = Math.round((currentXp / xpNeeded) * 100);
      const filled = Math.round(progressPct / 5);
      const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
      const container = new ContainerBuilder()
        .setAccentColor(Colors.Blurple)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `**${target.username} — Level ${level}**\n\n\`[${bar}]\` ${currentXp} / ${xpNeeded} XP (${progressPct}%)\n\n**Total XP:** ${xpRow.xp.toLocaleString()} | **Messages:** ${xpRow.total_messages.toLocaleString()}\n**Next Level:** Need **${(xpNeeded - currentXp).toLocaleString()}** more XP for level ${level + 1}`
        ));
      await interaction.reply({ flags: IS_CV2, components: [container] });
      return;
    }

    if (sub === 'leaderboard') {
      await interaction.deferReply();
      const limit = interaction.options.getInteger('limit') ?? 10;
      const rows = await getXpLeaderboard(guildId, limit);
      if (!rows.length) { await interaction.editReply(cv2Text('No XP data yet. Start chatting to earn XP!')); return; }
      const medals = ['🥇', '🥈', '🥉'];
      const lines = rows.map((row, i) => `${medals[i] ?? `**${i + 1}.**`} <@${row.user_id}> — **Level ${row.level}** (${row.xp.toLocaleString()} XP | ${row.total_messages.toLocaleString()} messages)`);
      const container = new ContainerBuilder()
        .setAccentColor(Colors.Blurple)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**🏆 XP Leaderboard**\n\n${lines.join('\n')}`));
      await interaction.editReply({ flags: IS_CV2, components: [container] });
    }
  },
};

export default Level;
