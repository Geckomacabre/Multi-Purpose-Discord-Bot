import {
  Client,
  TextChannel,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} from "discord.js";
import { db, setBirthdayAssigned } from "../infrastructure/db";
import { Channels, Roles } from "../constants";

function isToday(timestamp: number | null, now: Date): boolean {
  if (!timestamp) return false;
  const d = new Date(timestamp);
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  );
}

export default {
  name: "birthday-check",
  intervalMs: 24 * 60 * 60 * 1000,

  run: async (client: Client) => {
    const now = new Date();
    const utcMonth = now.getUTCMonth() + 1;
    const utcDay = now.getUTCDate();

    const guild = client.guilds.cache.first();
    if (!guild) return;

    const todayRows = await db`
      SELECT user_id, month, day, year, last_assigned
      FROM birthdays
      WHERE month = ${utcMonth} AND day = ${utcDay}
    `;

    const channel = client.channels.cache.get(Channels.General) as
      | TextChannel
      | undefined;

    for (const row of todayRows) {
      if (isToday(row.last_assigned ?? null, now)) continue;

      const member = await guild.members.fetch(row.user_id).catch(() => null);
      if (!member) continue;

      await member.roles.add(Roles.BirthdayOperative).catch(() => null);
      await setBirthdayAssigned(row.user_id, Date.now());

      if (!channel) continue;

      const yearString = row.year ? ` (born ${row.year})` : "";

      const container = new ContainerBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## 🎂 Birthday Announcement\n<@&${Roles.BirthdayPings}>`,
          ),
        )
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder()
              .setURL(
                member.user.displayAvatarURL({
                  size: 256,
                  extension: "png",
                }),
              )
              .setDescription(`${member.user.username}'s avatar`),
          ),
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `🎉 Please join us in wishing ${member} a very **Happy Birthday!** ❤️\n` +
              `-# 🗓️ ${row.month}/${row.day}${yearString}`,
          ),
        );

      const message = await channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });

      await message.react("🎉").catch(() => null);
      await message.react("🎂").catch(() => null);
    }

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yMonth = yesterday.getUTCMonth() + 1;
    const yDay = yesterday.getUTCDate();

    const yesterdayRows = await db`
      SELECT user_id FROM birthdays
      WHERE month = ${yMonth} AND day = ${yDay}
    `;

    for (const row of yesterdayRows) {
      const member = await guild.members.fetch(row.user_id).catch(() => null);
      if (!member) continue;

      await member.roles.remove(Roles.BirthdayOperative).catch(() => null);
    }
  },
};
