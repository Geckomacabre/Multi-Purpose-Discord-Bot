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
  if (!rules.length) return;
  const rule = rules.find(r => emojiMatches(r.emoji, d.emoji));
  const reacted = d.emoji.id ? `<:${d.emoji.name}:${d.emoji.id}>` : d.emoji.name;
  if (!rule) {
    logger.warn(`[reactionroles] ${reacted} on message ${d.message_id} matches no reaction role (set up: ${rules.map(r => r.emoji).join(' ')})`);
    return;
  }

  const guild = bot.guilds.cache.get(d.guild_id);
  const role = guild?.roles.cache.get(rule.role_id);
  if (!guild || !role) {
    logger.warn(`[reactionroles] role ${rule.role_id} for reaction role ${rule.id} no longer exists`);
    return;
  }

  const member = await guild.members.fetch(d.user_id).catch(() => null);
  if (!member || member.user.bot) return;

  try {
    if (add) await member.roles.add(role, 'Reaction role');
    else await member.roles.remove(role, 'Reaction role');
    logger.info(`[reactionroles] ${add ? 'gave' : 'removed'} @${role.name} ${add ? 'to' : 'from'} ${member.user.tag}`);
  } catch (err) {
    const me = guild.members.me;
    const hint = me && role.position >= me.roles.highest.position
      ? ` (@${role.name} is above my highest role @${me.roles.highest.name}, move my role above it)`
      : '';
    logger.error(`[reactionroles] couldn't ${add ? 'give' : 'remove'} @${role.name} for ${member.user.tag}: ${err}${hint}`);
  }
}

export function startReactionRoles(bot: Client) {
  bot.on('raw', (packet: { t?: string; d?: RawReaction }) => {
    if (!packet.d || (packet.t !== 'MESSAGE_REACTION_ADD' && packet.t !== 'MESSAGE_REACTION_REMOVE')) return;
    handleReaction(bot, packet.d, packet.t === 'MESSAGE_REACTION_ADD')
      .catch(err => logger.error(`[reactionroles] ${err}`));
  });
}
