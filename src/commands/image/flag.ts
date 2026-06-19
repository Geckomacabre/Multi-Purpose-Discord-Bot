import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';

const FLAGS = [
  { name: 'Checkered', value: 'assets/images/checkeredflag.png' },
  { name: 'Pirate', value: 'assets/images/pirateflag.png' },
  { name: 'Rainbow (Pride)', value: 'assets/images/rainbowflag.png' },
  { name: 'Trans Pride', value: 'assets/images/transflag.png' },
];

export default makeImageCommand({
  name: 'flag',
  description: 'Overlay a flag on an image',
  effect: (buf, overlay) => fx.flag(buf, overlay),
  extraOptions: b => b.addStringOption((o: any) =>
    o.setName('flag').setDescription('Flag to overlay').setRequired(true).addChoices(...FLAGS)
  ),
  getArgs: i => [i.options.getString('flag', true)],
});
