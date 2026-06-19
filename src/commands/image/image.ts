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
import os from 'os';
import path from 'path';
import fs from 'fs';

const img = (s: any) =>
  s.addAttachmentOption((o: any) => o.setName('image').setDescription('Image to process'));

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
        .setDescription('Shift the hue of an image')
        .addIntegerOption((o: any) => o.setName('degrees').setDescription('Hue shift 0–359 (default 180)').setMinValue(0).setMaxValue(359))
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
        .addIntegerOption((o: any) => o.setName('degrees').setDescription('Degrees (default 90)').addChoices(
          { name: '90°', value: 90 },
          { name: '180°', value: 180 },
          { name: '270°', value: 270 },
        ))
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
    )
    // ── text ────────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('text')
      .setDescription('Add text to images')
      .addSubcommand(s => img(s
        .setName('caption')
        .setDescription('Add a white caption bar above an image')
        .addStringOption((o: any) => o.setName('text').setDescription('Caption text').setRequired(true))
      ))
      .addSubcommand(s => img(s
        .setName('caption2')
        .setDescription('Add a dark caption bar below an image')
        .addStringOption((o: any) => o.setName('text').setDescription('Caption text').setRequired(true))
      ))
      .addSubcommand(s => img(s
        .setName('snapchat')
        .setDescription('Add a Snapchat-style caption bar')
        .addStringOption((o: any) => o.setName('text').setDescription('Text to display').setRequired(true))
      ))
      .addSubcommand(s => img(s
        .setName('whisper')
        .setDescription('Add a whisper meme caption')
        .addStringOption((o: any) => o.setName('text').setDescription('Text to display').setRequired(true))
      ))
      .addSubcommand(s => img(s.setName('speechbubble').setDescription('Add a speech bubble overlay')))
      .addSubcommand(s => img(s
        .setName('uncanny')
        .setDescription('Side-by-side comparison meme')
        .addStringOption((o: any) => o.setName('left').setDescription('Left panel label').setRequired(true))
        .addStringOption((o: any) => o.setName('right').setDescription('Right panel label').setRequired(true))
      ))
      .addSubcommand(s => img(s.setName('uncaption').setDescription('Remove a caption bar from an image')))
      .addSubcommand(s => img(s
        .setName('meme')
        .setDescription('Add Impact meme text to an image')
        .addStringOption((o: any) => o.setName('top').setDescription('Top text'))
        .addStringOption((o: any) => o.setName('bottom').setDescription('Bottom text'))
      ))
      .addSubcommand(s => img(s
        .setName('motivate')
        .setDescription('Create a motivational poster')
        .addStringOption((o: any) => o.setName('top').setDescription('Title text').setRequired(true))
        .addStringOption((o: any) => o.setName('bottom').setDescription('Subtitle text'))
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
        .setDescription('Wii Homebrew Channel meme')
        .addStringOption((o: any) => o.setName('text').setDescription('App name').setRequired(true))
      )
      .addSubcommand(s => img(s
        .setName('spotify')
        .setDescription('Fake Spotify now playing card')
        .addStringOption((o: any) => o.setName('song').setDescription('Song name').setRequired(true))
      ))
      .addSubcommand(s => img(s
        .setName('reddit')
        .setDescription('Fake Reddit post')
        .addStringOption((o: any) => o.setName('title').setDescription('Post title').setRequired(true))
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
          { name: 'Rainbow', value: 'rainbowflag.png' },
          { name: 'Trans', value: 'transflag.png' },
          { name: 'Pirate', value: 'pirateflag.png' },
        ))
      ))
      .addSubcommand(s => img(s
        .setName('brand')
        .setDescription('Add a brand watermark to an image')
        .addStringOption((o: any) => o.setName('brand').setDescription('Brand watermark').setRequired(true).addChoices(
          { name: '9GAG', value: '9gag.png' },
          { name: 'MemeCenter', value: 'memecenter.png' },
          { name: 'DeviantArt', value: 'deviantart.png' },
          { name: 'Hypercam', value: 'hypercam.png' },
          { name: 'iFunny', value: 'ifunny.png' },
          { name: 'KineMaster', value: 'kinemaster.png' },
          { name: 'AVS4YOU', value: 'avs4you.png' },
          { name: 'Reddit', value: 'reddit2.png' },
          { name: 'Bandicam', value: 'bandicam.png' },
          { name: 'Shutterstock', value: 'shutterstock.png' },
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
          case 'hue':       return fx.hue(b, interaction.options.getInteger('degrees') ?? 180);
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
          case 'rotate':  return fx.rotate(b, interaction.options.getInteger('degrees') ?? 90);
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
        }
      } else if (group === 'text') {
        const b = await getImageBuffer(interaction);
        switch (sub) {
          case 'caption':      return fx.caption(b, interaction.options.getString('text', true));
          case 'caption2':     return fx.caption2(b, interaction.options.getString('text', true));
          case 'snapchat':     return fx.snapchat(b, interaction.options.getString('text', true));
          case 'whisper':      return fx.whisper(b, interaction.options.getString('text', true));
          case 'speechbubble': return fx.speechbubble(b);
          case 'uncaption':    return fx.uncaption(b);
          case 'uncanny': {
            const left = interaction.options.getString('left', true);
            const right = interaction.options.getString('right', true);
            const tmpPath = path.join(os.tmpdir(), `uncanny_${Date.now()}.png`);
            fs.writeFileSync(tmpPath, b);
            try {
              return await processImage('uncanny', { caption: left, caption2: right, path: tmpPath }, b);
            } finally {
              fs.unlink(tmpPath, () => {});
            }
          }
          case 'meme': {
            const top = interaction.options.getString('top') ?? '';
            const bottom = interaction.options.getString('bottom') ?? '';
            if (!top && !bottom) throw new Error('Provide at least one of top or bottom text.');
            return fx.meme(b, top, bottom);
          }
          case 'motivate': return fx.motivate(
            b,
            interaction.options.getString('top', true),
            interaction.options.getString('bottom') ?? '',
          );
        }
      } else if (group === 'meme') {
        switch (sub) {
          case 'sonic':    return fx.sonic(interaction.options.getString('text', true));
          case 'homebrew': return fx.homebrew(interaction.options.getString('text', true));
          case 'spotify': {
            const b = await getImageBuffer(interaction);
            return fx.spotify(b, interaction.options.getString('song', true));
          }
          case 'reddit': {
            const b = await getImageBuffer(interaction);
            return fx.reddit(b, interaction.options.getString('title', true));
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
