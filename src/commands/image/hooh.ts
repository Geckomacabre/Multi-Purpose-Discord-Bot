import { makeImageCommand } from '../../utils/image/command';
import { hooh } from '../../utils/image/effects';
export default makeImageCommand({ name: 'hooh', description: 'Mirror the top half', effect: hooh });
