import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'swirl', description: 'Swirl/whirl an image', effect: fx.swirl });
