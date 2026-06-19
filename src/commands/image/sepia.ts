import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'sepia', description: 'Apply a sepia tone to an image', effect: fx.sepia });
