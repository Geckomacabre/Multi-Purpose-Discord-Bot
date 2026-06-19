import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'flip', description: 'Flip an image vertically', effect: fx.flip });
