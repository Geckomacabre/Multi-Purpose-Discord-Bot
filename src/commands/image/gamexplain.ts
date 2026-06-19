import { makeImageCommand } from '../../utils/image/command.js';
import { gamexplain } from '../../utils/image/effects.js';
export default makeImageCommand({ name: 'gamexplain', description: 'Add a Gamexplain-style logo overlay to an image', effect: gamexplain });
