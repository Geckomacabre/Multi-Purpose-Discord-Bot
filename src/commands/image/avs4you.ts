import { makeImageCommand } from '../../utils/image/command';
import { watermark } from '../../utils/image/effects';
export default makeImageCommand({ name: 'avs4you', description: 'Add an AVS4YOU watermark', effect: (b) => watermark(b, 'avs4you.png') });
