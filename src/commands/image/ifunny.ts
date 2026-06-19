import { makeImageCommand } from '../../utils/image/command';
import { watermark } from '../../utils/image/effects';
export default makeImageCommand({ name: 'ifunny', description: 'Add an iFunny watermark', effect: (b) => watermark(b, 'ifunny.png') });
