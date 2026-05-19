import { ComponentType, MessageFlags, type Client } from "discord.js";
import type { Feature } from "../feature";
import { Channels } from "../../constants";
import { syncSystemMessage, SystemMessage } from "../../utils";

const INFO_MESSAGE: SystemMessage = {
  flags: MessageFlags.IsComponentsV2,
  allowedMentions: {},
  content: "",
  components: [
    {
      type: ComponentType.Container,
      components: [
        {
          type: ComponentType.TextDisplay,
          content: [
            `## The Midnight Club`,
            ``,
            `The Midnight Club was founded in February 2026 by <@173557815326015488> and <@1108517206783963136>`,
            ``,
            `Now you're here, so settle in, explore, and enjoy the vibe. And if you want to bring someone along for the ride, here’s the invite: https://discord.gg/the-midnight-club`,
          ].join("\n"),
        },
        { type: ComponentType.Separator, divider: true, spacing: 2 },
        {
          type: ComponentType.TextDisplay,
          content: [
            `### Server Guide`,
            ``,
            `-# New to the server? Check out <id:guide> for a full breakdown of everything The Midnight Club has to offer. Use <id:customize> to browse channels, customise notifications, and manage your roles.`,
          ].join("\n"),
        },
      ],
    },
  ],
};

async function onReady(client: Client): Promise<void> {
  await syncSystemMessage({
    client,
    channelId: Channels.Info,
    message: INFO_MESSAGE,
  });
}

export default {
  name: "info",
  register: async () => {},
  onReady,
} satisfies Feature;
