import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'explode', description: 'Explode/bulge distortion effect', effect: fx.explode });
