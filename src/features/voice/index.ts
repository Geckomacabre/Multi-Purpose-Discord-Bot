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

const VOICE_MESSAGE: SystemMessage = {
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
            `## 🔊 Private Voice Interface`,
            ``,
            `Manage your temporary voice channel using the controls below.`,
            `More advanced options are available through **/voice** commands.`,
          ].join("\n"),
        },
        { type: ComponentType.Separator, divider: true, spacing: 2 },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: "voice_lock",
              label: "Lock",
              emoji: { name: "🔒" },
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: "voice_unlock",
              label: "Unlock",
              emoji: { name: "🔓" },
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
    channelId: Channels.Voice,
    message: VOICE_MESSAGE,
  });
}

export default {
  name: "voice",
  register: async () => {},
  onReady,
  buttonHandlers,
} satisfies Feature;
