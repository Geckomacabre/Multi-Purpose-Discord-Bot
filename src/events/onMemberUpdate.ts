import { LinkedRoles } from "../constants";
import {
  AuditLogEvent,
  ChannelType,
  EmbedBuilder,
  GuildMember,
  PartialGuildMember,
  PartialUser,
  User,
} from "discord.js";
import { shouldHaveRole } from "../utils";
import config from "../config";

const EMBED = {
  added: {
    title: "<:roleGiven:1514964541136572426> User Roles Added",
    color: "#54b470",
  },
  removed: {
    title: "<:roleTaken:1514963661071061171> User Roles Removed",
    color: "#da4b50",
  },
} as const;

type EmbedState = keyof typeof EMBED;

const formatRoles = (roles: Iterable<string>) =>
  [...roles].map((id) => `<@&${id}>`).join(", ");

export const onMemberUpdate = async (
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember,
) => {
  const oldRoles = oldMember.roles.cache;
  const newRoles = newMember.roles.cache;

  const roleIds = new Set(newRoles.keys());

  for (const rule of LinkedRoles) {
    const hasParent = newRoles.has(rule.parent);
    const shouldHave = shouldHaveRole(rule, roleIds);

    if (shouldHave === hasParent) continue;

    if (shouldHave) {
      await newMember.roles.add(rule.parent).catch(() => null);
    } else {
      await newMember.roles.remove(rule.parent).catch(() => null);
    }
  }

  const added = newRoles.filter((role) => !oldRoles.has(role.id));
  const removed = oldRoles.filter((role) => !newRoles.has(role.id));

  if (!added.size && !removed.size) return;

  const state: EmbedState = added.size ? "added" : "removed";
  const { title, color } = EMBED[state];

  let executor: User | PartialUser | null = null;

  try {
    const logs = await newMember.guild.fetchAuditLogs({
      type: AuditLogEvent.MemberRoleUpdate,
      limit: 5,
    });

    const changedRoleIds = new Set([...added.keys(), ...removed.keys()]);

    const entry = logs.entries.find((e) => {
      if (!e.target || e.target.id !== newMember.id) return false;

      const isRecent = Date.now() - e.createdTimestamp < 5000;
      if (!isRecent) return false;

      if (!e.executor) return false;

      const isSelfAction = e.executor.id === newMember.id;
      if (isSelfAction) return false;

      const roleChanges =
        e.changes?.flatMap((c: any) => c.new ?? c.old ?? []) ?? [];

      const logRoleIds = new Set(roleChanges.map((r: any) => r.id));

      const overlaps = [...changedRoleIds].some((id) => logRoleIds.has(id));

      return overlaps;
    });

    executor = entry?.executor ?? null;
  } catch {
    executor = null;
  }

  const logChannel = newMember.guild.channels.cache.get(
    config.ACTION_LOG_CHANNEL,
  );
  if (!logChannel || logChannel.type !== ChannelType.GuildText) return;

  const desc = [
    `> **User:** <@${newMember.user.id}> (${newMember.user.tag})`,
    added.size ? `> **Added:** ${formatRoles(added.keys())}` : null,
    removed.size ? `> **Removed:** ${formatRoles(removed.keys())}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const logEmbed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setAuthor({
      name: newMember.user.username,
      iconURL: newMember.user.displayAvatarURL(),
    })
    .setDescription(desc)
    .setTimestamp();

  if (executor) {
    logEmbed.setFooter({
      text: `${state.charAt(0).toUpperCase() + state.slice(1)} by @${executor?.username}`,
      iconURL: executor?.displayAvatarURL(),
    });
  }

  await logChannel.send({ embeds: [logEmbed] });
};
