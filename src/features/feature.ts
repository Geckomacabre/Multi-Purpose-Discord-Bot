import type {
  ButtonInteraction,
  Client,
  Interaction,
  Message,
  MessageReaction,
  ModalSubmitInteraction,
  PartialMessage,
  PartialMessageReaction,
  PartialUser,
  User,
  GuildMember,
} from "discord.js";

export type CronTask = {
  name: string;
  intervalMs: number;
  run: (bot: Client) => Promise<void>;
};

export interface Feature {
  name: string;
  register?: (bot: Client) => Promise<void>;
  cronTasks?: CronTask[];
  onReady?: (bot: Client) => Promise<void>;
  onInteraction?: (interaction: Interaction) => Promise<void>;
  buttonHandlers?: Record<
    string,
    (interaction: ButtonInteraction) => Promise<void>
  >;
  modalHandlers?: Record<
    string,
    (interaction: ModalSubmitInteraction) => Promise<void>
  >;
  onMessageCreate?: (message: Message) => Promise<void>;
  onMessageDelete?: (message: Message | PartialMessage) => Promise<void>;
  onMessageReactionAdd?: (
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ) => Promise<void>;
  onMessageReactionRemove?: (
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ) => Promise<void>;
  onGuildMemberAdd?: (member: GuildMember) => Promise<void>;
}
