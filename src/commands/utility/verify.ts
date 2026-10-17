import {
  ActionRowBuilder, ApplicationIntegrationType, ButtonBuilder, ButtonStyle, ChannelType,
  ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
  type Guild, type Role, type APIRole,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getVerifyConfig, setVerifyConfig } from '../../utils/db';
import { VERIFY_EMOJI, getLockState, lockGuild, unlockGuild } from '../../features/verify';

/** Why the bot can't hand out this role, or null if it can. */
function roleProblem(guild: Guild, role: Role | APIRole): string | null {
  if (role.id === guild.id || ('managed' in role && role.managed)) return `<@&${role.id}> can't be assigned. Pick a normal role.`;
  const me = guild.members.me!;
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return '❌ I need the **Manage Roles** permission.';
  if (role.position >= me.roles.highest.position) return `❌ My highest role must be **above** <@&${role.id}> in Server Settings → Roles.`;
  return null;
}

function lockSummary(locked: number, failed: string[]) {
  let text = `🔒 Locked **${locked}** channels. Only the member role can see them now; channels already hidden from @everyone were left alone.`;
  if (failed.length) text += `\n⚠️ Couldn't edit: ${failed.slice(0, 20).join(', ')}. Check my permissions there.`;
  return text;
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
    .addSubcommand(s => s
      .setName('rules')
      .setDescription(`Members react ${VERIFY_EMOJI} on the rules post to get the member role`)
      .addChannelOption(o => o.setName('channel').setDescription('The rules channel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
      .addRoleOption(o => o.setName('member_role').setDescription('Role to assign on react').setRequired(true))
      .addStringOption(o => o.setName('message_id').setDescription('Your existing rules post (leave empty to have the bot post one)'))
      .addRoleOption(o => o.setName('unverified_role').setDescription('Role to remove when verified (optional)'))
      .addBooleanOption(o => o.setName('lock').setDescription('Hide all other channels until members verify (default: true)')))
    .addSubcommand(s => s
      .setName('lock')
      .setDescription('Hide all channels from members until they verify'))
    .addSubcommand(s => s
      .setName('unlock')
      .setDescription('Undo /verify lock and make channels public again'))
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
        const count = await unlockGuild(guild, prev);
        await interaction.editReply(`🔓 Unlocked **${count}** channels.`);
        return;
      }
      const { locked, failed } = await lockGuild(guild, prev);
      await interaction.editReply(lockSummary(locked, failed));
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
      if (lock || (prev && getLockState(prev))) {
        const cfg = (await getVerifyConfig(guildId))!;
        const { locked, failed } = await lockGuild(guild, cfg, prev?.member_role_id);
        reply += `\n${lockSummary(locked, failed)}`;
      }
      await interaction.editReply(reply);
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
    if (prev && getLockState(prev)) {
      const { locked, failed } = await lockGuild(guild, (await getVerifyConfig(guildId))!, prev.member_role_id);
      reply += `\n${lockSummary(locked, failed)}`;
    }
    await interaction.editReply(reply);
  },
};

export default VerifyCmd;
