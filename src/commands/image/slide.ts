import { makeImageCommand } from '../../utils/image/command';
import { slide } from '../../utils/image/effects';
export default makeImageCommand({ name: 'slide', description: 'Make an image slide in', effect: slide });
