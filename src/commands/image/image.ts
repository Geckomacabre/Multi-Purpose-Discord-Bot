import {
  ApplicationIntegrationType,
  ChatInputCommandInteraction,
  InteractionContextType,
  SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command.js';
import { getImageBuffer, imageReply } from '../../utils/image/index.js';
import type { NativeResult } from '../../utils/image/native.js';
import * as fx from '../../utils/image/effects.js';
import { processImage } from '../../utils/image/native.js';

const img = (s: any) =>
  s.addAttachmentOption((o: any) => o.setName('image').setDescription('Image to process'));

const FONTS = ['futura', 'impact', 'helvetica', 'arial', 'roboto', 'noto', 'times', 'comic sans ms', 'ubuntu'] as const;
const fontChoices = FONTS.map(f => ({ name: f, value: f }));

const UNCANNY_PHASES = [
  'baby','canny','canny2','canny3','canny4','canny5','canny6','canny7','canny8',
  'goated','nerd','normal','uncanny','uncanny2','uncanny3','uncanny4','uncanny5',
  'uncanny6','uncanny7','uncanny8','uncle','young',
];
const phaseChoices = UNCANNY_PHASES.map(p => ({ name: p, value: p }));

const REDDIT_SUBS = ['me_irl','dankmemes','hmmm','gaming','wholesome','chonkers','memes','funny','lies'];

function randomFrom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

const Image: Command = {
  data: (new SlashCommandBuilder()
    .setName('image')
    .setDescription('Image processing and effects')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    // ── filter ──────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('filter')
      .setDescription('Color and filter effects')
      .addSubcommand(s => img(s.setName('blur').setDescription('Blur an image')))
      .addSubcommand(s => img(s.setName('sharpen').setDescription('Sharpen an image')))
      .addSubcommand(s => img(s.setName('grayscale').setDescription('Convert to grayscale')))
      .addSubcommand(s => img(s.setName('sepia').setDescription('Apply sepia tone')))
      .addSubcommand(s => img(s
        .setName('hue')
        .setDescription('Hue shift an image')
        .addIntegerOption((o: any) => o.setName('shift').setDescription('Amount to shift hue by').setRequired(true).setMinValue(-180).setMaxValue(180))
      ))
      .addSubcommand(s => img(s.setName('invert').setDescription('Invert image colors')))
      .addSubcommand(s => img(s.setName('deepfry').setDescription('Deep-fry an image')))
      .addSubcommand(s => img(s
        .setName('jpeg')
        .setDescription('Reduce JPEG quality')
        .addIntegerOption((o: any) => o.setName('quality').setDescription('JPEG quality 1–100 (default 1)').setMinValue(1).setMaxValue(100))
      ))
      .addSubcommand(s => img(s
        .setName('pixelate')
        .setDescription('Pixelate an image')
        .addIntegerOption((o: any) => o.setName('amount').setDescription('Pixel size (default 16)').setMinValue(2).setMaxValue(128))
      ))
      .addSubcommand(s => img(s.setName('vignette').setDescription('Add a vignette effect')))
    )
    // ── transform ───────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('transform')
      .setDescription('Geometric transform effects')
      .addSubcommand(s => img(s.setName('flip').setDescription('Flip image vertically')))
      .addSubcommand(s => img(s.setName('flop').setDescription('Flip image horizontally')))
      .addSubcommand(s => img(s
        .setName('rotate')
        .setDescription('Rotate an image')
        .addIntegerOption((o: any) => o.setName('angle').setDescription('Rotation angle (1–360)').setRequired(true).setMinValue(1).setMaxValue(360))
      ))
      .addSubcommand(s => img(s.setName('crop').setDescription('Crop transparent/white borders')))
      .addSubcommand(s => img(s.setName('circle').setDescription('Apply circular crop')))
      .addSubcommand(s => img(s.setName('tile').setDescription('Tile image in a grid')))
      .addSubcommand(s => img(s.setName('wide').setDescription('Widen an image')))
      .addSubcommand(s => img(s.setName('squish').setDescription('Squish an image vertically')))
      .addSubcommand(s => img(s.setName('stretch').setDescription('Stretch an image horizontally')))
      .addSubcommand(s => img(s.setName('wall').setDescription('Tile image as a wall pattern')))
    )
    // ── mirror ──────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('mirror')
      .setDescription('Mirror and reflection effects')
      .addSubcommand(s => img(s.setName('haah').setDescription('Mirror left half onto right')))
      .addSubcommand(s => img(s.setName('hooh').setDescription('Mirror right half onto left')))
      .addSubcommand(s => img(s.setName('waaw').setDescription('Mirror top half onto bottom')))
      .addSubcommand(s => img(s.setName('woow').setDescription('Mirror bottom half onto top')))
    )
    // ── distort ─────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('distort')
      .setDescription('Distortion effects')
      .addSubcommand(s => img(s.setName('swirl').setDescription('Swirl an image')))
      .addSubcommand(s => img(s.setName('explode').setDescription('Explode an image outward')))
      .addSubcommand(s => img(s.setName('implode').setDescription('Implode an image inward')))
      .addSubcommand(s => img(s.setName('magik').setDescription('Liquid rescale distortion')))
      .addSubcommand(s => img(s.setName('globe').setDescription('Apply globe/fisheye distortion')))
      .addSubcommand(s => img(s.setName('gif').setDescription('Convert image to a GIF')))
    )
    // ── animate ─────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('animate')
      .setDescription('Animation effects')
      .addSubcommand(s => img(s.setName('bounce').setDescription('Animate image bouncing')))
      .addSubcommand(s => img(s.setName('spin').setDescription('Animate image spinning')))
      .addSubcommand(s => img(s.setName('slide').setDescription('Animate image sliding')))
      .addSubcommand(s => img(s.setName('fade').setDescription('Animate image fading in/out')))
      .addSubcommand(s => img(s.setName('freeze').setDescription('Freeze a GIF on its last frame')))
      .addSubcommand(s => img(s.setName('unfreeze').setDescription('Animate a still image as a looping GIF')))
      .addSubcommand(s => img(s.setName('speed').setDescription('Speed up a GIF')))
      .addSubcommand(s => img(s.setName('slow').setDescription('Slow down a GIF')))
      .addSubcommand(s => img(s.setName('reverse').setDescription('Reverse a GIF')))
      .addSubcommand(s => img(s.setName('soos').setDescription('Loop an image sequence backwards (boomerang)')))
    )
    // ── text ────────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('text')
      .setDescription('Add text to images')
      .addSubcommand(s => img(s
        .setName('caption')
        .setDescription('Add a caption bar above an image')
        .addStringOption((o: any) => o.setName('text').setDescription('Caption text').setRequired(true))
        .addStringOption((o: any) => o.setName('font').setDescription('Font to use').addChoices(...fontChoices))
      ))
      .addSubcommand(s => img(s
        .setName('caption2')
        .setDescription('Add a dark caption bar below an image')
        .addStringOption((o: any) => o.setName('text').setDescription('Caption text').setRequired(true))
        .addStringOption((o: any) => o.setName('font').setDescription('Font to use').addChoices(...fontChoices))
      ))
      .addSubcommand(s => img(s
        .setName('snapchat')
        .setDescription('Add a Snapchat-style caption bar')
        .addStringOption((o: any) => o.setName('text').setDescription('Text to display').setRequired(true))
        .addNumberOption((o: any) => o.setName('position').setDescription('Caption position (0.0=top, 1.0=bottom, default 0.565)').setMinValue(0).setMaxValue(1))
      ))
      .addSubcommand(s => img(s
        .setName('whisper')
        .setDescription('Add a whisper meme caption')
        .addStringOption((o: any) => o.setName('text').setDescription('Text to display').setRequired(true))
      ))
      .addSubcommand(s => img(s.setName('speechbubble').setDescription('Add a speech bubble overlay')))
      .addSubcommand(s => img(s
        .setName('uncanny')
        .setDescription('Mr. Incredible Becomes Uncanny meme (separate left/right text with a comma)')
        .addStringOption((o: any) => o.setName('text').setDescription('Left text, right text').setRequired(true))
        .addStringOption((o: any) => o.setName('phase').setDescription('Which uncanny image to use').addChoices(...phaseChoices))
      ))
      .addSubcommand(s => img(s
        .setName('uncaption')
        .setDescription('Remove a caption bar from an image')
        .addNumberOption((o: any) => o.setName('tolerance').setDescription('Detection tolerance (0.0=strict, 1.0=loose, default 0.95)').setMinValue(0).setMaxValue(1))
      ))
      .addSubcommand(s => img(s
        .setName('meme')
        .setDescription('Add Impact meme text (separate top/bottom with a comma)')
        .addStringOption((o: any) => o.setName('text').setDescription('Top text, bottom text').setRequired(true))
        .addBooleanOption((o: any) => o.setName('case').setDescription('Preserve text case (default: UPPERCASE)'))
        .addStringOption((o: any) => o.setName('font').setDescription('Font to use').addChoices(...fontChoices))
      ))
      .addSubcommand(s => img(s
        .setName('motivate')
        .setDescription('Create a motivational poster (separate title/subtitle with a comma)')
        .addStringOption((o: any) => o.setName('text').setDescription('Title text, subtitle text').setRequired(true))
        .addStringOption((o: any) => o.setName('font').setDescription('Font to use').addChoices(...fontChoices))
      ))
    )
    // ── meme ────────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('meme')
      .setDescription('Generate meme formats')
      .addSubcommand(s => s
        .setName('sonic')
        .setDescription('Sonic says...')
        .addStringOption((o: any) => o.setName('text').setDescription('Text for Sonic to say').setRequired(true))
      )
      .addSubcommand(s => s
        .setName('homebrew')
        .setDescription('Wii Homebrew Channel edit')
        .addStringOption((o: any) => o.setName('text').setDescription('App name').setRequired(true))
      )
      .addSubcommand(s => img(s
        .setName('spotify')
        .setDescription('Fake Spotify "This is" header')
        .addStringOption((o: any) => o.setName('text').setDescription('Artist/album name').setRequired(true))
      ))
      .addSubcommand(s => img(s
        .setName('reddit')
        .setDescription('Add a Reddit watermark to an image')
        .addStringOption((o: any) => o.setName('text').setDescription('Subreddit name (random if omitted)'))
      ))
      .addSubcommand(s => img(s.setName('gamexplain').setDescription('Gamexplain-style logo overlay')))
      .addSubcommand(s => img(s.setName('scott').setDescription('Scott the Woz style overlay')))
    )
    // ── overlay ─────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('overlay')
      .setDescription('Flag and watermark overlays')
      .addSubcommand(s => img(s
        .setName('flag')
        .setDescription('Overlay a flag on an image')
        .addStringOption((o: any) => o.setName('type').setDescription('Flag type').setRequired(true).addChoices(
          { name: 'Rainbow 🏳️‍🌈',  value: 'assets/images/rainbowflag.png' },
          { name: 'Trans 🏳️‍⚧️',    value: 'assets/images/transflag.png' },
          { name: 'Pirate 🏴‍☠️',    value: 'assets/images/pirateflag.png' },
          { name: 'Checkered 🏁',  value: 'assets/images/checkeredflag.png' },
        ))
      ))
      .addSubcommand(s => img(s
        .setName('brand')
        .setDescription('Add a brand watermark to an image')
        .addStringOption((o: any) => o.setName('brand').setDescription('Brand watermark').setRequired(true).addChoices(
          { name: '9GAG',          value: 'assets/images/9gag.png' },
          { name: 'MemeCenter',    value: 'assets/images/memecenter.png' },
          { name: 'DeviantArt',    value: 'assets/images/deviantart.png' },
          { name: 'Hypercam',      value: 'assets/images/hypercam.png' },
          { name: 'iFunny',        value: 'assets/images/ifunny.png' },
          { name: 'KineMaster',    value: 'assets/images/kinemaster.png' },
          { name: 'AVS4YOU',       value: 'assets/images/avs4you.png' },
          { name: 'Reddit',        value: 'assets/images/reddit2.png' },
          { name: 'Bandicam',      value: 'assets/images/bandicam.png' },
          { name: 'Shutterstock',  value: 'assets/images/shutterstock.png' },
          { name: 'Funky Mode',    value: 'assets/images/funky.png' },
          { name: 'PowerDirector', value: 'assets/images/powerdirector.png' },
        ))
      ))
    )
  ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const group = interaction.options.getSubcommandGroup(true);
    const sub = interaction.options.getSubcommand(true);

    async function dispatch(): Promise<NativeResult> {
      if (group === 'filter') {
        const b = await getImageBuffer(interaction);
        switch (sub) {
          case 'blur':      return fx.blur(b);
          case 'sharpen':   return fx.sharpen(b);
          case 'grayscale': return fx.grayscale(b);
          case 'sepia':     return fx.sepia(b);
          case 'hue':       return fx.hue(b, interaction.options.getInteger('shift', true));
          case 'invert':    return fx.invert(b);
          case 'deepfry':   return fx.deepfry(b);
          case 'jpeg':      return fx.jpeg(b, interaction.options.getInteger('quality') ?? 1);
          case 'pixelate':  return fx.pixelate(b, interaction.options.getInteger('amount') ?? 16);
          case 'vignette':  return fx.vignette(b);
        }
      } else if (group === 'transform') {
        const b = await getImageBuffer(interaction);
        switch (sub) {
          case 'flip':    return fx.flip(b);
          case 'flop':    return fx.flop(b);
          case 'rotate':  return fx.rotate(b, interaction.options.getInteger('angle', true));
          case 'crop':    return fx.crop(b);
          case 'circle':  return fx.circle(b);
          case 'tile':    return fx.tile(b);
          case 'wide':    return fx.wide(b);
          case 'squish':  return fx.squish(b);
          case 'stretch': return fx.stretch(b);
          case 'wall':    return fx.wall(b);
        }
      } else if (group === 'mirror') {
        const b = await getImageBuffer(interaction);
        switch (sub) {
          case 'haah': return fx.haah(b);
          case 'hooh': return fx.hooh(b);
          case 'waaw': return fx.waaw(b);
          case 'woow': return fx.woow(b);
        }
      } else if (group === 'distort') {
        const b = await getImageBuffer(interaction);
        switch (sub) {
          case 'swirl':   return fx.swirl(b);
          case 'explode': return fx.explode(b);
          case 'implode': return fx.implode(b);
          case 'magik':   return fx.magik(b);
          case 'globe':   return fx.globe(b);
          case 'gif':     return fx.makeGif(b);
        }
      } else if (group === 'animate') {
        const b = await getImageBuffer(interaction);
        switch (sub) {
          case 'bounce':   return fx.bounce(b);
          case 'spin':     return fx.spin(b);
          case 'slide':    return fx.slide(b);
          case 'fade':     return fx.fade(b);
          case 'freeze':   return fx.freeze(b);
          case 'unfreeze': return fx.unfreeze(b);
          case 'speed':    return fx.speed(b);
          case 'slow':     return fx.slow(b);
          case 'reverse':  return fx.reverse(b);
          case 'soos':     return fx.soos(b);
        }
      } else if (group === 'text') {
        const b = await getImageBuffer(interaction);
        const font = interaction.options.getString('font') ?? undefined;
        switch (sub) {
          case 'caption':      return fx.caption(b, interaction.options.getString('text', true), font);
          case 'caption2':     return fx.caption2(b, interaction.options.getString('text', true), false, font);
          case 'snapchat': {
            const pos = interaction.options.getNumber('position') ?? 0.565;
            return fx.snapchat(b, interaction.options.getString('text', true), pos);
          }
          case 'whisper':      return fx.whisper(b, interaction.options.getString('text', true));
          case 'speechbubble': return fx.speechbubble(b);
          case 'uncaption':    return fx.uncaption(b, interaction.options.getNumber('tolerance') ?? 0.95);
          case 'uncanny': {
            const raw = interaction.options.getString('text', true);
            const [cap1, cap2 = ''] = raw.split(/(?<!\\),/).map(s => s.trim());
            const phase = interaction.options.getString('phase') ?? randomFrom(UNCANNY_PHASES);
            return processImage('uncanny', {
              caption: cap1,
              caption2: cap2,
              path: `assets/images/uncanny/${phase}.png`,
              ...(font ? { font } : {}),
            }, b);
          }
          case 'meme': {
            const raw = interaction.options.getString('text', true);
            const preserveCase = interaction.options.getBoolean('case') ?? false;
            const [rawTop = '', rawBottom = ''] = raw.split(/(?<!\\),/).map(s => s.trim());
            const top    = preserveCase ? rawTop    : rawTop.toUpperCase();
            const bottom = preserveCase ? rawBottom : rawBottom.toUpperCase();
            return fx.meme(b, top, bottom, font);
          }
          case 'motivate': {
            const raw = interaction.options.getString('text', true);
            const [top = '', bottom = ''] = raw.split(/(?<!\\),/).map(s => s.trim());
            return fx.motivate(b, top, bottom, font);
          }
        }
      } else if (group === 'meme') {
        switch (sub) {
          case 'sonic':    return fx.sonic(interaction.options.getString('text', true));
          case 'homebrew': return fx.homebrew(interaction.options.getString('text', true));
          case 'spotify': {
            const b = await getImageBuffer(interaction);
            return fx.spotify(b, interaction.options.getString('text', true));
          }
          case 'reddit': {
            const b = await getImageBuffer(interaction);
            const title = interaction.options.getString('text')?.trim() || randomFrom(REDDIT_SUBS);
            return fx.reddit(b, title);
          }
          case 'gamexplain': return fx.gamexplain(await getImageBuffer(interaction));
          case 'scott':      return fx.scott(await getImageBuffer(interaction));
        }
      } else if (group === 'overlay') {
        const b = await getImageBuffer(interaction);
        switch (sub) {
          case 'flag':  return fx.flag(b, interaction.options.getString('type', true));
          case 'brand': return fx.watermark(b, interaction.options.getString('brand', true));
        }
      }
      throw new Error(`Unknown subcommand: ${group} ${sub}`);
    }

    try {
      const result = await dispatch();
      await interaction.editReply(imageReply(result.data, result.type));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await interaction.editReply({ content: `Error: ${msg}` });
    }
  },
};

export default Image;
