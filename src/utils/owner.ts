import { GuildMember, Interaction, PermissionsBitField } from 'discord.js';
import Config from '../config';

/**
 * Bot owners (OWNER_IDS in the env file) can use every command and every staff-only
 * button, whatever roles they hold in a server.
 *
 * Discord itself decides who *sees* a command (its default member permissions),
 * and a bot cannot change that per user; a server admin can under Server Settings →
 * Integrations → the bot → a command's permissions. Everything the bot checks in its
 * own code, though, goes through `interaction.memberPermissions` or
 * `member.permissions`, so for an owner both are replaced with the full permission
 * set before any handler runs (see `elevateOwner`, wired first in src/index.ts).
 */

let cachedIds: Set<string> | null = null;

export function ownerIds(): Set<string> {
  if (!cachedIds) {
    cachedIds = new Set((Config.OWNER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean));
  }
  return cachedIds;
}

export function isOwner(userId: string | null | undefined): boolean {
  return !!userId && ownerIds().has(userId);
}

const ALL_PERMISSIONS: Readonly<PermissionsBitField> = Object.freeze(new PermissionsBitField(PermissionsBitField.All));

/**
 * Make an owner's interaction look like it comes from an administrator.
 * Synchronous on purpose: registered as the first interactionCreate listener, it has
 * finished before any other listener reads the interaction.
 */
export function elevateOwner(interaction: Interaction): void {
  if (!interaction.inGuild() || !isOwner(interaction.user.id)) return;
  try {
    Object.defineProperty(interaction, 'memberPermissions', { value: ALL_PERMISSIONS, configurable: true, enumerable: true });
    const member = interaction.member;
    if (member instanceof GuildMember) {
      // GuildMember.permissions is a prototype getter; an own property on this (cached)
      // instance overrides it for every later check against the same member object.
      Object.defineProperty(member, 'permissions', { value: ALL_PERMISSIONS, configurable: true, enumerable: true });
    }
  } catch {
    // Never let the convenience break command handling.
  }
}
