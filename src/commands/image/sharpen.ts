import { makeImageCommand } from '../../utils/image/command';
import { sharpenEffect } from '../../utils/image/effects';
export default makeImageCommand({ name: 'sharpen', description: 'Sharpen an image', effect: sharpenEffect });
