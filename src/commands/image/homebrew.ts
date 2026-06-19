import { makeNoImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeNoImageCommand({
  name: 'homebrew',
  description: 'Generate a fake Homebrew install message',
  buildOptions: b => b.addStringOption((o: any) => o.setName('text').setDescription('Package/caption text').setRequired(true)),
  run: i => fx.homebrew(i.options.getString('text', true)),
});
