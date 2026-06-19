import { makeImageCommand, fontChoices } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({
  name: 'meme',
  description: 'Add Impact meme text to an image — separate top and bottom with a comma',
  effect: (buf, top, bottom, font) => fx.meme(buf, top, bottom, font),
  extraOptions: b => b
    .addStringOption((o: any) => o.setName('text').setDescription('Top text, bottom text').setRequired(true))
    .addBooleanOption((o: any) => o.setName('case').setDescription('Preserve text case (default: UPPERCASE)'))
    .addStringOption((o: any) => o.setName('font').setDescription('Font to use').addChoices(...fontChoices)),
  getArgs: i => {
    const raw = i.options.getString('text', true);
    const keep = i.options.getBoolean('case') ?? false;
    const [rawTop = '', rawBot = ''] = raw.split(/(?<!\\),/).map((s: string) => s.trim());
    return [keep ? rawTop : rawTop.toUpperCase(), keep ? rawBot : rawBot.toUpperCase(), i.options.getString('font') ?? undefined];
  },
});
