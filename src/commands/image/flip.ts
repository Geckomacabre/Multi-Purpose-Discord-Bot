import { makeImageCommand } from '../../utils/image/command';
import { flip } from '../../utils/image/effects';
export default makeImageCommand({ name: 'flip', description: 'Flip an image vertically', effect: flip });
