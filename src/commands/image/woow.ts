import { makeImageCommand } from '../../utils/image/command';
import { woow } from '../../utils/image/effects';
export default makeImageCommand({ name: 'woow', description: 'Mirror the bottom half', effect: woow });
