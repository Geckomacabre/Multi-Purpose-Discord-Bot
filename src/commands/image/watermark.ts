import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';

const BRANDS = [
  { name: '9GAG', value: 'assets/images/9gag.png' },
  { name: 'AVS4YOU', value: 'assets/images/avs4you.png' },
  { name: 'Bandicam', value: 'assets/images/bandicam.png' },
  { name: 'DeviantArt', value: 'assets/images/deviantart.png' },
  { name: 'HBC', value: 'assets/images/hbc.png' },
  { name: 'HyperCam', value: 'assets/images/hypercam.png' },
  { name: 'iFunny', value: 'assets/images/ifunny.png' },
  { name: 'KineMaster', value: 'assets/images/kinemaster.png' },
  { name: 'MemeCenter', value: 'assets/images/memecenter.png' },
  { name: 'PowerDirector', value: 'assets/images/powerdirector.png' },
  { name: 'Shutterstock', value: 'assets/images/shutterstock.png' },
];

export default makeImageCommand({
  name: 'watermark',
  description: 'Add a brand watermark to an image',
  effect: (buf, brand) => fx.watermark(buf, brand),
  extraOptions: b => b.addStringOption((o: any) =>
    o.setName('brand').setDescription('Watermark brand').setRequired(true).addChoices(...BRANDS)
  ),
  getArgs: i => [i.options.getString('brand', true)],
});
