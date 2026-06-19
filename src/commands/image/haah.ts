import { makeImageCommand } from '../../utils/image/command';
import { mirror } from '../../utils/image/effects';
export default makeImageCommand({ name: 'haah', description: 'Mirror the left half', effect: (b) => mirror(b, 'haah') });
