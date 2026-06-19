import { makeImageCommand } from '../../utils/image/command';
import { blur } from '../../utils/image/effects';
export default makeImageCommand({ name: 'blur', description: 'Blur an image', effect: blur });
