import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'grayscale', description: 'Convert an image to grayscale', effect: fx.grayscale });
