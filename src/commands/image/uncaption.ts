import { makeImageCommand } from '../../utils/image/command';
import { uncaption } from '../../utils/image/effects';
export default makeImageCommand({ name: 'uncaption', description: 'Remove a caption from an image', effect: uncaption });
