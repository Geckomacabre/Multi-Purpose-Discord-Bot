import { makeImageCommand } from '../../utils/image/command';
import { hue } from '../../utils/image/effects';
export default makeImageCommand({
  name: 'hue',
  description: 'Shift the hue of an image',
  effect: hue,
  extraOptions: b => b.addIntegerOption(o => o.setName('degrees').setDescription('Hue shift in degrees (default 180)').setMinValue(0).setMaxValue(359)),
  getArgs: i => [i.options.getInteger('degrees') ?? 180],
});
