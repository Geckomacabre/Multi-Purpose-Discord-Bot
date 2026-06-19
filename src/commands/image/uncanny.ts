import { makeTextImageCommand } from '../../utils/image/command';
import { uncanny } from '../../utils/image/effects';
export default makeTextImageCommand({ name: 'uncanny', description: 'Add uncanny valley text between image halves', effect: uncanny });
