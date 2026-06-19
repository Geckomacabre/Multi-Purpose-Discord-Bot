import { makeNoImageCommand } from '../../utils/image/command';
import { spotify } from '../../utils/image/effects';
export default makeNoImageCommand({
  name: 'spotify',
  description: 'Create a fake Spotify now playing card',
  buildOptions: b => b
    .addStringOption(o => o.setName('song').setDescription('Song name').setRequired(true))
    .addStringOption(o => o.setName('artist').setDescription('Artist name').setRequired(true)),
  run: async i => spotify(i.options.getString('song', true), i.options.getString('artist', true)),
});
