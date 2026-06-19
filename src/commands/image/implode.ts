import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'implode', description: 'Implode/pinch distortion effect', effect: fx.implode });
