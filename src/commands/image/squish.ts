import { makeImageCommand } from '../../utils/image/command';
import { squish } from '../../utils/image/effects';
export default makeImageCommand({ name: 'squish', description: 'Squish an image vertically', effect: squish });
