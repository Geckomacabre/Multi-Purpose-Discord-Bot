import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'tile', description: 'Tile an image into a 4×4 grid', effect: fx.tile });
