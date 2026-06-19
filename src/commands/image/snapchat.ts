import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({
  name: 'snapchat',
  description: 'Add a Snapchat-style text bar to an image',
  effect: (buf, caption, pos) => fx.snapchat(buf, caption, pos),
  extraOptions: b => b
    .addStringOption((o: any) => o.setName('text').setDescription('Caption text').setRequired(true))
    .addIntegerOption((o: any) => o.setName('position').setDescription('Vertical position 0-100 (default center)').setMinValue(0).setMaxValue(100)),
  getArgs: i => [i.options.getString('text', true), i.options.getInteger('position') ?? undefined],
});
