import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'wide', description: 'Widen an image horizontally', effect: fx.wide });
