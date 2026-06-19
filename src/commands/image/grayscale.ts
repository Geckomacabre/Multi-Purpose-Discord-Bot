import { makeImageCommand } from '../../utils/image/command';
import { grayscale } from '../../utils/image/effects';
export default makeImageCommand({ name: 'grayscale', description: 'Convert an image to grayscale', effect: grayscale });
