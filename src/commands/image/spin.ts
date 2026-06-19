import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'spin', description: 'Animate an image spinning', effect: fx.spin });
