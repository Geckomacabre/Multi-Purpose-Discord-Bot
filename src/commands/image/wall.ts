import { makeImageCommand } from '../../utils/image/command';
import { wall } from '../../utils/image/effects';
export default makeImageCommand({ name: 'wall', description: 'Tile an image 4x4', effect: wall });
