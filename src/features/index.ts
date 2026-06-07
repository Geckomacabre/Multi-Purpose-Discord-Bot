import type {
  ButtonInteraction,
  Client,
  Interaction,
  Message,
  MessageReaction,
  ModalSubmitInteraction,
  PartialMessage,
  PartialMessageReaction,
  User,
  PartialUser,
  GuildMember,
} from "discord.js";
import type { Feature } from "./feature";
import applications from "./applications";
import counting from "./counting";
import honeypot from "./honeypot";
import info from "./info";
import rules from "./rules";
import timezone from "./timezone";
import verification from "./verification";
import voice from "./voice";

const features: Feature[] = [
  applications,
  counting,
  honeypot,
  info,
  rules,
  timezone,
  verification,
  voice,
];

export async function registerFeatures(bot: Client) {
  await Promise.all(features.map((feature) => feature.register?.(bot)));

  bot.on("interactionCreate", async (interaction: Interaction) => {
    await dispatchInteraction(interaction);
  });

  bot.on("messageCreate", async (message: Message) => {
    await dispatchMessageCreate(message);
  });

  bot.on("messageDelete", async (message: Message | PartialMessage) => {
    await dispatchMessageDelete(message);
  });

  bot.on(
    "messageReactionAdd",
    async (
      reaction: MessageReaction | PartialMessageReaction,
      user: User | PartialUser,
    ) => {
      await dispatchMessageReactionAdd(reaction, user);
    },
  );

  bot.on(
    "messageReactionRemove",
    async (
      reaction: MessageReaction | PartialMessageReaction,
      user: User | PartialUser,
    ) => {
      await dispatchMessageReactionRemove(reaction, user);
    },
  );

  bot.on("guildMemberAdd", async (member: GuildMember) => {
    await dispatchGuildMemberAdd(member);
  });

  bot.once("clientReady", async () => {
    await runReadyHooks(bot);
  });

  scheduleCronTasks(bot);
}

async function dispatchInteraction(interaction: Interaction) {
  if (interaction.isButton()) {
    for (const feature of features) {
      const handler = feature.buttonHandlers?.[interaction.customId];
      if (!handler) continue;

      try {
        await handler(interaction as ButtonInteraction);
      } catch (error) {
        console.error(`Feature ${feature.name} button handler failed:`, error);
      }
      return;
    }
  }

  if (interaction.isModalSubmit()) {
    for (const feature of features) {
      const handler = feature.modalHandlers?.[interaction.customId];
      if (!handler) continue;

      try {
        await handler(interaction as ModalSubmitInteraction);
      } catch (error) {
        console.error(`Feature ${feature.name} modal handler failed:`, error);
      }
      return;
    }
  }

  for (const feature of features) {
    if (!feature.onInteraction) continue;

    try {
      await feature.onInteraction(interaction);
    } catch (error) {
      console.error(
        `Feature ${feature.name} interaction handler failed:`,
        error,
      );
    }
  }
}

async function dispatchMessageCreate(message: Message) {
  for (const feature of features) {
    if (!feature.onMessageCreate) continue;

    try {
      await feature.onMessageCreate(message);
    } catch (error) {
      console.error(
        `Feature ${feature.name} messageCreate handler failed:`,
        error,
      );
    }
  }
}

async function dispatchMessageDelete(message: Message | PartialMessage) {
  for (const feature of features) {
    if (!feature.onMessageDelete) continue;

    try {
      await feature.onMessageDelete(message);
    } catch (error) {
      console.error(
        `Feature ${feature.name} messageDelete handler failed:`,
        error,
      );
    }
  }
}

async function dispatchMessageReactionAdd(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
) {
  for (const feature of features) {
    if (!feature.onMessageReactionAdd) continue;

    try {
      await feature.onMessageReactionAdd(reaction, user);
    } catch (error) {
      console.error(
        `Feature ${feature.name} messageReactionAdd handler failed:`,
        error,
      );
    }
  }
}

async function dispatchMessageReactionRemove(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
) {
  for (const feature of features) {
    if (!feature.onMessageReactionRemove) continue;

    try {
      await feature.onMessageReactionRemove(reaction, user);
    } catch (error) {
      console.error(
        `Feature ${feature.name} messageReactionRemove handler failed:`,
        error,
      );
    }
  }
}

async function dispatchGuildMemberAdd(member: GuildMember) {
  for (const feature of features) {
    if (!feature.onGuildMemberAdd) continue;

    try {
      await feature.onGuildMemberAdd(member);
    } catch (error) {
      console.error(
        `Feature ${feature.name} guildMemberAdd handler failed:`,
        error,
      );
    }
  }
}

async function runReadyHooks(bot: Client) {
  for (const feature of features) {
    if (!feature.onReady) continue;

    try {
      await feature.onReady(bot);
    } catch (error) {
      console.error(`Feature ${feature.name} ready hook failed:`, error);
    }
  }
}

function scheduleCronTasks(bot: Client) {
  for (const feature of features) {
    if (!feature.cronTasks?.length) continue;

    for (const task of feature.cronTasks) {
      void task.run(bot).catch((error) => {
        console.error(`Initial cron run failed for ${task.name}:`, error);
      });

      setInterval(async () => {
        try {
          await task.run(bot);
        } catch (error) {
          console.error(`Cron task failed for ${task.name}:`, error);
        }
      }, task.intervalMs);
    }
  }
}
