import {
  ButtonStyle,
  ComponentType,
  MessageFlags,
  type Client,
} from "discord.js";
import type { Feature } from "../feature";
import { Channels, Positions } from "../../constants";
import { syncSystemMessage, SystemMessage } from "../../utils";
import buttonHandlers from "./buttons";
import { modalHandlers } from "./modals";

const APPLICATIONS_MESSAGE: SystemMessage = {
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
            `## Applications`,
            ``,
            `### We're always looking for dedicated individuals.`,
            `Review each position carefully before applying, staff will follow up once your submission is reviewed.`,
          ].join("\n"),
        },
        { type: ComponentType.Separator, divider: true, spacing: 2 },
        ...Positions.flatMap((pos, i) => [
          {
            type: ComponentType.Section,
            accessory: {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: pos.custom_id,
              label: "Apply",
              disabled: !pos.open,
            },
            components: [
              {
                type: ComponentType.TextDisplay,
                content: [`<@&${pos.role_id}>`, `-# ${pos.description}`].join(
                  "\n",
                ),
              },
            ],
          },
          ...(i < Positions.length - 1
            ? [{ type: ComponentType.Separator, divider: true, spacing: 1 }]
            : []),
        ]),
      ],
    },
  ],
};

async function onReady(client: Client): Promise<void> {
  await syncSystemMessage({
    client,
    channelId: Channels.Applications,
    message: APPLICATIONS_MESSAGE,
  });
}

export default {
  name: "applications",
  register: async () => {},
  onReady,
  buttonHandlers,
  modalHandlers,
} satisfies Feature;
