import type { Client } from 'discord.js';
import * as db from '../../utils/db';
import logger from '../../utils/logger';

// Reaction roles are handled from raw gateway packets. The client has no partials,
// so discord.js drops reaction events for messages it hasn't cached (all of them
// after a restart, and older ones in busy channels) and removals by uncached users.

type RawReaction = {
  user_id: string;
  message_id: string;
  guild_id?: string;
  emoji: { id: string | null; name: string | null };
};

const stripVariation = (s: string) => s.replace(/️/g, '');

/** Whether a stored emoji ("<:name:id>", "<a:name:id>" or a unicode emoji) is the one reacted with. */
function emojiMatches(stored: string, emoji: RawReaction['emoji']) {
  const custom = stored.match(/^<a?:\w+:(\d+)>$/);
  if (custom) return custom[1] === emoji.id;
  return !emoji.id && stripVariation(stored) === stripVariation(emoji.name ?? '');
}

async function handleReaction(bot: Client, d: RawReaction, add: boolean) {
  if (!d.guild_id || d.user_id === bot.user?.id) return;

  const rules = await db.getReactionRolesForMessage(d.guild_id, d.message_id);
  const rule = rules.find(r => emojiMatches(r.emoji, d.emoji));
  if (!rule) return;

  const guild = bot.guilds.cache.get(d.guild_id);
  const role = guild?.roles.cache.get(rule.role_id);
  if (!guild || !role) return;

  const member = await guild.members.fetch(d.user_id).catch(() => null);
  if (!member || member.user.bot) return;

  if (add) await member.roles.add(role).catch(() => {});
  else await member.roles.remove(role).catch(() => {});
}

export function startReactionRoles(bot: Client) {
  bot.on('raw', (packet: { t?: string; d?: RawReaction }) => {
    if (!packet.d || (packet.t !== 'MESSAGE_REACTION_ADD' && packet.t !== 'MESSAGE_REACTION_REMOVE')) return;
    handleReaction(bot, packet.d, packet.t === 'MESSAGE_REACTION_ADD')
      .catch(err => logger.error(`[reactionroles] ${err}`));
  });
}
