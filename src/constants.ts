export const Channels = {} as const;

// Server-specific IDs come from env (bot.env in the deploy folder), never from
// source: the repo is public. See .env.example for the format of each.

function jsonEnv<T>(name: string, valid: (value: unknown) => value is T, fallback: T): T {
  const raw = Bun.env[name];
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw);
    if (valid(value)) return value;
  } catch {}
  console.warn(`${name} isn't valid JSON in the expected shape; ignoring it`);
  return fallback;
}

const isIdList = (v: unknown): v is string[] => Array.isArray(v) && v.every(id => typeof id === 'string');

export type LinkedRoleRule = {
  parent: string;
  children: string[];
  mode?: 'ANY' | 'ALL' | 'MIN_COUNT';
  minCount?: number;
};

/** The server the linked roles belong to; guild-actions only applies them there. */
export const HOME_GUILD_ID = Bun.env.HOME_GUILD_ID ?? '';

/** Parent roles that are automatically assigned when a member has any child role. */
export const LinkedRoles: LinkedRoleRule[] = jsonEnv('LINKED_ROLES',
  (v): v is LinkedRoleRule[] => Array.isArray(v) && v.every(r => typeof r?.parent === 'string' && isIdList(r?.children)),
  []);

/** The channels /ticket redirect links to. */
export const TicketRedirectChannels: { id: string; label: string }[] = jsonEnv('TICKET_REDIRECT_CHANNELS',
  (v): v is { id: string; label: string }[] => Array.isArray(v) && v.every(c => typeof c?.id === 'string' && typeof c?.label === 'string'),
  []);
