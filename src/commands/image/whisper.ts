import { makeTextImageCommand } from '../../utils/image/command';
import { whisper } from '../../utils/image/effects';
export default makeTextImageCommand({ name: 'whisper', description: 'Add a Whisper-style caption to an image', effect: whisper });
