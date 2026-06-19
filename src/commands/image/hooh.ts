import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'hooh', description: 'Mirror the right half of an image', effect: fx.hooh });
