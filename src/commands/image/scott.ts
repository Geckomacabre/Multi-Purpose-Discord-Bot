import { makeImageCommand } from '../../utils/image/command';
import { scott } from '../../utils/image/effects';
export default makeImageCommand({ name: 'scott', description: 'Apply the Scott the Woz effect', effect: scott });
