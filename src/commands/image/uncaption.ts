import { makeImageCommand } from '../../utils/image/command.js';
import * as fx from '../../utils/image/effects.js';
export default makeImageCommand({
  name: 'uncaption',
  description: 'Remove a white caption bar from an image',
  effect: (buf, tolerance) => fx.uncaption(buf, tolerance),
  extraOptions: b => b.addNumberOption((o: any) => o.setName('tolerance').setDescription('Detection tolerance 0-1 (default 0.95)').setMinValue(0).setMaxValue(1)),
  getArgs: i => [i.options.getNumber('tolerance') ?? 0.95],
});
