import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'waaw', description: 'Mirror the bottom half of an image upward', effect: fx.waaw });
