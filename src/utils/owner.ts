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

// ── Command visibility ────────────────────────────────────────────────────────
// A command's default member permissions are enforced by Discord before the bot is
// involved, so an owner without Manage Server never even sees /mediaguess setup. With
// COMMANDS_VISIBLE_TO_ALL=true the bot registers its commands without those defaults
// and enforces the same permissions itself, which lets owners through (their
// permissions were elevated above) and refuses everyone else with a clear message.

const requiredPermissions = new Map<string, bigint>();

type CommandJson = { name: string; default_member_permissions?: string | null };

/** Strip the Discord-side defaults (remembering them) when the flag is on. */
export function prepareCommandData<T extends CommandJson>(commandData: T[]): T[] {
  requiredPermissions.clear();
  for (const c of commandData) {
    if (c.default_member_permissions) {
      try { requiredPermissions.set(c.name, BigInt(c.default_member_permissions)); } catch { /* ignore */ }
    }
  }
  if (!Config.COMMANDS_VISIBLE_TO_ALL) return commandData;
  return commandData.map(c => (c.default_member_permissions ? { ...c, default_member_permissions: null } : c));
}

/** The permission names a command needs, for the refusal message. */
function describe(bits: bigint): string {
  const names = new PermissionsBitField(bits).toArray();
  return names.map(n => `**${n.replace(/([a-z])([A-Z])/g, '$1 $2')}**`).join(', ') || 'a staff permission';
}

/**
 * What the bot enforces itself when the Discord-side defaults were stripped.
 * Returns a refusal message, or null when the user may run the command.
 */
export function commandDenied(interaction: Interaction & { commandName: string }): string | null {
  if (!Config.COMMANDS_VISIBLE_TO_ALL) return null;
  const required = requiredPermissions.get(interaction.commandName);
  if (!required) return null;
  if (isOwner(interaction.user.id)) return null;
  const perms = interaction.memberPermissions;
  if (perms && perms.has(required)) return null;
  return `❌ This command needs ${describe(required)}.`;
}

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
