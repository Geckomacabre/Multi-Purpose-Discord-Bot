import { makeImageCommand } from '../../utils/image/command';
import { flop } from '../../utils/image/effects';
export default makeImageCommand({ name: 'flop', description: 'Flip an image horizontally', effect: flop });
