import { makeImageCommand } from '../../utils/image/command';
import { swirl } from '../../utils/image/effects';
export default makeImageCommand({ name: 'swirl', description: 'Apply a swirl distortion to an image', effect: swirl });
