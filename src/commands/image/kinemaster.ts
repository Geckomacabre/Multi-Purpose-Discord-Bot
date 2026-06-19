import { makeImageCommand } from '../../utils/image/command';
import { watermark } from '../../utils/image/effects';
export default makeImageCommand({ name: 'kinemaster', description: 'Add a KineMaster watermark', effect: (b) => watermark(b, 'kinemaster.png') });
