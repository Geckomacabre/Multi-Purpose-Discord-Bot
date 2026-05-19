import { Client } from "discord.js";
import logger from "../infrastructure/logger";
import birthdayCheck from "./birthday-check";

type CronTask =
  | {
      name: string;
      intervalMs: number;
      run: (bot: Client) => Promise<void>;
    }
  | {
      name: string;
      start: (bot: Client) => void | Promise<void>;
    };

const tasks: CronTask[] = [birthdayCheck];

export function initCronJobs(bot: Client) {
  tasks.forEach((task) => {
    if ("start" in task) {
      logger.info(`Starting multi-schedule task: ${task.name}`);
      task.start(bot);
      return;
    }

    logger.info(
      `Scheduling cron task: ${task.name} every ${task.intervalMs / 1000} seconds`,
    );

    void task.run(bot).catch((error) => {
      logger.error(`Initial run failed for ${task.name}:`, error);
    });

    setInterval(async () => {
      try {
        await task.run(bot);
      } catch (error) {
        logger.error({ err: error }, `Cron task failed for ${task.name}`);
      }
    }, task.intervalMs);
  });
}
