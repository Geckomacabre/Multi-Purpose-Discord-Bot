import { makeImageCommand } from '../../utils/image/command';
import { watermark } from '../../utils/image/effects';
export default makeImageCommand({ name: '9gag', description: 'Add a 9GAG watermark', effect: (b) => watermark(b, '9gag.png') });
