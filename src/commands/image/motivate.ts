import { makeImageCommand, fontChoices } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({
  name: 'motivate',
  description: 'Add motivational poster text — separate top and bottom with a comma',
  effect: (buf, top, bottom, font) => fx.motivate(buf, top, bottom, font),
  extraOptions: b => b
    .addStringOption((o: any) => o.setName('text').setDescription('Top text, bottom text').setRequired(true))
    .addStringOption((o: any) => o.setName('font').setDescription('Font to use').addChoices(...fontChoices)),
  getArgs: i => {
    const raw = i.options.getString('text', true);
    const [top = '', bottom = ''] = raw.split(/(?<!\\),/).map((s: string) => s.trim());
    return [top, bottom, i.options.getString('font') ?? undefined];
  },
});
