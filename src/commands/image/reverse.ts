import { makeImageCommand } from '../../utils/image/command';
import { reverse } from '../../utils/image/effects';
export default makeImageCommand({ name: 'reverse', description: 'Reverse a GIF', effect: reverse });
