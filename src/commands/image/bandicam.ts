import { makeImageCommand } from '../../utils/image/command';
import { watermark } from '../../utils/image/effects';
export default makeImageCommand({ name: 'bandicam', description: 'Add a Bandicam watermark', effect: (b) => watermark(b, 'bandicam.png') });
