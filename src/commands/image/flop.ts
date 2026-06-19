import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'flop', description: 'Flop an image horizontally (mirror)', effect: fx.flop });
