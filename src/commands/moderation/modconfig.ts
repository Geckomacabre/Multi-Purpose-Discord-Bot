import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const Modconfig: Command = {
  data: new SlashCommandBuilder()
    .setName('modconfig')
    .setDescription('Configure moderation settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(sub => sub
      .setName('modlog')
      .setDescription('Set the modlog channel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel for mod logs (omit to clear)'))
    )
    .addSubcommand(sub => sub
      .setName('dm')
      .setDescription('Toggle DM notifications to punished users')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable/disable DMs').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('view')
      .setDescription('View current moderation settings')
    ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    if (sub === 'modlog') {
      const channel = interaction.options.getChannel('channel');
      await db.setModlogChannel(interaction.guildId!, channel?.id ?? null);
      await interaction.editReply(channel ? `✅ Modlog channel set to <#${channel.id}>.` : '✅ Modlog channel cleared.');
    } else if (sub === 'dm') {
      const enabled = interaction.options.getBoolean('enabled', true);
      await db.ensureConfig(interaction.guildId!);
      await db.db`INSERT OR IGNORE INTO mod_config (guild_id) VALUES (${interaction.guildId!})`;
      await db.db`UPDATE mod_config SET dm_on_punish = ${enabled ? 1 : 0} WHERE guild_id = ${interaction.guildId!}`;
      await interaction.editReply(`✅ DM on punish ${enabled ? 'enabled' : 'disabled'}.`);
    } else {
      const cfg = await db.getModConfig(interaction.guildId!);
      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Moderation Config')
        .addFields(
          { name: 'Modlog Channel', value: cfg.modlog_channel_id ? `<#${cfg.modlog_channel_id}>` : 'Not set', inline: true },
          { name: 'DM on Punish', value: cfg.dm_on_punish ? 'Enabled' : 'Disabled', inline: true },
          { name: 'Next Case #', value: String(cfg.next_case_num), inline: true },
        );
      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default Modconfig;
