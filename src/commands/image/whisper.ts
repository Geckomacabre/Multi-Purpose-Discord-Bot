import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({
  name: 'whisper',
  description: 'Add a whisper-style subtitle text to an image',
  effect: (buf, caption) => fx.whisper(buf, caption),
  extraOptions: b => b.addStringOption((o: any) => o.setName('text').setDescription('Subtitle text').setRequired(true)),
  getArgs: i => [i.options.getString('text', true)],
});
