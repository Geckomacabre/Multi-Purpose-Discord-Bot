import { makeImageCommand } from '../../utils/image/command';
import { sepia } from '../../utils/image/effects';
export default makeImageCommand({ name: 'sepia', description: 'Apply a sepia tone to an image', effect: sepia });
