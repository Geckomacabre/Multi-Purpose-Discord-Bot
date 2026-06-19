import { makeImageCommand } from '../../utils/image/command';
import { flag } from '../../utils/image/effects';
export default makeImageCommand({ name: 'flag', description: 'Overlay a rainbow flag on an image', effect: (b) => flag(b, 'rainbowflag.png') });
