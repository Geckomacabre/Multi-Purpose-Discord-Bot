import { makeImageCommand } from '../../utils/image/command';
import { unfreeze } from '../../utils/image/effects';
export default makeImageCommand({ name: 'unfreeze', description: 'Turn a static image into a ping-pong GIF', effect: unfreeze });
