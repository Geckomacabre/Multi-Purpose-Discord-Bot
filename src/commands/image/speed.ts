import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'speed', description: 'Speed up a GIF', effect: fx.speed });
