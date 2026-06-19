import { makeImageCommand } from '../../utils/image/command';
import { speed } from '../../utils/image/effects';
export default makeImageCommand({
  name: 'speed',
  description: 'Speed up a GIF',
  effect: speed,
  extraOptions: b => b.addNumberOption(o => o.setName('multiplier').setDescription('Speed multiplier (default 2)').setMinValue(1.1).setMaxValue(10)),
  getArgs: i => [i.options.getNumber('multiplier') ?? 2],
});
