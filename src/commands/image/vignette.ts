import { makeImageCommand } from '../../utils/image/command';
import { vignette } from '../../utils/image/effects';
export default makeImageCommand({ name: 'vignette', description: 'Add a vignette effect to an image', effect: vignette });
