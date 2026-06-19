import { makeImageCommand } from '../../utils/image/command';
import { mirror } from '../../utils/image/effects';
export default makeImageCommand({ name: 'hooh', description: 'Mirror the top half', effect: (b) => mirror(b, 'hooh') });
