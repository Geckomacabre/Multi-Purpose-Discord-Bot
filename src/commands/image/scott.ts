import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'scott', description: 'Add the Scott the Woz face overlay', effect: fx.scott });
