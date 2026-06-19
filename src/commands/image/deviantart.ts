import { makeImageCommand } from '../../utils/image/command';
import { watermark } from '../../utils/image/effects';
export default makeImageCommand({ name: 'deviantart', description: 'Add a DeviantArt watermark', effect: (b) => watermark(b, 'deviantart.png') });
