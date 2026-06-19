import { makeNoImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeNoImageCommand({
  name: 'sonic',
  description: 'Generate a Sonic says speech bubble',
  buildOptions: b => b.addStringOption((o: any) => o.setName('text').setDescription('What Sonic says').setRequired(true)),
  run: i => fx.sonic(i.options.getString('text', true)),
});
