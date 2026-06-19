import { makeImageCommand } from '../../utils/image/command';
import { rotate } from '../../utils/image/effects';
export default makeImageCommand({
  name: 'rotate',
  description: 'Rotate an image',
  effect: rotate,
  extraOptions: b => b.addIntegerOption(o => o.setName('degrees').setDescription('Degrees to rotate (default 90)').setChoices(
    { name: '90°', value: 90 }, { name: '180°', value: 180 }, { name: '270°', value: 270 }
  )),
  getArgs: i => [i.options.getInteger('degrees') ?? 90],
});
