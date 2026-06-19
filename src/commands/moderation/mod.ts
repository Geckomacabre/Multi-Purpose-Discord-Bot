import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Collection, Colors,
  ContainerBuilder, InteractionContextType, Message, MessageFlags,
  PermissionFlagsBits, SlashCommandBuilder, TextChannel, TextDisplayBuilder,
} from 'discord.js';
import * as db from '../../utils/db';
import Config from '../../config';
import { Command } from '../../interfaces/command';
import { cv2Text } from '../../utils/components.js';

const IS_CV2 = MessageFlags.IsComponentsV2;

function parseDuration(s: string): number | null {
  const m = /^(\d+)(s|m|h|d|w)$/i.exec(s.trim());
  if (!m) return null;
  const n = parseInt(m[1]);
  const units: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return n * (units[m[2].toLowerCase()] ?? 0) || null;
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

const TYPE_COLORS: Record<string, number> = {
  ban: Colors.Red, unban: Colors.Green, kick: Colors.Orange,
  timeout: Colors.Yellow, removetimeout: Colors.Green, warn: Colors.Yellow, report: Colors.Blue,
};

async function sendModCase(
  interaction: ChatInputCommandInteraction,
  modCase: { case_num: number; type: string; user_tag: string; user_id: string; expires_at?: number | null },
  user: { tag: string; id: string },
  extras: string[] = [],
) {
  const color = TYPE_COLORS[modCase.type] ?? Colors.Grey;
  const lines = [
    `**Case #${modCase.case_num} — ${capitalize(modCase.type)}**`,
    `**User:** ${user.tag} (${user.id})`,
    `**Moderator:** ${interaction.user.tag}`,
    ...extras,
    ...(modCase.expires_at ? [`**Expires:** <t:${Math.floor(modCase.expires_at / 1000)}:R>`] : []),
  ];
  const container = new ContainerBuilder().setAccentColor(color)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
  await interaction.editReply({ flags: IS_CV2, components: [container] });

  const cfg = await db.getModConfig(interaction.guildId!);
  if (cfg.modlog_channel_id) {
    const ch = await interaction.guild!.channels.fetch(cfg.modlog_channel_id).catch(() => null) as TextChannel | null;
    await ch?.send({ flags: IS_CV2, components: [container] }).catch(() => {});
  }
}

const Mod: Command = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Moderation commands')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    // ── Actions ──────────────────────────────────────────────────────────────
    .addSubcommand(s => s.setName('ban').setDescription('Ban a member from the server')
      .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason for the ban'))
      .addIntegerOption(o => o.setName('days').setDescription('Days of messages to delete (0-7)').setMinValue(0).setMaxValue(7))
      .addStringOption(o => o.setName('duration').setDescription('Temp ban duration (e.g. 1d, 12h). Leave blank for permanent.')))
    .addSubcommand(s => s.setName('unban').setDescription('Unban a user by ID')
      .addStringOption(o => o.setName('user_id').setDescription('User ID to unban').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason')))
    .addSubcommand(s => s.setName('kick').setDescription('Kick a member from the server')
      .addUserOption(o => o.setName('user').setDescription('Member to kick').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason for the kick')))
    .addSubcommand(s => s.setName('timeout').setDescription('Timeout a member (max 28 days)')
      .addUserOption(o => o.setName('user').setDescription('Member to timeout').setRequired(true))
      .addStringOption(o => o.setName('duration').setDescription('Duration (e.g. 10m, 1h, 7d)').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason')))
    .addSubcommand(s => s.setName('untimeout').setDescription('Remove a timeout from a member')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason')))
    .addSubcommand(s => s.setName('warn').setDescription('Warn a member')
      .addUserOption(o => o.setName('user').setDescription('Member to warn').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)))
    .addSubcommand(s => s.setName('purge').setDescription('Bulk delete messages with optional filters')
      .addIntegerOption(o => o.setName('amount').setDescription('Number of messages to scan (max 200)').setRequired(true).setMinValue(1).setMaxValue(200))
      .addUserOption(o => o.setName('user').setDescription('Only delete messages from this user'))
      .addStringOption(o => o.setName('keyword').setDescription('Only delete messages containing this text'))
      .addBooleanOption(o => o.setName('bots').setDescription('Only delete bot messages'))
      .addBooleanOption(o => o.setName('attachments').setDescription('Only delete messages with attachments'))
      .addBooleanOption(o => o.setName('embeds').setDescription('Only delete messages with embeds')))
    .addSubcommand(s => s.setName('report').setDescription("Report a member to the server's staff")
      .addUserOption(o => o.setName('user').setDescription('Member to report').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason for the report').setRequired(true)))
    .addSubcommand(s => s.setName('case').setDescription('View a mod case')
      .addIntegerOption(o => o.setName('number').setDescription('Case number').setRequired(true)))
    .addSubcommand(s => s.setName('reason').setDescription('Edit the reason for a mod case')
      .addIntegerOption(o => o.setName('case').setDescription('Case number').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('New reason').setRequired(true)))
    // ── Warnings group ────────────────────────────────────────────────────────
    .addSubcommandGroup(g => g.setName('warnings').setDescription('View and manage user warnings')
      .addSubcommand(s => s.setName('list').setDescription('List warnings for a user')
        .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(true)))
      .addSubcommand(s => s.setName('clear').setDescription('Clear all warnings for a user')
        .addUserOption(o => o.setName('user').setDescription('User to clear').setRequired(true)))
      .addSubcommand(s => s.setName('delete').setDescription('Delete a specific warning by ID')
        .addIntegerOption(o => o.setName('id').setDescription('Warning ID').setRequired(true))))
    // ── Config group ──────────────────────────────────────────────────────────
    .addSubcommandGroup(g => g.setName('config').setDescription('Configure moderation settings')
      .addSubcommand(s => s.setName('modlog').setDescription('Set the modlog channel')
        .addChannelOption(o => o.setName('channel').setDescription('Channel for mod logs (omit to clear)')))
      .addSubcommand(s => s.setName('dm').setDescription('Toggle DM notifications to punished users')
        .addBooleanOption(o => o.setName('enabled').setDescription('Enable/disable DMs').setRequired(true)))
      .addSubcommand(s => s.setName('view').setDescription('View current moderation settings'))) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    // ── Warnings group ────────────────────────────────────────────────────────
    if (group === 'warnings') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
        await interaction.reply({ ...cv2Text('❌ You need **Moderate Members** to manage warnings.'), flags: IS_CV2 | MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (sub === 'clear') {
        const user = interaction.options.getUser('user', true);
        const count = await db.clearWarnings(guildId, user.id);
        await interaction.editReply(cv2Text(`✅ Cleared **${count}** warning(s) for ${user.tag}.`));
      } else if (sub === 'delete') {
        const id = interaction.options.getInteger('id', true);
        const deleted = await db.deleteWarning(id, guildId);
        await interaction.editReply(cv2Text(deleted ? `✅ Warning #${id} deleted.` : `❌ Warning #${id} not found.`));
      } else {
        const user = interaction.options.getUser('user', true);
        const warnings = await db.getWarnings(guildId, user.id);
        if (!warnings.length) { await interaction.editReply(cv2Text(`✅ **${user.tag}** has no warnings.`)); return; }
        const lines = warnings.slice(0, 25).map(w =>
          `**#${w.id}** — <t:${Math.floor(w.created_at / 1000)}:d> by <@${w.mod_id}>\n${w.reason}`
        );
        const container = new ContainerBuilder().setAccentColor(Colors.Yellow)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Warnings for ${user.tag}** (${warnings.length} total)\n\n${lines.join('\n\n')}`
          ));
        await interaction.editReply({ flags: IS_CV2, components: [container] });
      }
      return;
    }

    // ── Config group ──────────────────────────────────────────────────────────
    if (group === 'config') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ ...cv2Text('❌ You need **Manage Server** to configure moderation.'), flags: IS_CV2 | MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (sub === 'modlog') {
        const channel = interaction.options.getChannel('channel');
        await db.setModlogChannel(guildId, channel?.id ?? null);
        await interaction.editReply(cv2Text(channel ? `✅ Modlog channel set to <#${channel.id}>.` : '✅ Modlog channel cleared.'));
      } else if (sub === 'dm') {
        const enabled = interaction.options.getBoolean('enabled', true);
        await db.ensureConfig(guildId);
        await db.db`INSERT OR IGNORE INTO mod_config (guild_id) VALUES (${guildId})`;
        await db.db`UPDATE mod_config SET dm_on_punish = ${enabled ? 1 : 0} WHERE guild_id = ${guildId}`;
        await interaction.editReply(cv2Text(`✅ DM on punish ${enabled ? 'enabled' : 'disabled'}.`));
      } else {
        const cfg = await db.getModConfig(guildId);
        const container = new ContainerBuilder().setAccentColor(Colors.Blue)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Moderation Config**\n**Modlog Channel:** ${cfg.modlog_channel_id ? `<#${cfg.modlog_channel_id}>` : 'Not set'}\n**DM on Punish:** ${cfg.dm_on_punish ? 'Enabled' : 'Disabled'}\n**Next Case #:** ${cfg.next_case_num}`
          ));
        await interaction.editReply({ flags: IS_CV2, components: [container] });
      }
      return;
    }

    // ── Flat subcommands ──────────────────────────────────────────────────────

    if (sub === 'ban') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
        await interaction.reply({ ...cv2Text('❌ You need **Ban Members** to use this command.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return;
      }
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') ?? 'No reason provided';
      const days = interaction.options.getInteger('days') ?? 0;
      const durationStr = interaction.options.getString('duration');
      await interaction.deferReply();

      let expiresAt: number | null = null;
      if (durationStr) {
        const ms = parseDuration(durationStr);
        if (!ms) { await interaction.editReply(cv2Text('❌ Invalid duration. Use formats like `1d`, `12h`, `30m`.')); return; }
        expiresAt = Date.now() + ms;
      }
      const member = await interaction.guild!.members.fetch(user.id).catch(() => null);
      if (member) {
        if (!member.bannable) { await interaction.editReply(cv2Text('❌ I cannot ban this user.')); return; }
        if (member.roles.highest.position >= interaction.guild!.members.me!.roles.highest.position) {
          await interaction.editReply(cv2Text('❌ That user has a higher or equal role than me.')); return;
        }
      }
      const cfg = await db.getModConfig(guildId);
      if (cfg.dm_on_punish) {
        await user.send(`You have been **banned** from **${interaction.guild!.name}**.\nReason: ${reason}${expiresAt ? `\nExpires: <t:${Math.floor(expiresAt / 1000)}:R>` : ''}`).catch(() => {});
      }
      try { await interaction.guild!.members.ban(user.id, { reason, deleteMessageSeconds: days * 86400 }); }
      catch { await interaction.editReply(cv2Text('❌ Failed to ban user. Check my permissions.')); return; }
      const modCase = await db.createModCase(guildId, 'ban', user.id, user.tag, interaction.user.id, interaction.user.tag, reason, expiresAt);
      if (expiresAt) await db.createScheduledTask('unban', expiresAt, { guild_id: guildId, user_id: user.id, data: { caseNum: modCase.case_num } });
      await sendModCase(interaction, modCase, user, [`**Reason:** ${reason}`, ...(days > 0 ? [`**Messages Deleted:** ${days}d`] : [])]);
      return;
    }

    if (sub === 'unban') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
        await interaction.reply({ ...cv2Text('❌ You need **Ban Members** to use this command.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return;
      }
      const userId = interaction.options.getString('user_id', true);
      const reason = interaction.options.getString('reason') ?? 'No reason provided';
      await interaction.deferReply();
      try { await interaction.guild!.members.unban(userId, reason); }
      catch { await interaction.editReply(cv2Text('❌ Could not unban that user. They may not be banned or the ID is invalid.')); return; }
      let userTag = userId;
      try { const u = await interaction.client.users.fetch(userId); userTag = u.tag; } catch {}
      const modCase = await db.createModCase(guildId, 'unban', userId, userTag, interaction.user.id, interaction.user.tag, reason);
      await sendModCase(interaction, modCase, { tag: userTag, id: userId }, [`**Reason:** ${reason}`]);
      return;
    }

    if (sub === 'kick') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.KickMembers)) {
        await interaction.reply({ ...cv2Text('❌ You need **Kick Members** to use this command.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return;
      }
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') ?? 'No reason provided';
      await interaction.deferReply();
      const member = await interaction.guild!.members.fetch(user.id).catch(() => null);
      if (!member) { await interaction.editReply(cv2Text('❌ Could not find that member in this server.')); return; }
      if (!member.kickable) { await interaction.editReply(cv2Text('❌ I cannot kick this user.')); return; }
      const cfg = await db.getModConfig(guildId);
      if (cfg.dm_on_punish) {
        await user.send(`You have been **kicked** from **${interaction.guild!.name}**.\nReason: ${reason}`).catch(() => {});
      }
      await member.kick(reason);
      const modCase = await db.createModCase(guildId, 'kick', user.id, user.tag, interaction.user.id, interaction.user.tag, reason);
      await sendModCase(interaction, modCase, user, [`**Reason:** ${reason}`]);
      return;
    }

    if (sub === 'timeout') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
        await interaction.reply({ ...cv2Text('❌ You need **Moderate Members** to use this command.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return;
      }
      const user = interaction.options.getUser('user', true);
      const durationStr = interaction.options.getString('duration', true);
      const reason = interaction.options.getString('reason') ?? 'No reason provided';
      await interaction.deferReply();
      const ms = parseDuration(durationStr);
      if (!ms || ms > 28 * 86400000) { await interaction.editReply(cv2Text('❌ Invalid duration. Use formats like `10m`, `1h`, `7d` (max 28d).')); return; }
      const member = await interaction.guild!.members.fetch(user.id).catch(() => null);
      if (!member) { await interaction.editReply(cv2Text('❌ Could not find that member.')); return; }
      if (!member.moderatable) { await interaction.editReply(cv2Text('❌ I cannot timeout this user.')); return; }
      const cfg = await db.getModConfig(guildId);
      if (cfg.dm_on_punish) {
        const until = Math.floor((Date.now() + ms) / 1000);
        await user.send(`You have been **timed out** in **${interaction.guild!.name}** until <t:${until}:R>.\nReason: ${reason}`).catch(() => {});
      }
      await member.timeout(ms, reason);
      const expiresAt = Date.now() + ms;
      const modCase = await db.createModCase(guildId, 'timeout', user.id, user.tag, interaction.user.id, interaction.user.tag, reason, expiresAt);
      await sendModCase(interaction, modCase, user, [`**Duration:** ${durationStr}`, `**Reason:** ${reason}`]);
      return;
    }

    if (sub === 'untimeout') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
        await interaction.reply({ ...cv2Text('❌ You need **Moderate Members** to use this command.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return;
      }
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') ?? 'No reason provided';
      await interaction.deferReply();
      const member = await interaction.guild!.members.fetch(user.id).catch(() => null);
      if (!member) { await interaction.editReply(cv2Text('❌ Could not find that member.')); return; }
      await member.timeout(null, reason);
      const modCase = await db.createModCase(guildId, 'removetimeout', user.id, user.tag, interaction.user.id, interaction.user.tag, reason);
      await sendModCase(interaction, modCase, user, [`**Reason:** ${reason}`]);
      return;
    }

    if (sub === 'warn') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
        await interaction.reply({ ...cv2Text('❌ You need **Moderate Members** to use this command.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return;
      }
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason', true);
      await interaction.deferReply();
      if (user.bot) { await interaction.editReply(cv2Text('❌ You cannot warn a bot.')); return; }
      await db.addWarning(guildId, user.id, interaction.user.id, reason);
      const modCase = await db.createModCase(guildId, 'warn', user.id, user.tag, interaction.user.id, interaction.user.tag, reason);
      const cfg = await db.getModConfig(guildId);
      if (cfg.dm_on_punish) {
        await user.send(`You have received a **warning** in **${interaction.guild!.name}**.\nReason: ${reason}`).catch(() => {});
      }
      const warnings = await db.getWarnings(guildId, user.id);
      await sendModCase(interaction, modCase, user, [`**Reason:** ${reason}`, `**Total Warnings:** ${warnings.length}`]);
      return;
    }

    if (sub === 'purge') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
        await interaction.reply({ ...cv2Text('❌ You need **Manage Messages** to use this command.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return;
      }
      const amount = interaction.options.getInteger('amount', true);
      const filterUser = interaction.options.getUser('user');
      const keyword = interaction.options.getString('keyword')?.toLowerCase();
      const botsOnly = interaction.options.getBoolean('bots') ?? false;
      const attachmentsOnly = interaction.options.getBoolean('attachments') ?? false;
      const embedsOnly = interaction.options.getBoolean('embeds') ?? false;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const channel = interaction.channel as TextChannel;
      const fetched = await channel.messages.fetch({ limit: amount });
      const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
      let toDelete: Collection<string, Message> = fetched.filter(m => m.createdTimestamp > twoWeeksAgo);
      if (filterUser) toDelete = toDelete.filter(m => m.author.id === filterUser.id);
      if (keyword) toDelete = toDelete.filter(m => m.content.toLowerCase().includes(keyword));
      if (botsOnly) toDelete = toDelete.filter(m => m.author.bot);
      if (attachmentsOnly) toDelete = toDelete.filter(m => m.attachments.size > 0);
      if (embedsOnly) toDelete = toDelete.filter(m => m.embeds.length > 0);
      if (!toDelete.size) { await interaction.editReply(cv2Text('No messages matched your filters (or they are older than 14 days).')); return; }
      const deleted = await channel.bulkDelete(toDelete, true);
      await interaction.editReply(cv2Text(`✅ Deleted **${deleted.size}** message${deleted.size === 1 ? '' : 's'}.`));
      return;
    }

    if (sub === 'report') {
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason', true);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const cfg = await db.getModConfig(guildId);
      const channelId = cfg.modlog_channel_id ?? Config.REPORT_CHANNEL_ID;
      if (!channelId) { await interaction.editReply(cv2Text('❌ No report channel configured. Ask an admin to set a modlog channel with `/mod config modlog`.')); return; }
      const ch = await interaction.guild!.channels.fetch(channelId).catch(() => null) as TextChannel | null;
      if (!ch) { await interaction.editReply(cv2Text('❌ Report channel not found. Contact an admin.')); return; }
      const modCase = await db.createModCase(guildId, 'report', user.id, user.tag, interaction.user.id, interaction.user.tag, reason);
      const container = new ContainerBuilder().setAccentColor(Colors.Blue)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `**Case #${modCase.case_num} — Report**\n**Reported User:** ${user.tag} (${user.id})\n**Reporter:** ${interaction.user.tag}\n**Channel:** <#${interaction.channelId}>\n**Reason:** ${reason}`
        ));
      await ch.send({ flags: IS_CV2, components: [container] }).catch(() => {});
      await interaction.editReply(cv2Text('✅ Your report has been submitted to the moderation team.'));
      return;
    }

    if (sub === 'case') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
        await interaction.reply({ ...cv2Text('❌ You need **Moderate Members** to view mod cases.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return;
      }
      const caseNum = interaction.options.getInteger('number', true);
      const modCase = await db.getModCase(guildId, caseNum);
      if (!modCase) { await interaction.reply({ ...cv2Text(`❌ Case #${caseNum} not found.`), flags: IS_CV2 | MessageFlags.Ephemeral }); return; }
      const color = TYPE_COLORS[modCase.type] ?? Colors.Grey;
      const container = new ContainerBuilder().setAccentColor(color)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          [
            `**Case #${modCase.case_num} — ${capitalize(modCase.type)}**`,
            `**User:** ${modCase.user_tag} (${modCase.user_id})`,
            `**Moderator:** ${modCase.mod_tag} (${modCase.mod_id})`,
            `**Reason:** ${modCase.reason ?? 'No reason provided'}`,
            `**Date:** <t:${Math.floor(modCase.created_at / 1000)}:F>`,
            ...(modCase.expires_at ? [`**Expires:** <t:${Math.floor(modCase.expires_at / 1000)}:R>`] : []),
          ].join('\n')
        ));
      await interaction.reply({ flags: IS_CV2, components: [container] });
      return;
    }

    if (sub === 'reason') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
        await interaction.reply({ ...cv2Text('❌ You need **Moderate Members** to edit case reasons.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return;
      }
      const caseNum = interaction.options.getInteger('case', true);
      const reason = interaction.options.getString('reason', true);
      const modCase = await db.getModCase(guildId, caseNum);
      if (!modCase) { await interaction.reply({ ...cv2Text(`❌ Case #${caseNum} not found.`), flags: IS_CV2 | MessageFlags.Ephemeral }); return; }
      await db.updateModCaseReason(guildId, caseNum, reason);
      await interaction.reply({ ...cv2Text(`✅ Updated reason for case #${caseNum}.`), flags: IS_CV2 | MessageFlags.Ephemeral });
    }
  },
};

export default Mod;
