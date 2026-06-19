import { makeImageCommand } from '../../utils/image/command';
import { mirror } from '../../utils/image/effects';
export default makeImageCommand({ name: 'woow', description: 'Mirror the bottom half', effect: (b) => mirror(b, 'woow') });
