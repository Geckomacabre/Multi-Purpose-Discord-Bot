import { makeImageCommand } from '../../utils/image/command';
import { stretch } from '../../utils/image/effects';
export default makeImageCommand({ name: 'stretch', description: 'Stretch an image to 512x512', effect: stretch });
