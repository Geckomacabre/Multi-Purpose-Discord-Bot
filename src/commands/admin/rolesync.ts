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

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function syncMember(member: GuildMember) {
  const roleIds = new Set(member.roles.cache.keys());
  let changed = false;

  for (const rule of LinkedRoles) {
    const shouldHave = shouldHaveRole(rule, roleIds);
    const hasParent = roleIds.has(rule.parent);

    if (shouldHave && !hasParent) {
      await member.roles.add(rule.parent).catch(() => null);
      changed = true;
    }

    if (!shouldHave && hasParent) {
      await member.roles.remove(rule.parent).catch(() => null);
      changed = true;
    }
  }

  return changed;
}

async function syncGuildMembers(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;

  if (!guild) {
    return { processed: 0, changedCount: 0 };
  }

  const members = await guild.members.fetch();
  const allMembers = Array.from(members.values());

  const total = allMembers.length;

  const chunkSize = 25;

  let processed = 0;
  let changedCount = 0;

  for (let i = 0; i < total; i += chunkSize) {
    const chunk = allMembers.slice(i, i + chunkSize);

    let chunkChanges = 0;

    await Promise.all(
      chunk.map(async (member) => {
        const changed = await syncMember(member);
        if (changed) chunkChanges++;
      }),
    );

    processed += chunk.length;
    changedCount += chunkChanges;

    await interaction.editReply({
      content: `Syncing roles... ${processed}/${total} (${((processed / total) * 100).toFixed(1)}%) • Changes: ${changedCount}`,
    });

    await sleep(800);
  }

  return { processed, changedCount };
}

const RoleSync: Command = {
  data: new SlashCommandBuilder()
    .setName("rolesync")
    .setDescription("Sync all linked roles across the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts([InteractionContextType.Guild]),

  async run(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    await interaction.editReply({
      content: "Starting role sync...",
    });

    const { processed, changedCount } = await syncGuildMembers(interaction);

    if (changedCount === 0) {
      await interaction.editReply({
        content: `Everything is already in sync. No changes were needed. (${processed} members checked)`,
      });
      return;
    }

    await interaction.editReply({
      content: `Sync complete. Updated ${changedCount} of ${processed} members.`,
    });
    return;
  },
};

export default RoleSync;
