import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, ModalBuilder,
  TextDisplayBuilder, TextInputBuilder, TextInputStyle,
  type Client, type GuildTextBasedChannel, type MessageActionRowComponentBuilder,
} from 'discord.js';
import { EventModule } from '../feature';
import * as db from '../../utils/db';
import type { PanelKind } from '../../utils/db';
import { findTimezoneMatch } from '../timezone';
import logger from '../../utils/logger';

// Birthday and time panels: one bot message listing everyone's birthday or local
// time, with buttons to add yourself (a pop-up asks the first time), refresh, or
// take yourself off. Modelled on Bestow's group chat boards. Panels are edited in
// place: after every change, every minute (time) and every hour (birthdays).

const GOLD = 0xf1c40f;
const CLOCK = 0x5865f2;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PREFIX: Record<PanelKind, string> = { birthday: 'panel:bday', time: 'panel:tz' };

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
};

/** Days until the next month/day in the bot's local time (the same clock the birthday announcer uses); 0 = today. */
function daysUntil(month: number, day: number, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), month - 1, day);
  if (next < today) next = new Date(now.getFullYear() + 1, month - 1, day);
  return Math.round((next.getTime() - today.getTime()) / 86_400_000);
}

/** Keeps as many lines as fit, ending with "…and N more". */
function fit(lines: string[], max = 3400) {
  const out: string[] = [];
  let len = 0;
  for (const [i, line] of lines.entries()) {
    if (len + line.length + 1 > max) return [...out, `…and ${lines.length - i} more`];
    out.push(line);
    len += line.length + 1;
  }
  return out;
}

function panel(kind: PanelKind, title: string, body: string, footer: string, color: number): any {
  const p = PREFIX[kind];
  const buttons = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${p}:add`).setLabel('Add mine').setEmoji(kind === 'birthday' ? '🎂' : '🕒').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${p}:refresh`).setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${p}:leave`).setLabel('Remove me').setStyle(ButtonStyle.Secondary),
  );
  const container = new ContainerBuilder().setAccentColor(color)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}\n${body}`))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footer}`))
    .addActionRowComponents(buttons);
  return { flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions: { parse: [] } };
}

// ─── Birthday panel ───────────────────────────────────────────────────────────

export async function birthdayPanel(guildId: string): Promise<any> {
  const now = new Date();
  const list = (await db.getBirthdays(guildId))
    .map(b => ({ ...b, days: daysUntil(b.month, b.day, now) }))
    .sort((a, b) => a.days - b.days || a.user_id.localeCompare(b.user_id));
  const today = list.filter(b => b.days === 0);
  const soon = list.filter(b => b.days > 0);

  const lines: string[] = [];
  if (today.length) lines.push(`🎉 **Today:** ${today.map(b => `<@${b.user_id}>`).join(', ')}! Happy birthday!`, '');
  if (soon.length) {
    lines.push('**Coming up**');
    lines.push(...soon.map(b => `<@${b.user_id}> · **${MONTHS[b.month - 1]} ${ordinal(b.day)}** · ${b.days === 1 ? 'tomorrow' : `in ${b.days} days`}`));
  }
  if (!list.length) lines.push('Nobody has added their birthday yet.', 'Press **🎂 Add mine** to add yours.');

  const n = list.length;
  return panel('birthday', '🎂 Birthdays', fit(lines).join('\n'),
    `${n} ${n === 1 ? 'person' : 'people'} · Press 🎂 Add mine to add or change yours`, GOLD);
}

const birthdayModal = (saved: db.IBirthday | null) => new ModalBuilder().setCustomId('panel:bday:modal').setTitle('Your birthday').addComponents(
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('month').setLabel('Month')
    .setPlaceholder('May, or 5').setStyle(TextInputStyle.Short).setMaxLength(9).setRequired(true)
    .setValue(saved ? MONTHS[saved.month - 1]! : '')),
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('day').setLabel('Day')
    .setPlaceholder('17').setStyle(TextInputStyle.Short).setMaxLength(2).setRequired(true)
    .setValue(saved ? String(saved.day) : '')),
);

function parseMonth(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (/^\d{1,2}$/.test(s)) {
    const n = Number(s);
    return n >= 1 && n <= 12 ? n : null;
  }
  const i = MONTHS.findIndex(m => s.length >= 3 && m.toLowerCase().startsWith(s));
  return i === -1 ? null : i + 1;
}

// ─── Time panel ───────────────────────────────────────────────────────────────

/** Minutes `zone` is ahead of UTC right now, or null for an unknown zone. */
function offsetMinutes(zone: string, now: number): number | null {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' })
      .formatToParts(now).find(p => p.type === 'timeZoneName')?.value ?? 'GMT';
    const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!m) return 0;
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
  } catch {
    return null;
  }
}

function offsetLabel(minutes: number) {
  if (!minutes) return 'UTC';
  const a = Math.abs(minutes);
  return `UTC${minutes > 0 ? '+' : '-'}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, '0')}` : ''}`;
}

