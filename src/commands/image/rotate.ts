import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({
  name: 'rotate',
  description: 'Rotate an image by a given angle',
  effect: (buf, angle) => fx.rotate(buf, angle),
  extraOptions: b => b.addIntegerOption((o: any) => o.setName('angle').setDescription('Degrees to rotate (default 90)').setMinValue(1).setMaxValue(359)),
  getArgs: i => [i.options.getInteger('angle') ?? 90],
});
