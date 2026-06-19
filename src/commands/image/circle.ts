import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'circle', description: 'Crop an image into a circle', effect: fx.circle });
