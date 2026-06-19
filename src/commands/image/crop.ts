import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'crop', description: 'Square-crop an image', effect: fx.crop });
