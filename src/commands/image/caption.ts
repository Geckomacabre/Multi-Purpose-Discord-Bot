import { makeImageCommand, fontChoices } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({
  name: 'caption',
  description: 'Add a caption bar above an image',
  effect: (buf, text, font) => fx.caption(buf, text, font),
  extraOptions: b => b
    .addStringOption((o: any) => o.setName('text').setDescription('Caption text').setRequired(true))
    .addStringOption((o: any) => o.setName('font').setDescription('Font to use').addChoices(...fontChoices)),
  getArgs: i => [i.options.getString('text', true), i.options.getString('font') ?? undefined],
});
