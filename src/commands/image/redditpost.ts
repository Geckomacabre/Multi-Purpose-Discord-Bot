import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({
  name: 'redditpost',
  description: 'Add a Reddit post title overlay to an image',
  effect: (buf, caption) => fx.reddit(buf, caption),
  extraOptions: b => b.addStringOption((o: any) => o.setName('title').setDescription('Post title text').setRequired(true)),
  getArgs: i => [i.options.getString('title', true)],
});
