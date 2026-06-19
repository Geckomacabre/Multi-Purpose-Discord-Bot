import { makeImageCommand } from '../../utils/image/command';
import { globe } from '../../utils/image/effects';
export default makeImageCommand({ name: 'globe', description: 'Turn an image into a globe', effect: globe });
