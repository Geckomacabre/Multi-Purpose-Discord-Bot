import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'unfreeze', description: 'Loop a frozen GIF back to all frames', effect: fx.unfreeze });
