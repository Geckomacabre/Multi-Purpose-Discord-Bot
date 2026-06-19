import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'soos', description: 'Reverse a GIF, then repeat (Soos effect)', effect: fx.soos });
