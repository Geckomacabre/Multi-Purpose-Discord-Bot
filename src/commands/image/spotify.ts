import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({
  name: 'spotify',
  description: 'Generate a fake Spotify "Now Playing" card',
  effect: (buf, caption) => fx.spotify(buf, caption),
  extraOptions: b => b.addStringOption((o: any) => o.setName('song').setDescription('Song name to display').setRequired(true)),
  getArgs: i => [i.options.getString('song', true)],
});
