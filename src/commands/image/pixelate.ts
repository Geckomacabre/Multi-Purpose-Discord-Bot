import { makeImageCommand } from '../../utils/image/command';
import { pixelate } from '../../utils/image/effects';
export default makeImageCommand({
  name: 'pixelate',
  description: 'Pixelate an image',
  effect: pixelate,
  extraOptions: b => b.addIntegerOption(o => o.setName('amount').setDescription('Pixel size (default 16)').setMinValue(2).setMaxValue(64)),
  getArgs: i => [i.options.getInteger('amount') ?? 16],
});
