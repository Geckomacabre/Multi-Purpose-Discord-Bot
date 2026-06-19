import { makeImageCommand } from '../../utils/image/command';
import { slow } from '../../utils/image/effects';
export default makeImageCommand({ name: 'slow', description: 'Slow down a GIF by 2x', effect: slow });
