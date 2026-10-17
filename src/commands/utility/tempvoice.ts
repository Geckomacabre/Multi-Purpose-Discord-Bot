import {
  ApplicationIntegrationType, ChannelType, ChatInputCommandInteraction, GuildMember,
  InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getTempVoiceConfig, removeTempVoiceConfig, setTempVoiceConfig } from '../../utils/db';
import { claimTempVoice } from '../../features/tempvoice';

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
      .setName('claim')
      .setDescription('Take over the voice channel you\'re in after its owner leaves')) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild!;

    if (sub === 'claim') {
      const reply = await claimTempVoice(interaction.member as GuildMember);
      await interaction.reply({ content: reply, flags: MessageFlags.Ephemeral });
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
      `✅ Joining <#${hub.id}> now creates a voice channel named **${name.replaceAll('{user}', interaction.user.displayName)}** for that member`
      + `${category ? ` in **${category.name}**` : ''}, gives them full control of it, and deletes it once everyone leaves.`
      + `\nIf the owner leaves, anyone still in the channel can take it over with \`/tempvoice claim\`.`
      + (prev && prev.hub_channel_id !== hub.id ? `\n(Replaced the old hub <#${prev.hub_channel_id}>.)` : ''),
    );
  },
};

export default TempVoiceCmd;
