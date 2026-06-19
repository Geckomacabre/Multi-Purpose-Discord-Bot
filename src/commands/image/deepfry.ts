import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'deepfry', description: 'Deep fry an image', effect: fx.deepfry });
