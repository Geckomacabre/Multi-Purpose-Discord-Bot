import { makeTextImageCommand } from '../../utils/image/command.js';
import { reddit } from '../../utils/image/effects.js';
export default makeTextImageCommand({
  name: 'redditpost',
  description: 'Create a fake Reddit post with an image',
  effect: reddit,
  textOption: 'title',
  textDesc: 'Post title',
});
