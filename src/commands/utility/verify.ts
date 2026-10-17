import {
  ActionRowBuilder, ApplicationIntegrationType, ButtonBuilder, ButtonStyle, ChannelType,
  ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
  type Guild, type Role, type APIRole, type SlashCommandSubcommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { deleteVerifyConfig, getVerifyConfig, setVerifyConfig } from '../../utils/db';
import {
  VERIFY_EMOJI, applyExistingMembers, getLockState, lockGuild, unlockGuild, type ExistingMembers,
} from '../../features/verify';
import type { IVerifyConfig } from '../../utils/db';

/** Why the bot can't hand out this role, or null if it can. */
function roleProblem(guild: Guild, role: Role | APIRole): string | null {
  if (role.id === guild.id || ('managed' in role && role.managed)) return `<@&${role.id}> can't be assigned. Pick a normal role.`;
  const me = guild.members.me!;
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return '❌ I need the **Manage Roles** permission.';
  if (role.position >= me.roles.highest.position) return `❌ My highest role must be **above** <@&${role.id}> in Server Settings → Roles.`;
  return null;
}

const existingMembersOption = (s: SlashCommandSubcommandBuilder) => s
  .addStringOption(o => o.setName('existing_members')
    .setDescription('People already in the server (default on first lock: keep access)')
    .addChoices(
      { name: 'Keep access (give them the member role)', value: 'keep' },
      { name: `Must re-verify (remove the member role unless they reacted ${VERIFY_EMOJI})`, value: 'reverify' },
    ));

/** Edits the deferred reply at most every 3s, so long runs show they're still going. */
function progress(interaction: ChatInputCommandInteraction, label: string) {
  let last = 0;
  return async (done: number, total: number) => {
    if (done < total && Date.now() - last < 3000) return;
    last = Date.now();
    await interaction.editReply(`⏳ ${label}... ${done}/${total}`).catch(() => {});
  };
}

/** Final reply. Interaction tokens expire after 15 minutes, so fall back to a channel message. */
async function finish(interaction: ChatInputCommandInteraction, text: string) {
  const ok = await interaction.editReply(text).then(() => true, () => false);
  if (!ok && interaction.channel?.isSendable()) {
    await interaction.channel.send({ content: `<@${interaction.user.id}> ${text}`, allowedMentions: { users: [interaction.user.id] } }).catch(() => {});
  }
}

/**
 * Handles existing members, then locks every channel. `existing` defaults to
 * 'keep' on the first lock only, so re-running a lock never re-grants the role
 * to people who joined after it went up.
 */
async function runLock(
  interaction: ChatInputCommandInteraction, guild: Guild, cfg: IVerifyConfig,
  oldRoleId?: string, existing?: ExistingMembers | null,
) {
  const lines: string[] = [];
  const mode = existing ?? (getLockState(cfg) ? null : 'keep');
  if (mode) {
    const label = mode === 'keep' ? 'Giving current members the member role' : 'Removing the member role from members who haven\'t reacted';
    const changed = await applyExistingMembers(guild, cfg, mode, progress(interaction, label));
    lines.push(mode === 'keep'
      ? `👥 Grandfathered in **${changed}** existing members (gave them <@&${cfg.member_role_id}>).`
      : `👥 Removed <@&${cfg.member_role_id}> from **${changed}** members who haven't reacted ${VERIFY_EMOJI}. They'll need to verify.`);
  }

  const { locked, failed, skippedOnboarding } = await lockGuild(guild, cfg, oldRoleId, progress(interaction, 'Locking channels'));
  lines.push(`🔒 Locked **${locked}** channels. Only the member role and roles above mine can see them now; channels already hidden from @everyone were left alone.`);
  if (skippedOnboarding.length) {
    lines.push(`ℹ️ Left public (Discord requires Onboarding channels to stay visible): ${skippedOnboarding.slice(0, 20).join(', ')}. Remove them in Server Settings → Onboarding to lock them.`);
  }
  if (failed.length) lines.push(`⚠️ Couldn't edit: ${failed.slice(0, 20).join(', ')}. Check my permissions there.`);
  return lines.join('\n');
}

const VerifyCmd: Command = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verification gate setup')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(s => s
      .setName('setup')
      .setDescription('Post the verification button in a channel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to post the verify button in').setRequired(true))
      .addRoleOption(o => o.setName('member_role').setDescription('Role to assign when verified').setRequired(true))
      .addRoleOption(o => o.setName('unverified_role').setDescription('Role to remove when verified (optional)'))
      .addStringOption(o => o.setName('title').setDescription('Embed title').setRequired(false))
      .addStringOption(o => o.setName('description').setDescription('Embed description').setRequired(false)))
    .addSubcommand(s => existingMembersOption(s
      .setName('rules')
      .setDescription(`Members react ${VERIFY_EMOJI} on the rules post to get the member role`)
      .addChannelOption(o => o.setName('channel').setDescription('The rules channel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
      .addRoleOption(o => o.setName('member_role').setDescription('Role to assign on react').setRequired(true))
      .addStringOption(o => o.setName('message_id').setDescription('Your existing rules post (leave empty to have the bot post one)'))
      .addRoleOption(o => o.setName('unverified_role').setDescription('Role to remove when verified (optional)'))
      .addBooleanOption(o => o.setName('lock').setDescription('Hide all other channels until members verify (default: true)'))))
    .addSubcommand(s => existingMembersOption(s
      .setName('lock')
      .setDescription('Hide all channels from members until they verify')))
    .addSubcommand(s => s
      .setName('unlock')
      .setDescription('Undo /verify lock and make channels public again'))
    .addSubcommand(s => s
      .setName('remove')
      .setDescription(`Turn off verification: unlock channels and clear the ${VERIFY_EMOJI} reactions (members keep their role)`))
    .addSubcommand(s => s
      .setName('config')
      .setDescription('Show current verify config')) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild!;
    const guildId = guild.id;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const prev = await getVerifyConfig(guildId);

    if (sub === 'config') {
      if (!prev) {
        await interaction.editReply('No verify config set up. Use `/verify setup` or `/verify rules` first.');
        return;
      }
      const state = getLockState(prev);
      await interaction.editReply(
        `**Verify Config**\nChannel: <#${prev.channel_id}>\nMember role: <@&${prev.member_role_id}>\nUnverified role: ${prev.unverified_role_id ? `<@&${prev.unverified_role_id}>` : 'None'}`
        + `\nChannel lock: ${state ? `on (${Object.keys(state).length} channels)` : 'off'}`
      );
      return;
    }

    if (sub === 'remove') {
      if (!prev) {
        await interaction.editReply('Verification isn\'t set up here.');
        return;
      }
      const lines: string[] = [];
      // Delete the config first so clearing reactions below can't revoke anyone's role
      await deleteVerifyConfig(guildId);
      if (getLockState(prev)) lines.push(`🔓 Unlocked **${await unlockGuild(guild, prev, progress(interaction, 'Unlocking channels'))}** channels.`);

      const channel = await guild.channels.fetch(prev.channel_id).catch(() => null);
      const msg = channel?.isTextBased() && prev.message_id
        ? await channel.messages.fetch(prev.message_id).catch(() => null)
        : null;
      const reaction = msg?.reactions.cache.get(VERIFY_EMOJI);
      if (reaction) {
        const cleared = await reaction.remove().then(() => true).catch(() => false);
        lines.push(cleared
          ? `🧹 Cleared the ${VERIFY_EMOJI} reactions from [the rules post](${msg!.url}).`
          : `⚠️ Couldn't clear the ${VERIFY_EMOJI} reactions. I need **Manage Messages** in <#${prev.channel_id}>.`);
      }
      lines.push(`✅ Verification is off. Members keep <@&${prev.member_role_id}>.`);
      await finish(interaction, lines.join('\n'));
      return;
    }

    if (sub === 'lock' || sub === 'unlock') {
      if (!prev?.member_role_id) {
        await interaction.editReply('Set up verification first with `/verify rules` or `/verify setup`.');
        return;
      }
      if (!guild.members.me!.permissions.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.editReply('❌ I need the **Manage Roles** permission to edit channel permissions.');
        return;
      }
      if (sub === 'unlock') {
        if (!getLockState(prev)) {
          await interaction.editReply('Channels aren\'t locked.');
          return;
        }
        const count = await unlockGuild(guild, prev, progress(interaction, 'Unlocking channels'));
        await finish(interaction, `🔓 Unlocked **${count}** channels.`);
        return;
      }
      const existing = interaction.options.getString('existing_members') as ExistingMembers | null;
      await finish(interaction, await runLock(interaction, guild, prev, undefined, existing));
      return;
    }

    const memberRole = interaction.options.getRole('member_role', true);
    const unverifiedRole = interaction.options.getRole('unverified_role');
    const problem = roleProblem(guild, memberRole) ?? (unverifiedRole && roleProblem(guild, unverifiedRole));
    if (problem) {
      await interaction.editReply(problem);
      return;
    }
    const channel = interaction.options.getChannel('channel', true) as any;

    if (sub === 'rules') {
      const messageId = interaction.options.getString('message_id');
      const lock = interaction.options.getBoolean('lock') ?? true;

      let msg: any;
      if (messageId) {
        msg = await channel.messages.fetch(messageId).catch(() => null);
        if (!msg) {
          await interaction.editReply(`❌ Couldn't find message \`${messageId}\` in <#${channel.id}>.`);
          return;
        }
      } else {
        msg = await channel.send({
          embeds: [new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('📜 Accept the rules')
            .setDescription(`Read the rules above, then react with ${VERIFY_EMOJI} below to unlock the server.`)],
        }).catch(() => null);
        if (!msg) {
          await interaction.editReply('❌ Could not post in that channel. Make sure I have Send Messages permission there.');
          return;
        }
      }
      try {
        await msg.react(VERIFY_EMOJI);
      } catch {
        await interaction.editReply('❌ Could not react to that message. Make sure I have Add Reactions and Read Message History there.');
        return;
      }

      await setVerifyConfig(guildId, {
        channel_id: channel.id,
        message_id: msg.id,
        member_role_id: memberRole.id,
        unverified_role_id: unverifiedRole?.id ?? null,
      });

      let reply = `✅ Members who react ${VERIFY_EMOJI} on [the rules post](${msg.url}) get <@&${memberRole.id}>. Removing the reaction takes it away.`;
      const existing = interaction.options.getString('existing_members') as ExistingMembers | null;
      const cfg = (await getVerifyConfig(guildId))!;
      if (lock || getLockState(cfg)) {
        reply += `\n${await runLock(interaction, guild, cfg, prev?.member_role_id, existing)}`;
      } else if (existing) {
        const changed = await applyExistingMembers(guild, cfg, existing, progress(interaction, 'Updating existing members'));
        reply += `\n👥 ${existing === 'keep' ? 'Gave' : 'Removed'} <@&${memberRole.id}> ${existing === 'keep' ? 'to' : 'from'} **${changed}** existing members.`;
      }
      await finish(interaction, reply);
      return;
    }

    // setup
    const title = interaction.options.getString('title') ?? '✅ Verify to gain access';
    const description = interaction.options.getString('description') ??
      'Click the **Verify** button below to confirm you are human and unlock the server.';

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle(title)
      .setDescription(description);

    const button = new ButtonBuilder()
      .setCustomId('verify_btn')
      .setLabel('Verify')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    let msg: any;
    try {
      msg = await channel.send({ embeds: [embed], components: [row] });
    } catch {
      await interaction.editReply('❌ Could not post in that channel. Make sure I have Send Messages permission there.');
      return;
    }

    await setVerifyConfig(guildId, {
      channel_id: channel.id,
      message_id: msg.id,
      member_role_id: memberRole.id,
      unverified_role_id: unverifiedRole?.id ?? null,
    });

    let reply = `✅ Verify button posted in <#${channel.id}>.\nMember role: <@&${memberRole.id}>${unverifiedRole ? `\nUnverified role removed on verify: <@&${unverifiedRole.id}>` : ''}`;
    // Already locked: move the lock to the new gate channel/role
    const cfg = (await getVerifyConfig(guildId))!;
    if (getLockState(cfg)) reply += `\n${await runLock(interaction, guild, cfg, prev?.member_role_id)}`;
    await finish(interaction, reply);
  },
};

export default VerifyCmd;
