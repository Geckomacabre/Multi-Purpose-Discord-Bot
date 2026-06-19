import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'invert', description: 'Invert the colors of an image', effect: fx.invert });
