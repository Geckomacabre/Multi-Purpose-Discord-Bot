import { GuildMember } from "discord.js";
import logger from "../infrastructure/logger";
import { Roles } from "../constants";

const ROLE_ASSIGN_DELAY_MS = 5_000;

export const onMemberJoin = async (member: GuildMember): Promise<void> => {
  const { user, guild } = member;

  logger.debug(`Member join event triggered for ${user.tag} (${member.id})`);

  await new Promise((res) => setTimeout(res, ROLE_ASSIGN_DELAY_MS));

  try {
    const freshMember = await guild.members.fetch(member.id);
    await freshMember.roles.add(Roles.Newcomer);
    logger.info(`Added Newcomer role to ${freshMember.user.tag}`);
  } catch (err) {
    logger.error({ err }, `Error assigning Newcomer role to ${user.tag}`);
  }
};
