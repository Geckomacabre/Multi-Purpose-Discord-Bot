import { GuildMember } from "discord.js";
import logger from "../infrastructure/logger";
import { Roles } from "../constants";

export const onMemberJoin = async (member: GuildMember): Promise<void> => {
  const { user, guild } = member;

  logger.debug(`Member join event triggered for ${user.tag} (${member.id})`);

  try {
    await new Promise((res) => setTimeout(res, 5_000));

    const freshMember = await guild.members.fetch(member.id).catch(() => null);
    if (!freshMember) return;

    if (user.bot) {
      await freshMember.roles.add(Roles.MidnightSystems);
      logger.info(`Added Midnight Systems role to ${freshMember.user.tag}`);
      return;
    }

    await freshMember.roles.add(Roles.Newcomer);
    logger.info(`Added Newcomer role to ${freshMember.user.tag}`);
  } catch (err) {
    logger.error({ err }, `Error assigning role to ${user.tag}`);
  }
};
