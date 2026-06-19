import { makeImageCommand } from '../../utils/image/command';
import { freeze } from '../../utils/image/effects';
export default makeImageCommand({ name: 'freeze', description: 'Freeze a GIF on its last frame', effect: freeze });
