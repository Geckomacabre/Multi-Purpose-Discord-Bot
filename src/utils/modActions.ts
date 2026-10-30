import { ChatInputCommandInteraction, Colors, TextChannel } from 'discord.js';
import * as db from './db';
import { logCard, who } from './logCard';

export function parseDuration(s: string): number | null {
  const m = /^(\d+)(s|m|h|d|w)$/i.exec(s.trim());
  if (!m) return null;
  const n = parseInt(m[1]);
  const units: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return n * (units[m[2].toLowerCase()] ?? 0) || null;
}

export function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

export const TYPE_COLORS: Record<string, number> = {
  ban: Colors.Red, unban: Colors.Green, kick: Colors.Orange,
  timeout: Colors.Yellow, removetimeout: Colors.Green, warn: Colors.Yellow, report: Colors.Blue,
};

const CASE_ICONS: Record<string, string> = {
  ban: '🔨', unban: '🕊️', kick: '👢', timeout: '⏱️', removetimeout: '⏱️', warn: '⚠️', report: '📣',
};
const CASE_TITLES: Record<string, string> = { removetimeout: 'Timeout Removed' };

export async function sendModCase(
  interaction: ChatInputCommandInteraction,
  modCase: { case_num: number; type: string; user_tag: string; user_id: string; expires_at?: number | null },
  user: { tag: string; id: string },
  extras: string[] = [],
) {
  const target = await interaction.client.users.fetch(user.id).catch(() => null);
  const card = logCard({
    color: TYPE_COLORS[modCase.type] ?? Colors.Grey,
    title: `${CASE_ICONS[modCase.type] ?? '📋'} ${CASE_TITLES[modCase.type] ?? capitalize(modCase.type)} · Case #${modCase.case_num}`,
    subtitle: target?.username ?? user.tag,
    thumbnail: target?.displayAvatarURL({ size: 128 }),
    fields: [
      { name: 'Member', value: who(target ?? { id: user.id, username: user.tag }), inline: true },
      { name: 'Moderator', value: who(interaction.user), inline: true },
      // extras arrive as "**Label:** value" lines
      ...extras.map(line => {
        const m = line.match(/^\*\*(.+?):\*\*\s*([\s\S]*)$/);
        return m ? { name: m[1]!, value: m[2]!, inline: true } : { name: 'Note', value: line, inline: true };
      }),
      modCase.expires_at ? { name: 'Expires', value: `<t:${Math.floor(modCase.expires_at / 1000)}:R>`, inline: true } : null,
    ],
    footer: `🛡️ ${interaction.user.username} · User ID ${user.id}`,
  });
  await interaction.editReply(card);

  const cfg = await db.getModConfig(interaction.guildId!);
  if (cfg.modlog_channel_id) {
    const ch = await interaction.guild!.channels.fetch(cfg.modlog_channel_id).catch(() => null) as TextChannel | null;
    await ch?.send(card).catch(() => {});
  }
}
