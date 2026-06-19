import { makeImageCommand } from '../../utils/image/command';
import { magik } from '../../utils/image/effects';
export default makeImageCommand({ name: 'magik', description: 'Apply a content-aware scale distortion to an image', effect: magik });
