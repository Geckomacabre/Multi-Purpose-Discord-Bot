import { makeImageCommand } from '../../utils/image/command';
import { watermark } from '../../utils/image/effects';
export default makeImageCommand({ name: 'memecenter', description: 'Add a MemeCenter watermark', effect: (b) => watermark(b, 'memecenter.png') });
