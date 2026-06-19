import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'slide', description: 'Make an image slide in (animated)', effect: fx.slide });
