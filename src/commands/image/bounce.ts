import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'bounce', description: 'Make an image bounce (animated GIF)', effect: fx.bounce });
