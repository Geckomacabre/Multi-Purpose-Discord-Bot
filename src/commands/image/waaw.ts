import { makeImageCommand } from '../../utils/image/command';
import { waaw } from '../../utils/image/effects';
export default makeImageCommand({ name: 'waaw', description: 'Mirror the right half', effect: waaw });
