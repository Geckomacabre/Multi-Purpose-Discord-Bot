import { makeImageCommand } from '../../utils/image/command';
import { wide } from '../../utils/image/effects';
export default makeImageCommand({ name: 'wide', description: 'Stretch an image to be very wide', effect: wide });
