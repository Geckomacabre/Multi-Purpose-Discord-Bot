import { makeImageCommand } from '../../utils/image/command';
import { makeGif } from '../../utils/image/effects';
export default makeImageCommand({ name: 'gif', description: 'Convert an image to a GIF', effect: makeGif });
