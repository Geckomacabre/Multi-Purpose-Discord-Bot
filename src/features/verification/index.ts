import {
  ButtonStyle,
  ComponentType,
  MessageFlags,
  type Client,
} from "discord.js";
import type { Feature } from "../feature";
import { Channels } from "../../constants";
import { syncSystemMessage, SystemMessage } from "../../utils";
import buttonHandlers from "./buttons";
import { modalHandlers } from "./modals";

const VERIFICATION_MESSAGE: SystemMessage = {
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
            `# Age Verification`,
            ``,
            `To unlock the remaining channels within the **Midnight Lounge**, please confirm your date of birth. This is a one-time requirement for 18+ access.`,
          ].join("\n"),
        },
        { type: ComponentType.Separator, divider: true, spacing: 2 },
        {
          type: ComponentType.Section,
          accessory: {
            type: ComponentType.Button,
            style: ButtonStyle.Secondary,
            custom_id: "trigger_birthday_modal",
            label: "Enter Birthday",
            emoji: { name: "🔞" },
          },
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `Access to restricted areas will be granted immediately upon confirmation.`,
            },
          ],
        },
      ],
    },
  ],
};

async function onReady(client: Client): Promise<void> {
  await syncSystemMessage({
    client,
    channelId: Channels.Verification,
    message: VERIFICATION_MESSAGE,
  });
}

export default {
  name: "verification",
  register: async () => {},
  onReady,
  buttonHandlers,
  modalHandlers,
} satisfies Feature;
