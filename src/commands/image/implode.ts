import { makeImageCommand } from '../../utils/image/command';
import { implode } from '../../utils/image/effects';
export default makeImageCommand({ name: 'implode', description: 'Apply an implode distortion to an image', effect: implode });
