import {
  ApplicationIntegrationType, ChatInputCommandInteraction, GuildTextBasedChannel, InteractionContextType,
  MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { cv2Text, cv2Err } from '../../utils/components.js';
import { deleteMessages, fetchMessages } from '../../utils/deleteMessages';

const BULK_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
// Interaction tokens expire after 15 minutes; stop editing the reply a bit before.
const REPLY_DEADLINE_MS = 14 * 60 * 1000;

const Purge: Command = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete messages of any age, with optional filters')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName('amount').setDescription('Number of messages to scan (max 1000)').setRequired(true).setMinValue(1).setMaxValue(1000))
    .addUserOption(o => o.setName('user').setDescription('Only delete messages from this user'))
    .addStringOption(o => o.setName('keyword').setDescription('Only delete messages containing this text'))
    .addBooleanOption(o => o.setName('bots').setDescription('Only delete bot messages'))
    .addBooleanOption(o => o.setName('attachments').setDescription('Only delete messages with attachments'))
    .addBooleanOption(o => o.setName('embeds').setDescription('Only delete messages with embeds')),

  async run(interaction: ChatInputCommandInteraction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply(cv2Err('❌ You need **Manage Messages** to use this command.')); return;
    }
    const amount = interaction.options.getInteger('amount', true);
    const filterUser = interaction.options.getUser('user');
    const keyword = interaction.options.getString('keyword')?.toLowerCase();
    const botsOnly = interaction.options.getBoolean('bots') ?? false;
    const attachmentsOnly = interaction.options.getBoolean('attachments') ?? false;
    const embedsOnly = interaction.options.getBoolean('embeds') ?? false;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const channel = interaction.channel as GuildTextBasedChannel;
    let toDelete = (await fetchMessages(channel, amount)).filter(m => !m.pinned);
    if (filterUser) toDelete = toDelete.filter(m => m.author.id === filterUser.id);
    if (keyword) toDelete = toDelete.filter(m => m.content.toLowerCase().includes(keyword));
    if (botsOnly) toDelete = toDelete.filter(m => m.author.bot);
    if (attachmentsOnly) toDelete = toDelete.filter(m => m.attachments.size > 0);
    if (embedsOnly) toDelete = toDelete.filter(m => m.embeds.length > 0);
    if (!toDelete.length) { await interaction.editReply(cv2Text('No messages matched your filters.')); return; }

    const started = Date.now();
    const oldCount = toDelete.filter(m => m.createdTimestamp < started - BULK_WINDOW_MS).length;
    if (oldCount) {
      await interaction.editReply(cv2Text(
        `🧹 Deleting **${toDelete.length}** messages. **${oldCount}** are older than 14 days, so Discord makes me delete those one at a time (about ${Math.ceil(oldCount / 60)} min).`,
      ));
    }

    let lastEdit = 0;
    const deleted = await deleteMessages(channel, toDelete, (done, total) => {
      const now = Date.now();
      if (now - lastEdit < 5_000 || now - started > REPLY_DEADLINE_MS) return;
      lastEdit = now;
      interaction.editReply(cv2Text(`🧹 Deleting… **${done}/${total}**`)).catch(() => {});
    });

    const summary = `✅ Deleted **${deleted}** message${deleted === 1 ? '' : 's'} in <#${channel.id}>.` +
      (deleted < toDelete.length ? ` ${toDelete.length - deleted} couldn't be deleted.` : '');
    if (Date.now() - started < REPLY_DEADLINE_MS) {
      await interaction.editReply(cv2Text(summary)).catch(() => {});
    } else {
      // The interaction reply has expired; let them know by DM instead.
      await interaction.user.send(summary).catch(() => {});
    }
  },
};

export default Purge;
