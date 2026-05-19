import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  GuildMember,
  MessageFlags,
  InteractionContextType,
} from "discord.js";
import { Command } from "../../interfaces/command";
import { LinkedRoles } from "../../constants";
import { shouldHaveRole } from "../../utils";

async function syncMember(member: GuildMember) {
  const roleIds = new Set(member.roles.cache.keys());

  for (const rule of LinkedRoles) {
    const shouldHave = shouldHaveRole(rule, roleIds);
    const hasParent = roleIds.has(rule.parent);

    if (shouldHave && !hasParent) {
      await member.roles.add(rule.parent).catch(() => null);
    }

    if (!shouldHave && hasParent) {
      await member.roles.remove(rule.parent).catch(() => null);
    }
  }
}

async function syncGuildMembers(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) return;

  const members = await guild.members.fetch();

  let processed = 0;

  for (const member of members.values()) {
    await syncMember(member);
    processed++;
  }

  return processed;
}

const RoleSync: Command = {
  data: new SlashCommandBuilder()
    .setName("rolesync")
    .setDescription("Sync all linked roles across the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts([InteractionContextType.Guild]),

  async run(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    await interaction.reply({
      content: "Starting full role sync...",
      flags: MessageFlags.Ephemeral,
    });

    const count = await syncGuildMembers(interaction);

    await interaction.followUp({
      content: `Done syncing ${count} members.`,
    });
  },
};

export default RoleSync;
