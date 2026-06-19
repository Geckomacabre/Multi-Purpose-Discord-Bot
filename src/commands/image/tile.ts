import { makeImageCommand } from '../../utils/image/command';
import { tile } from '../../utils/image/effects';
export default makeImageCommand({ name: 'tile', description: 'Tile an image 2x2', effect: tile });
