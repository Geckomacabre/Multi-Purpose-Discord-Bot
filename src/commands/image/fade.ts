import { makeImageCommand } from '../../utils/image/command';
import { fade } from '../../utils/image/effects';
export default makeImageCommand({ name: 'fade', description: 'Fade an image to black', effect: fade });
