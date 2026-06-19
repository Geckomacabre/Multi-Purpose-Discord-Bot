import { makeImageCommand } from '../../utils/image/command';
import { watermark } from '../../utils/image/effects';
export default makeImageCommand({ name: 'reddit2', description: 'Add a Reddit watermark', effect: (b) => watermark(b, 'reddit.png') });
