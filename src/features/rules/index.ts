import { ComponentType, MessageFlags, type Client } from "discord.js";
import type { Feature } from "../feature";
import { Channels } from "../../constants";
import { syncSystemMessage, SystemMessage } from "../../utils";

const RULES_MESSAGE: SystemMessage = {
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
            `## Server Rules`,
            ``,
            `### Conduct yourself with respect.`,
            `These rules apply to all members at all times. Ignorance of the rules is not an excuse.`,
          ].join("\n"),
        },
        { type: ComponentType.Separator, divider: true, spacing: 2 },
        {
          type: ComponentType.TextDisplay,
          content: [
            `**1. Respect all members & keep content appropriate**`,
            `-# Derogatory, toxic, or discriminatory language and behavior will not be tolerated. NSFW content or media is strictly prohibited anywhere in the server.`,
            ``,
            `**2. No spamming & post in the correct channels**`,
            `-# Repeated messages, excessive mentions, and soundboard abuse are not permitted. Use the appropriate channels for your content and keep promotion to designated channels only.`,
            ``,
            `**3. Protect your privacy**`,
            `-# Do not share personally identifiable information such as real names, addresses, or phone numbers — yours or anyone else's.`,
            ``,
            `**4. Let staff handle moderation**`,
            `-# If you believe someone is violating the rules, report it to a staff member rather than taking matters into your own hands.`,
            ``,
            `**5. Abide by Discord's Terms of Service**`,
            `-# All members must comply with Discord's Terms of Service and Community Guidelines at all times. You can find them at discord.com/terms.`,
          ].join("\n"),
        },
        { type: ComponentType.Separator, divider: true, spacing: 2 },
        {
          type: ComponentType.TextDisplay,
          content: `-# The rules listed above are not exhaustive and each situation is handled at the discretion of the Staff team. Depending on the severity and nature of the violation, consequences may include a mute, kick, or ban.`,
        },
      ],
    },
  ],
};

async function onReady(client: Client): Promise<void> {
  await syncSystemMessage({
    client,
    channelId: Channels.Rules,
    message: RULES_MESSAGE,
  });
}

export default {
  name: "rules",
  register: async () => {},
  onReady,
} satisfies Feature;
