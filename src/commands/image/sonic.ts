import { makeNoImageCommand } from '../../utils/image/command';
import { sonic } from '../../utils/image/effects';
export default makeNoImageCommand({
  name: 'sonic',
  description: 'Create a Sonic speech bubble meme',
  buildOptions: b => b.addStringOption(o => o.setName('text').setDescription('Text for Sonic to say').setRequired(true)),
  run: async i => sonic(i.options.getString('text', true)),
});
