import {
  ModalBuilder,
  LabelBuilder,
  CheckboxGroupBuilder,
  CheckboxGroupOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  ModalSubmitInteraction,
  EmbedBuilder,
  Colors,
  TextChannel,
} from "discord.js";
import { Positions } from "../../constants";
import { ApplicationPosition, ApplicationQuestion } from "../../types";
import Config from "../../config";

function buildLabel(q: ApplicationQuestion): LabelBuilder {
  const label = new LabelBuilder().setLabel(q.label);
  if (q.type !== "checkbox" && q.description)
    label.setDescription(q.description);

  switch (q.type) {
    case "checkbox": {
      // Single yes/no — use a one-option CheckboxGroup (no native single
      // Checkbox builder yet; CheckboxGroup with one option is equivalent)
      const group = new CheckboxGroupBuilder()
        .setCustomId(q.custom_id)
        .setRequired(false)
        .setOptions(
          new CheckboxGroupOptionBuilder()
            .setLabel(q.description ?? q.label)
            .setValue("checked"),
        );
      return label.setCheckboxGroupComponent(group);
    }

    case "checkbox_group": {
      const group = new CheckboxGroupBuilder()
        .setCustomId(q.custom_id)
        .setRequired(!!q.required)
        .setOptions(
          ...q.options.map((o) => {
            const opt = new CheckboxGroupOptionBuilder()
              .setLabel(o.label)
              .setValue(o.value);
            if (o.description) opt.setDescription(o.description);
            return opt;
          }),
        );
      if (q.min !== undefined) group.setMinValues(q.min);
      if (q.max !== undefined) group.setMaxValues(q.max);
      return label.setCheckboxGroupComponent(group);
    }

    case "paragraph": {
      const input = new TextInputBuilder()
        .setCustomId(q.custom_id)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(!!q.required);
      if (q.placeholder) input.setPlaceholder(q.placeholder);
      return label.setTextInputComponent(input);
    }

    default: {
      const input = new TextInputBuilder()
        .setCustomId(q.custom_id)
        .setStyle(TextInputStyle.Short)
        .setRequired(!!q.required);
      if ("placeholder" in q && q.placeholder)
        input.setPlaceholder(q.placeholder as string);
      return label.setTextInputComponent(input);
    }
  }
}

export function createApplicationModal(position: ApplicationPosition) {
  const modal = new ModalBuilder()
    .setCustomId(`application_modal:${position.custom_id}`)
    .setTitle(`Apply for ${position.label}`);

  modal.addLabelComponents(...position.questions.slice(0, 10).map(buildLabel));

  return modal;
}

function fmt(val: string | readonly string[] | boolean | null): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "✅ Yes" : "❌ No";
  if (Array.isArray(val)) return val.length ? val.join(", ") : "—";
  return (val as string).trim() || "—";
}

export async function processApplicationSubmission(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const [prefix, positionId] = interaction.customId.split(":");
  if (prefix !== "application_modal") return;

  const position = Positions.find((p) => p.custom_id === positionId);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const fields = (position?.questions ?? []).slice(0, 10).map((q) => {
    let value: string;

    try {
      switch (q.type) {
        case "checkbox":
          value = fmt(
            interaction.fields
              .getCheckboxGroup(q.custom_id)
              .includes("checked"),
          );
          break;
        case "checkbox_group":
          value = fmt(interaction.fields.getCheckboxGroup(q.custom_id));
          break;
        default:
          value = fmt(interaction.fields.getTextInputValue(q.custom_id));
      }
    } catch {
      value = "—";
    }

    return { name: q.label.slice(0, 256), value };
  });

  const embed = new EmbedBuilder()
    .setTitle(`📋 New Application — ${position?.label ?? positionId}`)
    .setColor(Colors.Blurple)
    .setAuthor({
      name: interaction.user.tag,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .addFields(fields)
    .setFooter({ text: `User ID: ${interaction.user.id}` })
    .setTimestamp();

  try {
    const channel = await interaction.client.channels.fetch(
      Config.ACTION_LOG_CHANNEL,
    );
    if (channel instanceof TextChannel) {
      await channel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error("[Applications] Failed to post submission:", err);
  }

  await interaction.editReply({
    content: `✅ Your application for **${position?.label ?? "the position"}** has been submitted! Staff will review it shortly.`,
  });
}

export const modalHandlers: Record<
  string,
  (interaction: ModalSubmitInteraction) => Promise<void>
> = Object.fromEntries(
  Positions.map((p) => [
    `application_modal:${p.custom_id}`,
    processApplicationSubmission,
  ]),
);
