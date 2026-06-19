import { makeImageCommand } from '../../utils/image/command';
import { deepfry } from '../../utils/image/effects';
export default makeImageCommand({ name: 'deepfry', description: 'Deep fry an image', effect: deepfry });
