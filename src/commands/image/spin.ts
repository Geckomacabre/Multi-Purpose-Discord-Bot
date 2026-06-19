import { makeImageCommand } from '../../utils/image/command';
import { spin } from '../../utils/image/effects';
export default makeImageCommand({ name: 'spin', description: 'Make an image spin', effect: spin });
