import { makeImageCommand } from '../../utils/image/command';
import { jpeg } from '../../utils/image/effects';
export default makeImageCommand({ name: 'jpeg', description: 'Re-encode an image as low-quality JPEG', effect: jpeg });
