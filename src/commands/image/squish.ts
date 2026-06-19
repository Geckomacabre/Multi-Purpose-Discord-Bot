import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'squish', description: 'Squish an image vertically (animated)', effect: fx.squish });
