import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({
  name: 'jpeg',
  description: 'Reduce JPEG quality of an image',
  effect: (buf, quality) => fx.jpeg(buf, quality),
  extraOptions: b => b.addIntegerOption((o: any) => o.setName('quality').setDescription('JPEG quality 1-100 (default 1, lower = more compressed)').setMinValue(1).setMaxValue(100)),
  getArgs: i => [i.options.getInteger('quality') ?? 1],
});
