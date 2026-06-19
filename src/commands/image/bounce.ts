import { makeImageCommand } from '../../utils/image/command';
import { bounce } from '../../utils/image/effects';
export default makeImageCommand({ name: 'bounce', description: 'Make an image bounce', effect: bounce });
