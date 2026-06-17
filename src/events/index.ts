import { Events, type Client } from "discord.js";
import { onReady } from "./onReady";
import { onMemberJoin } from "./onMemberJoin";
import { onMemberUpdate } from "./onMemberUpdate";
import { onInteraction } from "./onInteraction";
import { onVoiceStateUpdate } from "./onVoiceStateUpdate";

export function registerEvents(bot: Client) {
  bot.once(Events.ClientReady, async () => {
    await onReady(bot);
  });

  bot.on(Events.GuildMemberAdd, async (member) => {
    await onMemberJoin(member);
  });

  bot.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    await onMemberUpdate(oldMember, newMember);
  });

  bot.on(Events.InteractionCreate, async (interaction) => {
    await onInteraction(interaction);
  });

  bot.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    await onVoiceStateUpdate(oldState, newState);
  });
}
