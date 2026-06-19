import { makeImageCommand } from '../../utils/image/command';
import { watermark } from '../../utils/image/effects';
export default makeImageCommand({ name: 'hypercam', description: 'Add a HyperCam watermark', effect: (b) => watermark(b, 'hypercam.png') });
