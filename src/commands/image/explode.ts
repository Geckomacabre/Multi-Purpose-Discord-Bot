import { makeImageCommand } from '../../utils/image/command';
import { explode } from '../../utils/image/effects';
export default makeImageCommand({ name: 'explode', description: 'Apply an explode distortion to an image', effect: explode });
