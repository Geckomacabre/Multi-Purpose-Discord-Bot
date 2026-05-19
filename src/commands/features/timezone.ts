import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  TextChannel,
} from "discord.js";
import { Command } from "../../interfaces/command";
import {
  REGION_MAP,
  buildTimezoneSelect,
  formatInZone,
  updateSticky,
  getUserTimezone,
  removeUserTimezone,
  listCard,
} from "../../features/timezone";
import { setStickyMessage } from "../../infrastructure/db";

const Timezone: Command = {
  data: new SlashCommandBuilder()
    .setName("timezone")
    .setDescription("Timezone system")
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Set timezone")
        .addStringOption((opt) =>
          opt
            .setName("region")
            .setDescription("Select a region")
            .setRequired(true)
            .addChoices(
              { name: "North America", value: "north_america" },
              { name: "South America", value: "south_america" },
              { name: "Europe", value: "europe" },
              { name: "Africa", value: "africa" },
              { name: "Middle East", value: "middle_east" },
              { name: "Asia", value: "asia" },
              { name: "Oceania", value: "oceania" },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("show")
        .setDescription("Show timezone info")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("User to look up")
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName("timezone")
            .setDescription("Timezone to preview")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("post").setDescription("Post timezone board"),
    )
    .addSubcommand((sub) =>
      sub.setName("remove").setDescription("Remove your timezone"),
    ),

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "set") {
      const region = interaction.options.getString(
        "region",
        true,
      ) as keyof typeof REGION_MAP;

      await interaction.reply({
        content: `Pick timezone for ${region}`,
        components: [buildTimezoneSelect(region)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "show") {
      const user = interaction.options.getUser("user");
      const tz = interaction.options.getString("timezone");

      if (user && tz) {
        await interaction.reply({
          content: "Pick one only.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (tz) {
        await interaction.reply({
          content: `## ${tz}\n> ${formatInZone(tz)}`,
        });
        return;
      }

      const target = user ?? interaction.user;
      const stored = await getUserTimezone(target.id);

      if (!stored) {
        await interaction.reply({
          content: "No timezone set.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.reply({
        content: `## ${target.username}\n${stored}\n> ${formatInZone(stored)}`,
      });
      return;
    }

    // if (sub === "post") {
    //   const member = interaction.guild?.members.cache.get(interaction.user.id);

    //   if (!member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
    //     await interaction.reply({
    //       content: "No permission.",
    //       flags: MessageFlags.Ephemeral,
    //     });
    //     return;
    //   }

    //   const channel = interaction.channel as TextChannel;
    //   const msg = await channel.send({
    //     content: "Timezone board active.",
    //   });

    //   await interaction.reply({
    //     content: "Posted.",
    //     flags: MessageFlags.Ephemeral,
    //   });
    //   return;
    // }

    if (sub === "post") {
      const member = interaction.guild?.members.cache.get(interaction.user.id);

      if (!member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
        await interaction.reply({
          content: "No permission.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const card = await listCard();

      if (!card) {
        await interaction.reply({
          content: "No timezones registered yet.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const msg = await (interaction.channel as TextChannel).send({
        allowedMentions: {},
        components: [card],
        flags: MessageFlags.IsComponentsV2,
      });

      await setStickyMessage("timezone_list", msg.channelId, msg.id);

      await msg.pin().catch(() => null);

      await interaction.reply({
        content: "Timezone board posted and pinned.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "remove") {
      const existing = await getUserTimezone(interaction.user.id);

      if (!existing) {
        await interaction.reply({
          content: "Nothing to remove.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await removeUserTimezone(interaction.user.id, interaction.client);
      await updateSticky(interaction.client);

      await interaction.reply({
        content: "Removed.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  },
};

export default Timezone;
