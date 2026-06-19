import { makeImageCommand } from '../../utils/image/command';
import { flag } from '../../utils/image/effects';
export default makeImageCommand({ name: 'transflag', description: 'Overlay a transgender flag on an image', effect: (b) => flag(b, 'transflag.png') });
