import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  TextChannel,
  MessageFlags,
  InteractionContextType,
} from "discord.js";
import { Command } from "../../interfaces/command";

const Purge: Command = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Bulk delete messages in a channel")
    .addIntegerOption((opt) =>
      opt
        .setName("amount")
        .setDescription("Number of messages to delete (1-100)")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts([InteractionContextType.Guild]),

  async run(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    const amount = interaction.options.getInteger("amount", true);

    if (amount < 1 || amount > 100) {
      await interaction.reply({
        content: "You can only delete between 1 and 100 messages.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channel = interaction.channel;

    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: "This command can only be used in a text channel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const textChannel = channel as TextChannel;

    try {
      const messages = await textChannel.bulkDelete(amount, true);

      await interaction.editReply({
        content: `Deleted ${messages.size} messages.`,
      });
    } catch (err) {
      await interaction.editReply({
        content:
          "Failed to delete messages. They may be older than 14 days or I lack permissions.",
      });
    }
  },
};

export default Purge;
