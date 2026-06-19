import { makeImageCommand } from '../../utils/image/command';
import { crop } from '../../utils/image/effects';
export default makeImageCommand({ name: 'crop', description: 'Crop an image to a square', effect: crop });
