import {
  ApplicationIntegrationType, ChatInputCommandInteraction, InteractionContextType,
  PermissionFlagsBits, SlashCommandBuilder, TextChannel,
} from 'discord.js';
import { Command } from '../../interfaces/command';

const Clean: Command = {
  data: new SlashCommandBuilder()
    .setName('clean')
    .setDescription('Bulk-delete recent messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addIntegerOption(o => o.setName('amount').setDescription('Number of messages to delete (1–100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption(o => o.setName('user').setDescription('Only delete messages from this user'))
    .addBooleanOption(o => o.setName('bots').setDescription('Only delete bot messages'))
    as any,

  async run(interaction: ChatInputCommandInteraction) {
    const amount = interaction.options.getInteger('amount', true);
    const filterUser = interaction.options.getUser('user');
    const botsOnly = interaction.options.getBoolean('bots') ?? false;

    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.channel as TextChannel;
    if (!channel) { await interaction.editReply('Cannot delete messages in this channel.'); return; }

    let messages = await channel.messages.fetch({ limit: Math.min(amount + 10, 100) });

    // Two-week cutoff (Discord won't let us bulk-delete older messages)
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    messages = messages.filter(m => m.createdTimestamp > twoWeeksAgo);

    if (filterUser) messages = messages.filter(m => m.author.id === filterUser.id);
    if (botsOnly) messages = messages.filter(m => m.author.bot);

    const toDelete = [...messages.values()].slice(0, amount);
    if (!toDelete.length) { await interaction.editReply('No deletable messages found.'); return; }

    const deleted = await channel.bulkDelete(toDelete, true).catch(() => null);
    const count = deleted?.size ?? 0;

    await interaction.editReply(`✅ Deleted **${count}** message(s).`);
  },
};

export default Clean;
