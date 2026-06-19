import { makeImageCommand } from '../../utils/image/command.js';
import { rotate } from '../../utils/image/effects.js';
export default makeImageCommand({
  name: 'rotate',
  description: 'Rotate an image 90, 180, or 270 degrees',
  effect: rotate,
  extraOptions: b => b.addIntegerOption(o => o.setName('degrees').setDescription('Degrees to rotate (default 90)').setChoices(
    { name: '90°', value: 90 }, { name: '180°', value: 180 }, { name: '270°', value: 270 }
  )),
  getArgs: i => [i.options.getInteger('degrees') ?? 90],
});
