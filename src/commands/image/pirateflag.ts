import { makeImageCommand } from '../../utils/image/command';
import { flag } from '../../utils/image/effects';
export default makeImageCommand({ name: 'pirateflag', description: 'Overlay a pirate flag on an image', effect: (b) => flag(b, 'pirateflag.png') });
