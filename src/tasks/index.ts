import type { Client } from 'discord.js';

export type CronTask = {
  name: string;
  frequency: Bun.CronWithAutocomplete | 'once';
  run: (bot: Client) => Promise<void>;
};

export function initCronJobs(bot: Client) {
  const tasks: CronTask[] = [
    // Add scheduled tasks here, e.g.:
    // {
    //   name: 'Daily cleanup',
    //   frequency: '0 0 * * *',
    //   run: async (bot) => { ... },
    // },
  ];

  for (const task of tasks) {
    const runSafe = async () => {
      try {
        await task.run(bot);
      } catch (error) {
        console.error(`Cron task failed: ${task.name}`, error);
      }
    };

    if (task.frequency === 'once') {
      runSafe();
      continue;
    }

    Bun.cron(task.frequency, runSafe);
  }
}
