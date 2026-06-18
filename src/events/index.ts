import { Client, Events } from 'discord.js';
import { initCronJobs } from '../tasks';
import { onGuildDelete } from './onGuildDelete';
import { onInteraction } from './onInteraction';
import { onMemberUpdate } from './onMemberUpdate';
import { onReady } from './onReady';

export function registerEvents(Bot: Client) {
  Bot.once(Events.ClientReady, async () => {
    await onReady(Bot);
    initCronJobs(Bot);
  });

  Bot.on(Events.GuildMemberUpdate, async (oldMember, newMember) => await onMemberUpdate(oldMember, newMember));

  Bot.on(Events.GuildDelete, async (guild) => await onGuildDelete(guild));

  Bot.on(Events.InteractionCreate, async (interaction) => await onInteraction(interaction));
}
