import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'speechbubble', description: 'Add a speech bubble overlay to an image', effect: fx.speechbubble });
