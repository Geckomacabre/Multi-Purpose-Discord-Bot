import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'freeze', description: 'Freeze the first frame of a GIF', effect: fx.freeze });
