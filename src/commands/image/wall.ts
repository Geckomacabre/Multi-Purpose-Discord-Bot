import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'wall', description: 'Tile an image across the screen as a wall', effect: fx.wall });
