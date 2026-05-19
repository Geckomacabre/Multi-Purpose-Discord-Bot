import { LinkedRoles } from "../constants";
import { GuildMember, PartialGuildMember } from "discord.js";
import { shouldHaveRole } from "../utils";

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

  if (added.size) {
    console.log(
      `Roles added to ${newMember.user.tag}:`,
      [...added.values()].map((r) => r.name),
    );
  }

  if (removed.size) {
    console.log(
      `Roles removed from ${newMember.user.tag}:`,
      [...removed.values()].map((r) => r.name),
    );
  }
};