const cityOf = (zone: string) => zone.split('/').at(-1)!.replace(/_/g, ' ');

export async function timePanel(guildId: string): Promise<any> {
  const now = Date.now();
  const groups = new Map<number, { zone: string; cities: Set<string>; users: string[] }>();
  for (const r of await db.getGuildTimezones(guildId)) {
    const off = offsetMinutes(r.timezone, now);
    if (off === null) continue;
    const g = groups.get(off) ?? { zone: r.timezone, cities: new Set<string>(), users: [] };
    g.cities.add(cityOf(r.timezone));
    g.users.push(r.user_id);
    groups.set(off, g);
  }

  const lines = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([off, g]) => {
    const time = new Intl.DateTimeFormat('en-US', { timeZone: g.zone, hour: 'numeric', minute: '2-digit', hour12: true }).format(now);
    const day = new Intl.DateTimeFormat('en-US', { timeZone: g.zone, weekday: 'short' }).format(now);
    const cities = [...g.cities].slice(0, 3).join(', ') + (g.cities.size > 3 ? '…' : '');
    return `\`${time}\` ${day} · **${offsetLabel(off)}** (${cities}) · ${g.users.map(u => `<@${u}>`).join(' ')}`;
  });

  const people = [...groups.values()].reduce((n, g) => n + g.users.length, 0);
  return panel('time', '🕒 Member Times',
    lines.length ? fit(lines).join('\n') : 'Nobody has added their time yet.\nPress **🕒 Add mine** and type your timezone (a city is fine).',
    `${people} ${people === 1 ? 'person' : 'people'} · Updated <t:${Math.floor(now / 1000)}:R>`, CLOCK);
}

const timeModal = (saved: string | null) => new ModalBuilder().setCustomId('panel:tz:modal').setTitle('Your timezone').addComponents(
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('zone').setLabel('Timezone or city')
    .setPlaceholder('Tokyo, London, America/New_York, EST…').setStyle(TextInputStyle.Short).setMaxLength(64).setRequired(true)
    .setValue(saved ?? '')),
);

// ─── Posting and refreshing ───────────────────────────────────────────────────

const render = (kind: PanelKind, guildId: string) => (kind === 'birthday' ? birthdayPanel(guildId) : timePanel(guildId));

export async function postPanel(channel: GuildTextBasedChannel, kind: PanelKind) {
  const message = await channel.send(await render(kind, channel.guildId));
  await db.addInfoPanel(channel.guildId, channel.id, message.id, kind);
  return message;
}

