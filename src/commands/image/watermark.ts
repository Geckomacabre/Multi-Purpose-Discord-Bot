import { makeImageCommand } from '../../utils/image/command';
import { watermark } from '../../utils/image/effects';
export default makeImageCommand({ name: 'watermark', description: 'Add a Shutterstock watermark', effect: (b) => watermark(b, 'shutterstock.png') });
