import { makeImageCommand } from '../../utils/image/command';
import { haah } from '../../utils/image/effects';
export default makeImageCommand({ name: 'haah', description: 'Mirror the left half', effect: haah });
