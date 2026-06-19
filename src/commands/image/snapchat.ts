import { makeTextImageCommand } from '../../utils/image/command';
import { snapchat } from '../../utils/image/effects';
export default makeTextImageCommand({ name: 'snapchat', description: 'Add a Snapchat-style text bar to an image', effect: snapchat });
