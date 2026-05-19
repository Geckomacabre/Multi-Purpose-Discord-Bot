import {
  ActionRowBuilder,
  Client,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  User,
  StringSelectMenuInteraction,
  TextChannel,
  MessageFlags,
} from "discord.js";
import {
  db,
  getTimezone,
  setTimezone,
  removeTimezone,
  getStickyMessage,
  setStickyMessage,
} from "../../infrastructure/db";
import { Feature } from "../feature";

// ------------------------------------------------------------
// CONSTANTS
// ------------------------------------------------------------

export const REGION_MAP = {
  north_america: [
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Anchorage",
    "Pacific/Honolulu",
    "America/Halifax",
    "America/St_Johns",
    "America/Mexico_City",
  ],
  south_america: [
    "America/Sao_Paulo",
    "America/Manaus",
    "America/Argentina/Buenos_Aires",
    "America/Santiago",
    "America/Bogota",
    "America/Lima",
  ],
  europe: [
    "Europe/London",
    "Europe/Lisbon",
    "Europe/Paris",
    "Europe/Berlin",
    "Europe/Rome",
    "Europe/Stockholm",
    "Europe/Helsinki",
    "Europe/Moscow",
  ],
  africa: [
    "Africa/Cairo",
    "Africa/Lagos",
    "Africa/Johannesburg",
    "Africa/Nairobi",
  ],
  middle_east: ["Asia/Dubai", "Asia/Riyadh", "Asia/Tehran", "Asia/Jerusalem"],
  asia: [
    "Asia/Karachi",
    "Asia/Kolkata",
    "Asia/Dhaka",
    "Asia/Bangkok",
    "Asia/Singapore",
    "Asia/Shanghai",
    "Asia/Hong_Kong",
    "Asia/Seoul",
    "Asia/Tokyo",
  ],
  oceania: [
    "Australia/Perth",
    "Australia/Darwin",
    "Australia/Brisbane",
    "Australia/Adelaide",
    "Australia/Sydney",
    "Pacific/Auckland",
    "Pacific/Fiji",
  ],
} as const;

export const REGION_FLAGS = {
  north_america: "🌎",
  south_america: "🌎",
  europe: "🇪🇺",
  africa: "🌍",
  middle_east: "🕌",
  asia: "🌏",
  oceania: "🌊",
} as const;

// ------------------------------------------------------------
// UTIL
// ------------------------------------------------------------

export function formatInZone(tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date());
}

function regionLabel(key: string) {
  return key.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ------------------------------------------------------------
// UI BUILDERS
// ------------------------------------------------------------

export function buildTimezoneSelect(region: keyof typeof REGION_MAP) {
  const zones = REGION_MAP[region];
  const emoji = REGION_FLAGS[region];

  const select = new StringSelectMenuBuilder()
    .setCustomId(`tz_select:${region}`)
    .setPlaceholder("Select timezone")
    .addOptions(
      zones.map((tz) => ({
        label: `${emoji} ${tz}`,
        value: tz,
      })),
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

export async function listCard() {
  const rows = (await db`SELECT user_id, timezone FROM timezones`) as {
    user_id: string;
    timezone: string;
  }[];

  if (!rows.length) return null;

  const content = rows
    .map(
      (r) =>
        `> <@${r.user_id}>\n> 🕐 **${r.timezone}** — ${formatInZone(r.timezone)}`,
    )
    .join("\n\n");

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("## 🌍 Timezones"),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

// ------------------------------------------------------------
// STICKY
// ------------------------------------------------------------

export async function updateSticky(client: Client) {
  const sticky = await getStickyMessage("timezone_list");
  if (!sticky) return;

  const channel = await client.channels
    .fetch(sticky.channel_id)
    .catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const msg = await channel.messages.fetch(sticky.message_id).catch(() => null);
  if (!msg) return;

  const card = await listCard();

  await msg.edit({
    components: card ? [card] : [],
    flags: MessageFlags.IsComponentsV2,
    //content: card ? undefined : "No timezones yet",
  });
}

// ------------------------------------------------------------
// HANDLERS
// ------------------------------------------------------------

export async function handleSelect(interaction: StringSelectMenuInteraction) {
  if (!interaction.customId.startsWith("tz_select:")) return false;

  const tz = interaction.values[0];

  await setTimezone(interaction.user.id, tz!);

  await interaction.update({
    content: `Timezone set to **${tz}**`,
    components: [],
  });

  await updateSticky(interaction.client);

  return true;
}

export async function removeUserTimezone(userId: string, client: Client) {
  await removeTimezone(userId);
  await updateSticky(client);
}

export async function getUserTimezone(userId: string) {
  return getTimezone(userId);
}

export default {
  name: "timezone",
  register: async () => {},
  onInteraction: async (interaction) => {
    if (interaction.isStringSelectMenu()) {
      await handleSelect(interaction);
    }
  },
  cronTasks: [
    {
      name: "timezone-board-sync",
      intervalMs: 60_000,

      run: async (client) => {
        await updateSticky(client);
      },
    },
  ],
} satisfies Feature;
