import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'togif', description: 'Convert an image to a GIF', effect: fx.makeGif });
