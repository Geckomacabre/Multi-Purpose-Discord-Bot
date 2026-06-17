import type { ClientEvents } from 'discord.js';

type HandlerContext<K extends keyof ClientEvents> = {
  data: ClientEvents[K][0];
};

export type EventModule = {
  name: string;
  handlers: Partial<{
    [K in keyof ClientEvents]: (context: HandlerContext<K>) => Promise<any>;
  }>;
};
