import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  ModalSubmitInteraction,
} from "discord.js";
import { isValidDate } from "../../utils";
import { Roles } from "../../constants";
import { setBirthday } from "../../infrastructure/db";

export function createBirthdayModal() {
  return new ModalBuilder()
    .setCustomId("birthday_verification_modal")
    .setTitle("Age Verification")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("dob_input")
          .setLabel("Date of Birth")
          .setPlaceholder("MM / DD / YYYY")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(8)
          .setMaxLength(10),
      ),
    );
}

export async function processBirthdaySubmission(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const dob = interaction.fields.getTextInputValue("dob_input");
  const parts = dob.split("/");

  if (parts.length !== 3) {
    await interaction.reply({
      content: "❌ Format must be MM/DD/YYYY",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const month = parseInt(parts[0] ?? "");
  const day = parseInt(parts[1] ?? "");
  const year = parseInt(parts[2] ?? "");

  if (!isValidDate(month, day) || isNaN(year)) {
    await interaction.reply({
      content: "❌ Invalid date.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const birthDate = new Date(year, month - 1, day);
  const age = new Date().getFullYear() - birthDate.getFullYear();

  if (age < 18) {
    await interaction.reply({
      content: "❌ You must be 18+ to access the Midnight Lounge.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await setBirthday(interaction.user.id, month, day, year);

  const member = await interaction.guild?.members.fetch(interaction.user.id);

  await member?.roles.add(Roles.ClubMember);
  await member?.roles.remove(Roles.LoungeGuest).catch(() => null);

  await interaction.reply({
    content: "✅ Identity verified. Welcome to the Club.",
    flags: MessageFlags.Ephemeral,
  });
}

export const modalHandlers: Record<
  string,
  (interaction: ModalSubmitInteraction) => Promise<void>
> = {
  birthday_verification_modal: processBirthdaySubmission,
};
