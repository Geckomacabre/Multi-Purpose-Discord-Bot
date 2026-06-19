import { makeImageCommand, fontChoices } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';

const PHASES = [
  'baby','canny','canny2','canny3','canny4','canny5','canny6','canny7','canny8',
  'goated','nerd','normal','uncanny','uncanny2','uncanny3','uncanny4','uncanny5',
  'uncanny6','uncanny7','uncanny8','uncle','young',
];
const randomPhase = () => PHASES[Math.floor(Math.random() * PHASES.length)];

export default makeImageCommand({
  name: 'uncanny',
  description: 'Mr. Incredible Becomes Uncanny meme — separate left and right text with a comma',
  effect: (buf, cap1, cap2, phase, font) => fx.uncanny(buf, cap1, cap2, `assets/images/uncanny/${phase}.png`, font),
  extraOptions: b => b
    .addStringOption((o: any) => o.setName('text').setDescription('Left text, right text (comma-separated)').setRequired(true))
    .addStringOption((o: any) => o.setName('phase').setDescription('Which uncanny image to use').addChoices(...PHASES.map(p => ({ name: p, value: p }))))
    .addStringOption((o: any) => o.setName('font').setDescription('Font to use').addChoices(...fontChoices)),
  getArgs: i => {
    const raw = i.options.getString('text', true);
    const [cap1 = '', cap2 = ''] = raw.split(/(?<!\\),/).map((s: string) => s.trim());
    return [cap1, cap2, i.options.getString('phase') ?? randomPhase(), i.options.getString('font') ?? undefined];
  },
});
