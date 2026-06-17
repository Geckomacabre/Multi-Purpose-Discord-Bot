import { ApplicationIntegrationType, ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../interfaces/command';

function safeEval(expr: string): number {
  // Strip anything that isn't math symbols, numbers, or whitespace
  const sanitized = expr.replace(/[^0-9+\-*/.()%^ ]/g, '');
  // Convert ^ to ** for exponentiation
  const js = sanitized.replace(/\^/g, '**');
  // Use Function constructor in a limited scope
  return Function(`"use strict"; return (${js})`)();
}

const Calc: Command = {
  data: new SlashCommandBuilder()
    .setName('calc')
    .setDescription('Evaluate a math expression')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM])
    .addStringOption(o => o.setName('expression').setDescription('Math expression (e.g. 2+2, 10*5, 2^8)').setRequired(true)) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const expr = interaction.options.getString('expression', true);
    try {
      const result = safeEval(expr);
      if (!isFinite(result)) throw new Error('Result is not finite');
      await interaction.reply(`🧮 \`${expr}\` = **${result}**`);
    } catch {
      await interaction.reply({ content: '❌ Invalid expression.', ephemeral: true });
    }
  },
};

export default Calc;
