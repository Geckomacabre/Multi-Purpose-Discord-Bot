import { makeTextImageCommand } from '../../utils/image/command';
import { caption } from '../../utils/image/effects';
export default makeTextImageCommand({ name: 'caption', description: 'Add a caption above an image', effect: caption });
