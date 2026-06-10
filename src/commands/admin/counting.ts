import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  InteractionContextType,
  PermissionFlagsBits,
} from "discord.js";
import { Command } from "../../interfaces/command";
import {
  getCounting,
  resetCounting,
  setCounting,
  unsetCounting,
} from "../../infrastructure/db";

const Counting: Command = {
  data: new SlashCommandBuilder()
    .setName("counting")
    .setDescription("Manage counting settings")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts([InteractionContextType.Guild])
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Enable counting in this channel")
        .addIntegerOption((opt) =>
          opt.setName("start").setDescription("Starting number"),
        )
        .addIntegerOption((opt) =>
          opt.setName("highscore").setDescription("Initial highscore"),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("unset").setDescription("Disable counting in this channel"),
    )
    .addSubcommand((sub) =>
      sub.setName("reset").setDescription("Reset the count for this channel"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("view")
        .setDescription("View the current count and highscore"),
    ),

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const channelId = interaction.channelId;
    const guildId = interaction.guildId!;
    if (sub === "set") {
      const start = interaction.options.getInteger("start") ?? 0;
      const highscore = interaction.options.getInteger("highscore") ?? start;
      await setCounting(channelId, guildId, start, highscore, undefined);
      await interaction.reply({
        content: `✅ This channel is now a counting channel starting at **${start + 1}**!`,
      });
    } else if (sub === "unset") {
      await unsetCounting(channelId);
      await interaction.reply({
        content: `🚫 This channel is no longer a counting channel.`,
      });
    } else if (sub === "reset") {
      await resetCounting(channelId, 0);
      await interaction.reply({
        content: `🔄 The count for this channel has been reset to **0**.`,
      });
    } else if (sub === "view") {
      const count = await getCounting(channelId);
      await interaction.reply({
        content:
          count?.count === count?.highscore
            ? `🏆 The current count for this channel is **${count?.count || 0}** (current highscore!)`
            : `🔥 The current count for this channel is **${count?.count || 0}** with a highscore of **${count?.highscore || count?.count || 0}**.`,
      });
    }
  },
};

export default Counting;
