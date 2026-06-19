import { makeImageCommand } from '../../utils/image/command';
import { circle } from '../../utils/image/effects';
export default makeImageCommand({ name: 'circle', description: 'Crop an image into a circle', effect: circle });
