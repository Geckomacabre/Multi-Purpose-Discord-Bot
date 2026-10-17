import {
  ApplicationIntegrationType, ChannelType, ChatInputCommandInteraction, GuildMember,
  InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getTempVoiceConfig, removeTempVoiceConfig, setTempVoiceConfig } from '../../utils/db';
import {
  claimTempVoice, lockTempVoice, permitTempVoice, rejectTempVoice, unlockTempVoice,
} from '../../features/tempvoice';

const TempVoiceCmd: Command = {
  data: new SlashCommandBuilder()
    .setName('tempvoice')
    .setDescription('Join-to-create voice channels')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(s => s
      .setName('setup')
      .setDescription('Members who join this voice channel get their own channel (admin)')
      .addChannelOption(o => o.setName('channel').setDescription('The "join to create" channel (leave empty to have me make one)')
        .addChannelTypes(ChannelType.GuildVoice))
      .addChannelOption(o => o.setName('category').setDescription('Where new channels go (default: the same category)')
        .addChannelTypes(ChannelType.GuildCategory))
      .addStringOption(o => o.setName('name').setDescription('Channel name, {user} is their name (default: {user})').setMaxLength(90)))
    .addSubcommand(s => s
      .setName('disable')
      .setDescription('Stop creating voice channels (admin)'))
    .addSubcommand(s => s
      .setName('lock')
      .setDescription('Only staff and people you permit can join your voice channel'))
    .addSubcommand(s => s
      .setName('unlock')
      .setDescription('Let anyone join your voice channel again'))
    .addSubcommand(s => s
      .setName('permit')
      .setDescription('Let someone join your voice channel, even while it\'s locked')
      .addUserOption(o => o.setName('user').setDescription('Who to let in').setRequired(true)))
    .addSubcommand(s => s
      .setName('reject')
      .setDescription('Block someone from your voice channel and disconnect them')
      .addUserOption(o => o.setName('user').setDescription('Who to block').setRequired(true)))
    .addSubcommand(s => s
      .setName('claim')
      .setDescription('Take over the voice channel you\'re in after its owner leaves')) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild!;
    const member = interaction.member as GuildMember;

    const ownerActions: Record<string, () => Promise<string>> = {
      claim: () => claimTempVoice(member),
      lock: () => lockTempVoice(member),
      unlock: () => unlockTempVoice(member),
      permit: async () => {
        const target = interaction.options.getMember('user') as GuildMember | null;
        return target ? permitTempVoice(member, target) : '❌ That user isn\'t in this server.';
      },
      reject: async () => {
        const target = interaction.options.getMember('user') as GuildMember | null;
        return target ? rejectTempVoice(member, target) : '❌ That user isn\'t in this server.';
      },
    };
    if (ownerActions[sub]) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.editReply(await ownerActions[sub]());
      return;
    }

    // setup and disable are admin-only; claim has to stay open to everyone, so check here
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: '❌ You need **Manage Server** to do that.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'disable') {
      const removed = await removeTempVoiceConfig(guild.id);
      await interaction.reply({
        content: removed ? '✅ Join-to-create is off. Existing channels are deleted as they empty.' : 'Join-to-create isn\'t set up.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const me = guild.members.me!;
    const missing = [
      [PermissionFlagsBits.ManageChannels, 'Manage Channels'],
      [PermissionFlagsBits.ManageRoles, 'Manage Roles'],
      [PermissionFlagsBits.MoveMembers, 'Move Members'],
    ].filter(([p]) => !me.permissions.has(p as bigint)).map(([, label]) => `**${label}**`);
    if (missing.length) {
      await interaction.editReply(`❌ I need ${missing.join(', ')} for this.`);
      return;
    }

    const category = interaction.options.getChannel('category');
    const name = interaction.options.getString('name')?.trim() || '{user}';
    let hub = interaction.options.getChannel('channel');
    if (!hub) {
      hub = await guild.channels.create({
        name: '➕ Join to Create',
        type: ChannelType.GuildVoice,
        parent: category?.id,
        reason: 'Join-to-create voice hub',
      }).catch(() => null);
      if (!hub) {
        await interaction.editReply('❌ I couldn\'t create the channel. Check my permissions.');
        return;
      }
    }

    const prev = await getTempVoiceConfig(guild.id);
    await setTempVoiceConfig(guild.id, hub.id, category?.id ?? null, name);
    await interaction.editReply(
      `✅ Joining <#${hub.id}> now creates a voice channel named **${name.replaceAll('{user}', member.displayName)}** for that member`
      + `${category ? ` in **${category.name}**` : ''}, moves them in, and deletes it once everyone leaves.`
      + `\nOwners can rename it, set a user limit and disconnect people, and pick who can join with \`/tempvoice lock\`, \`unlock\`, \`permit\` and \`reject\`. Staff can always join.`
      + `\nIf the owner leaves, anyone still in the channel can take it over with \`/tempvoice claim\`.`
      + (prev && prev.hub_channel_id !== hub.id ? `\n(Replaced the old hub <#${prev.hub_channel_id}>.)` : ''),
    );
  },
};

export default TempVoiceCmd;
