import { makeImageCommand } from '../../utils/image/command';
import { speechbubble } from '../../utils/image/effects';
export default makeImageCommand({ name: 'speechbubble', description: 'Add a speech bubble to an image', effect: speechbubble });
