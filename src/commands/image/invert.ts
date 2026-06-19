import { makeImageCommand } from '../../utils/image/command';
import { invert } from '../../utils/image/effects';
export default makeImageCommand({ name: 'invert', description: 'Invert the colors of an image', effect: invert });
