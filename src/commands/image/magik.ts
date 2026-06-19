import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'magik', description: 'Apply liquid rescale (content-aware scale) distortion', effect: fx.magik });
