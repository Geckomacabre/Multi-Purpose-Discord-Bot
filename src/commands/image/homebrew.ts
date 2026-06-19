import { makeNoImageCommand } from '../../utils/image/command';
import { homebrew } from '../../utils/image/effects';
export default makeNoImageCommand({
  name: 'homebrew',
  description: 'Create a Wii Homebrew Channel meme',
  buildOptions: b => b.addStringOption(o => o.setName('text').setDescription('App name').setRequired(true)),
  run: async i => homebrew(i.options.getString('text', true)),
});
