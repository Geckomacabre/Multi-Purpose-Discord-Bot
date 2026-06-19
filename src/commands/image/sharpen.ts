import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'sharpen', description: 'Sharpen an image', effect: fx.sharpen });
