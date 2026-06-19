import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({
  name: 'pixelate',
  description: 'Pixelate an image',
  effect: (buf, amount) => fx.pixelate(buf, amount),
  extraOptions: b => b.addIntegerOption((o: any) => o.setName('amount').setDescription('Pixel size (default 16, higher = more pixelated)').setMinValue(2).setMaxValue(128)),
  getArgs: i => [i.options.getInteger('amount') ?? 16],
});
