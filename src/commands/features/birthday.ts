import {
  ChatInputCommandInteraction,
  Client,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  TextChannel,
  TextDisplayBuilder,
} from "discord.js";

import { Command } from "../../interfaces/command";
import {
  db,
  getBirthday,
  setBirthday,
  getStickyMessage,
  setStickyMessage,
} from "../../infrastructure/db";

import { isValidDate } from "../../utils";

const STICKY_KEY = "birthday_list";

function formatPublicBirthday(month: number, day: number) {
  const date = new Date(2000, month - 1, day);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
  }).format(date);
}

function formatPrivateBirthday(month: number, day: number, year: number) {
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatPublicRow(row: any) {
  return `🎂 <@${row.user_id}> — **${formatPublicBirthday(row.month, row.day)}**`;
}

async function buildListContainer(commandId: string) {
  const rows = await db`
    SELECT user_id, month, day
    FROM birthdays
    ORDER BY month ASC, day ASC
  `;

  if (!rows?.length) return null;

  const list = rows.map(formatPublicRow).join("\n");

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "## 🎂 Midnight Systems — Agent Birthdays",
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Add yours with </birthday register:${commandId}>`,
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(list))
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Last updated: **${new Date().toUTCString()}**`,
      ),
    );
}

async function updateStickyBirthdayList(client: Client, commandId: string) {
  const sticky = await getStickyMessage(STICKY_KEY);
  if (!sticky) return;

  const channel = client.channels.cache.get(sticky.channel_id) as TextChannel;
  if (!channel) return;

  const message = await channel.messages
    .fetch(sticky.message_id)
    .catch(() => null);
  if (!message) return;

  const container = await buildListContainer(commandId);

  if (!container) {
    await message.edit({
      content: "📭 No birthdays registered yet.",
      components: [],
    });
    return;
  }

  await message
    .edit({ components: [container] })
    .catch(() => null);
}

function getNextBirthday(birthdays: any[]) {
  const now = new Date();
  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();

  const sorted = birthdays
    .map((b) => {
      let next = new Date(now.getFullYear(), b.month - 1, b.day);

      if (next < now) {
        next = new Date(now.getFullYear() + 1, b.month - 1, b.day);
      }

      return { ...b, nextDate: next };
    })
    .sort((a, b) => a.nextDate - b.nextDate);

  return sorted;
}

const Birthday: Command = {
  data: new SlashCommandBuilder()
    .setName("birthday")
    .setDescription("Birthday system commands.")
    .addSubcommand((sub) =>
      sub
        .setName("register")
        .setDescription("Register your birthday.")
        .addIntegerOption((opt) =>
          opt.setName("month").setDescription("Month (1–12)").setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt.setName("day").setDescription("Day (1–31)").setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt.setName("year").setDescription("Birth year").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("Post the birthday list (staff only)."),
    )
    .addSubcommand((sub) =>
      sub
        .setName("show")
        .setDescription("View a birthday.")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("Target user"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("inspect")
        .setDescription("Staff: view raw birthday record.")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("User to inspect")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("upcoming").setDescription("Show upcoming birthdays."),
    )
    .addSubcommand((sub) =>
      sub.setName("next").setDescription("Show the next birthday."),
    ),

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "register") {
      const month = interaction.options.getInteger("month", true);
      const day = interaction.options.getInteger("day", true);
      const year = interaction.options.getInteger("year", true);

      if (!isValidDate(month, day)) {
        await interaction.reply({
          content: "❌ Invalid date.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await setBirthday(interaction.user.id, month, day, year);

      await interaction.reply({
        content: `🎂 Saved your birthday as **${formatPublicBirthday(month, day)}**.\n(Year stored privately for staff only)`,
        flags: MessageFlags.Ephemeral,
      });

      await updateStickyBirthdayList(interaction.client, interaction.commandId);
      return;
    }

    if (sub === "list") {
      const member = interaction.guild?.members.cache.get(interaction.user.id);
      if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({
          content: "❌ You do not have permission.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const container = await buildListContainer(interaction.commandId);

      if (!container) {
        await interaction.reply({
          content: "📭 No birthdays registered yet.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const msg = await (interaction.channel as TextChannel).send({
        allowedMentions: {},
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });

      await setStickyMessage(STICKY_KEY, msg.channelId, msg.id);
      await msg.pin().catch(() => null);

      await interaction.reply({
        content: "📌 Posted and pinned the birthday list.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "show") {
      const target = interaction.options.getUser("user") ?? interaction.user;
      const data = await getBirthday(target.id);

      if (!data) {
        await interaction.reply({
          content: "No birthday registered.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.reply({
        content: `🎂 **${target.username}** — ${formatPublicBirthday(
          data.month,
          data.day,
        )}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "inspect") {
      const member = interaction.guild?.members.cache.get(interaction.user.id);
      if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({
          content: "❌ No permission.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const target = interaction.options.getUser("user", true);
      const data = await getBirthday(target.id);

      if (!data) {
        await interaction.reply({
          content: "No record found.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.reply({
        content:
          `### 🎂 Raw Birthday Record\n` +
          `**User:** <@${target.id}>\n` +
          `**Month:** ${data.month}\n` +
          `**Day:** ${data.day}\n` +
          `**Year:** ${data.year}\n`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "upcoming") {
      const rows = await db`
        SELECT user_id, month, day
        FROM birthdays
      `;

      if (!rows.length) {
        await interaction.reply({
          content: "📭 No birthdays registered.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const sorted = getNextBirthday(rows);

      const list = sorted
        .map(
          (b) =>
            `🎂 <@${b.user_id}> — **${formatPublicBirthday(
              b.month,
              b.day,
            )}** (${b.nextDate.toDateString()})`,
        )
        .join("\n");

      await interaction.reply({
        content: `### 🎉 Upcoming Birthdays\n${list}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "next") {
      const rows = await db`
        SELECT user_id, month, day
        FROM birthdays
      `;

      if (!rows.length) {
        await interaction.reply({
          content: "📭 No birthdays registered.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const sorted = getNextBirthday(rows);
      const next = sorted[0];

      await interaction.reply({
        content: `🎉 **Next Birthday:** <@${next.user_id}> — **${formatPublicBirthday(
          next.month,
          next.day,
        )}**`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  },
};

export default Birthday;
