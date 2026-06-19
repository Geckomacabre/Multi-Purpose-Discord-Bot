import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({
  name: 'hue',
  description: 'Shift the hue of an image',
  effect: (buf, shift) => fx.hue(buf, shift),
  extraOptions: b => b.addIntegerOption((o: any) => o.setName('shift').setDescription('Hue shift in degrees 0-360 (default 180)').setMinValue(0).setMaxValue(360)),
  getArgs: i => [i.options.getInteger('shift') ?? 180],
});
