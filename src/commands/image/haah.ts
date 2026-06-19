import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'haah', description: 'Mirror the left half of an image', effect: fx.haah });
