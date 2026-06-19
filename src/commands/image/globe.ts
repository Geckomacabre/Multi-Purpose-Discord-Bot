import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'globe', description: 'Wrap an image onto a spinning globe', effect: fx.globe });
