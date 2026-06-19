import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'reverse', description: 'Reverse a GIF', effect: fx.reverse });