/** Re-renders every panel of this kind (in one guild, or everywhere). Panels whose message is gone are forgotten. */
export async function refreshPanels(bot: Client, kind: PanelKind, guildId?: string, skipMessageId?: string) {
  const cache = new Map<string, any>();
  for (const p of await db.getInfoPanels(kind, guildId)) {
    if (p.message_id === skipMessageId) continue;
    try {
      const channel = await bot.channels.fetch(p.channel_id);
      if (!channel?.isTextBased()) continue;
      const message = await channel.messages.fetch(p.message_id);
      if (!cache.has(p.guild_id)) cache.set(p.guild_id, await render(kind, p.guild_id));
      const { components, allowedMentions } = cache.get(p.guild_id);
      await message.edit({ components, allowedMentions });
    } catch (err: any) {
      if (err?.code === 10008 || err?.code === 10003) await db.removeInfoPanel(p.message_id);
      else logger.error(`[panels] couldn't refresh ${kind} panel ${p.message_id}: ${err}`);
    }
  }
}

export function startPanels(bot: Client) {
  let lastHour = new Date().getHours();
  const tick = () => {
    refreshPanels(bot, 'time').catch(err => logger.error(`[panels] ${err}`));
    const hour = new Date().getHours();
    if (hour !== lastHour) {
      lastHour = hour;
      refreshPanels(bot, 'birthday').catch(err => logger.error(`[panels] ${err}`));
    }
  };
  // Line the time panel up with the start of each minute
  setTimeout(() => { tick(); setInterval(tick, 60_000); }, 60_000 - (Date.now() % 60_000));
}

// ─── Buttons and pop-ups ──────────────────────────────────────────────────────

const panelsModule: EventModule = {
  name: 'panels',
  handlers: {
    interactionCreate: async ({ data: [interaction], bot }) => {
      if (!interaction.inGuild() || !(interaction.isButton() || interaction.isModalSubmit())) return;
      if (!interaction.customId.startsWith('panel:')) return;
      const [, which, action] = interaction.customId.split(':');
      const kind: PanelKind = which === 'bday' ? 'birthday' : 'time';
      const { guildId } = interaction;
      const userId = interaction.user.id;
      const oops = (text: string) => interaction.reply({ content: `❌ ${text}`, flags: MessageFlags.Ephemeral });

      if (interaction.isButton() && action === 'add') {
        await interaction.showModal(kind === 'birthday'
          ? birthdayModal(await db.getBirthday(guildId, userId))
          : timeModal(await db.getUserTimezone(guildId, userId)));
        return;
      }

      if (interaction.isModalSubmit() && action === 'modal') {
        if (kind === 'birthday') {
          const month = parseMonth(interaction.fields.getTextInputValue('month'));
          const day = Number(interaction.fields.getTextInputValue('day').trim());
          if (!month) return oops('I couldn\'t read that month. Type a name like "May" or a number from 1 to 12.');
          const maxDay = new Date(2024, month, 0).getDate(); // 2024 is a leap year, so Feb 29 is allowed
          if (!Number.isInteger(day) || day < 1 || day > maxDay) return oops(`${MONTHS[month - 1]} has days 1 to ${maxDay}.`);
          await db.setBirthday(guildId, userId, month, day);
        } else {
          const match = findTimezoneMatch(interaction.fields.getTextInputValue('zone'));
          if (!match) return oops('I don\'t know that timezone. Try a big city near you, like "Chicago" or "Berlin".');
          await db.setUserTimezone(guildId, userId, match.name);
        }
      } else if (interaction.isButton() && action === 'leave') {
        if (kind === 'birthday') await db.removeBirthday(guildId, userId);
        else await db.removeUserTimezone(guildId, userId);
      } else if (!(interaction.isButton() && action === 'refresh')) {
        return;
      }

      const payload = await render(kind, guildId);
      if (interaction.isButton() || interaction.isFromMessage()) await interaction.update(payload);
      else await interaction.reply(payload);
      if (interaction.message) await refreshPanels(bot, kind, guildId, interaction.message.id);
    },

    messageDelete: async ({ data: [message] }) => {
      await db.removeInfoPanel(message.id);
    },

    channelDelete: async ({ data: [channel] }) => {
      await db.removeInfoPanelsInChannel(channel.id);
    },
  },
};

export default panelsModule;
