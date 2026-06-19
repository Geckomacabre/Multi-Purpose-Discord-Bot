import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'vignette', description: 'Add a vignette effect to an image', effect: fx.vignette });
