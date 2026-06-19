import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'slow', description: 'Slow down an animated GIF', effect: fx.slow });
