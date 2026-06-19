import { makeImageCommand } from '../../utils/image/command';
import { mirror } from '../../utils/image/effects';
export default makeImageCommand({ name: 'waaw', description: 'Mirror the right half', effect: (b) => mirror(b, 'waaw') });
