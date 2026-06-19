import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'woow', description: 'Mirror the top half of an image downward', effect: fx.woow });
