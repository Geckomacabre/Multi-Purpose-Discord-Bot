import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'stretch', description: 'Stretch an image vertically', effect: fx.stretch });
