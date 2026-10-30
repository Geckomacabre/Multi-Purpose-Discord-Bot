import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, ContainerBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SectionBuilder, SeparatorBuilder,
  SeparatorSpacingSize, TextDisplayBuilder, ThumbnailBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';

// One look for every log and moderation alert, as a Components V2 card:
//
//   ┃ ### 🗑️ Message Deleted                      [avatar]
//   ┃ -# poseidoncyber298
//   ┃ > **Channel:** #counting
//   ┃ > **Author:** @poseidon · poseidoncyber298
//   ┃ ──────────────
//   ┃ **Content**
//   ┃ > the message
//   ┃ [images, inside the card]
//   ┃ -# 🗑️ Deleted by @gecko · Oct 30, 2026 9:10 AM
//
// Short facts go in one quote block; longer sections get a heading. Images ride
// inside the card (a media gallery), never as loose files above it. Mentions
// render but never ping: logs shouldn't notify anyone.

export const LogColor = {
  good: 0x57f287,    // joins, unbans, things added
  bad: 0xed4245,     // leaves, deletes, things removed
  danger: 0x992d22,  // bans, raids, scams
  warn: 0xfee75c,    // edits, renames, timeouts
  orange: 0xe67e22,  // kicks, spam
  info: 0x5865f2,    // roles, server changes, reports
  neutral: 0x99aab5, // commands
} as const;

/** `inline` facts are grouped into one quote block; others get their own **heading**. */
export type LogField = { name: string; value: string; inline?: boolean };

export type LogCardOptions = {
  color: number;
  title: string;
  subtitle?: string;           // small line under the title, e.g. the member's username
  description?: string;
  thumbnail?: string | null;   // shown beside the title (avatar, emoji, server icon)
  fields?: (LogField | null | undefined | false | '' | 0)[]; // falsy entries are skipped, so `cond && {...}` works
  images?: { url: string; description?: string }[]; // https:// or attachment://name (from `files`)
  files?: AttachmentBuilder[];
  footer?: string;
  timestamp?: number;
  links?: { label: string; url: string }[];
  ephemeral?: boolean;
};

const MAX_TEXT = 3800; // a message's text displays share a 4000 character limit

export const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Text as a quote block (message contents, before/after values). */
export const quote = (text: string, max = 900) =>
  truncate(text.trim() || '*empty*', max).split('\n').map(line => `> ${line}`).join('\n');

/** "@mention (name)" for a user, which still reads well if the mention doesn't resolve. */
export const who = (user: { id: string; tag?: string; username?: string } | null | undefined) =>
  user ? `<@${user.id}> (${user.username ?? user.tag ?? 'unknown'})` : '*Unknown*';

export const ago = (ms: number) => `<t:${Math.floor(ms / 1000)}:R>`;

const CHANNEL_TYPES: Partial<Record<ChannelType, string>> = {
  [ChannelType.GuildText]: 'Text', [ChannelType.GuildVoice]: 'Voice', [ChannelType.GuildCategory]: 'Category',
  [ChannelType.GuildAnnouncement]: 'Announcement', [ChannelType.GuildStageVoice]: 'Stage', [ChannelType.GuildForum]: 'Forum',
  [ChannelType.GuildMedia]: 'Media', [ChannelType.PublicThread]: 'Thread', [ChannelType.PrivateThread]: 'Private thread',
};
export const channelTypeName = (type: ChannelType) => CHANNEL_TYPES[type] ?? 'Channel';

/** Facts as one quote block, other fields as headed sections. */
function renderFields(fields: LogField[]): string {
  const out: string[] = [];
  let facts: string[] = [];
  const flush = () => {
    if (facts.length) out.push(facts.join('\n'));
    facts = [];
  };
  for (const f of fields) {
    if (f.inline) {
      facts.push(`> **${f.name}:** ${f.value.replace(/\n/g, ' ')}`);
    } else {
      flush();
      out.push(`**${f.name}**\n${f.value}`);
    }
  }
  flush();
  return out.join('\n');
}

/** A log card, ready to pass to channel.send() or interaction.reply(). */
export function logCard(o: LogCardOptions): any {
  const ts = Math.floor((o.timestamp ?? Date.now()) / 1000);
  const header = truncate(
    `### ${o.title}${o.subtitle ? `\n-# ${o.subtitle}` : ''}${o.description ? `\n${o.description}` : ''}`, 1500);
  const fields = (o.fields ?? []).filter((f): f is LogField => !!f && !!f.value);
  let body = renderFields(fields);
  const footer = `-# ${o.footer ? `${o.footer} · ` : ''}<t:${ts}:f>`;
  const room = MAX_TEXT - header.length - footer.length;
  if (body.length > room) body = truncate(body, Math.max(room, 0));

  const card = new ContainerBuilder().setAccentColor(o.color);
  const headerText = new TextDisplayBuilder().setContent(header);
  if (o.thumbnail) {
    card.addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(headerText)
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(o.thumbnail)));
  } else {
    card.addTextDisplayComponents(headerText);
  }
  if (body) card.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  if (o.images?.length) {
    card.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(o.images.slice(0, 10).map(img => {
      const item = new MediaGalleryItemBuilder().setURL(img.url);
      if (img.description) item.setDescription(truncate(img.description, 1024));
      return item;
    })));
  }
  card.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  card.addTextDisplayComponents(new TextDisplayBuilder().setContent(footer));
  if (o.links?.length) {
    card.addActionRowComponents(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      o.links.slice(0, 5).map(l => new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(l.label).setURL(l.url))));
  }
  return {
    flags: MessageFlags.IsComponentsV2 | (o.ephemeral ? MessageFlags.Ephemeral : 0),
    components: [card],
    files: o.files ?? [],
    allowedMentions: { parse: [] },
  };
}
