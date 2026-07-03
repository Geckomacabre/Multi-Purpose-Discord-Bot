import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  GuildMember, InteractionContextType, MessageFlags, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { Player, useQueue, GuildQueue, Track } from 'discord-player';
import { DefaultExtractors } from '@discord-player/extractor';
import * as db from '../../utils/db';
import logger from '../../utils/logger';

let player: Player | null = null;

export function getPlayer(client: any): Player {
  if (!player) {
    player = new Player(client, { skipFFmpeg: false });
    player.extractors.loadMulti(DefaultExtractors).catch(e => logger.error('Failed to load extractors:', e));
    (player.events as any).on('playerError', (_queue: any, err: any) => logger.error('Player error:', err));
    (player.events as any).on('error', (_queue: any, err: any) => logger.error('Queue error:', err));
    player.events.on('playerStart', (queue, track) => {
      const ch = queue.metadata as any;
      if (ch?.send) ch.send({ embeds: [nowPlayingEmbed(track)] });
    });
  }
  return player;
}

function nowPlayingEmbed(track: Track) {
  return new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle('Now Playing')
    .setDescription(`**[${track.title}](${track.url})**`)
    .addFields(
      { name: 'Duration', value: track.duration, inline: true },
      { name: 'Requested by', value: `${track.requestedBy}`, inline: true },
    )
    .setThumbnail(track.thumbnail);
}

function queueEmbed(queue: GuildQueue, page = 0) {
  const tracks = queue.tracks.toArray();
  const perPage = 10;
  const start = page * perPage;
  const slice = tracks.slice(start, start + perPage);
  const current = queue.currentTrack;
  return new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle('Queue')
    .setDescription(
      (current ? `**Now playing:** [${current.title}](${current.url})\n\n` : '') +
      (slice.length
        ? slice.map((t, i) => `**${start + i + 1}.** [${t.title}](${t.url}) — ${t.duration}`).join('\n')
        : '*Queue is empty*')
    )
    .setFooter({ text: `${tracks.length} track(s) in queue${tracks.length > perPage ? ` · Page ${page + 1}/${Math.ceil(tracks.length / perPage)}` : ''}` });
}

const Music: Command = {
  data: new SlashCommandBuilder()
    .setName('music')
    .setDescription('Music player')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(s => s.setName('play').setDescription('Play a song or add it to the queue')
      .addStringOption(o => o.setName('query').setDescription('Song name or URL').setRequired(true)))
    .addSubcommand(s => s.setName('skip').setDescription('Skip the current track'))
    .addSubcommand(s => s.setName('stop').setDescription('Stop music and clear the queue'))
    .addSubcommand(s => s.setName('pause').setDescription('Pause or resume playback'))
    .addSubcommand(s => s.setName('queue').setDescription('Show the queue')
      .addIntegerOption(o => o.setName('page').setDescription('Page number').setMinValue(1)))
    .addSubcommand(s => s.setName('nowplaying').setDescription('Show the currently playing track'))
    .addSubcommand(s => s.setName('volume').setDescription('Set playback volume')
      .addIntegerOption(o => o.setName('level').setDescription('Volume (1-200)').setRequired(true).setMinValue(1).setMaxValue(200)))
    .addSubcommand(s => s.setName('loop').setDescription('Toggle loop mode')
      .addStringOption(o => o.setName('mode').setDescription('Loop mode').setRequired(true).setChoices(
        { name: 'Off', value: 'off' },
        { name: 'Track', value: 'track' },
        { name: 'Queue', value: 'queue' },
        { name: 'Autoplay', value: 'autoplay' },
      )))
    .addSubcommand(s => s.setName('shuffle').setDescription('Shuffle the queue'))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a track from the queue')
      .addIntegerOption(o => o.setName('position').setDescription('Track position in queue').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('seek').setDescription('Seek to a position in the current track')
      .addStringOption(o => o.setName('time').setDescription('Time (e.g. 1:30 or 90)').setRequired(true)))
    .addSubcommand(s => s.setName('host').setDescription('Transfer DJ privileges to another user')
      .addUserOption(o => o.setName('user').setDescription('User to transfer to').setRequired(true))) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const member = interaction.member as GuildMember;
    const vc = member.voice.channel;
    const p = getPlayer(interaction.client);

    const requireVC = async () => {
      if (!vc) { await interaction.reply({ content: '❌ You must be in a voice channel.', flags: MessageFlags.Ephemeral }); return false; }
      return true;
    };

    const requireQueue = async () => {
      const q = useQueue(interaction.guildId!);
      if (!q || !q.isPlaying()) { await interaction.reply({ content: '❌ Nothing is playing.', flags: MessageFlags.Ephemeral }); return null; }
      return q;
    };

    if (sub === 'play') {
      if (!await requireVC()) return;
      const query = interaction.options.getString('query', true);
      await interaction.deferReply();
      try {
        const { track } = await p.play(vc!, query, {
          nodeOptions: {
            metadata: interaction.channel,
            volume: (await db.getMusicConfig(interaction.guildId!)).volume,
            leaveOnEmpty: true,
            leaveOnEmptyCooldown: 30000,
            leaveOnEnd: true,
            leaveOnEndCooldown: 30000,
          },
          // discord-player defaults to Discord's DAVE E2EE voice protocol, which
          // requires the @snazzah/davey native package — not something we ship,
          // and not needed for a bot streaming into a channel (DAVE is for
          // encrypted calls between real users). Without it, connecting throws
          // an uncaught exception that kills the voice connection entirely.
          connectionOptions: { daveEncryption: false },
        });
        const q = useQueue(interaction.guildId!);
        if (q && q.tracks.size > 0) {
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle('Added to Queue').setDescription(`**[${track.title}](${track.url})**`).setThumbnail(track.thumbnail).addFields({ name: 'Position', value: `#${q.tracks.size}`, inline: true }, { name: 'Duration', value: track.duration, inline: true })] });
        } else {
          await interaction.editReply({ embeds: [nowPlayingEmbed(track)] });
        }
      } catch (e: any) {
        await interaction.editReply(`❌ Could not play: ${e?.message ?? e}`);
      }
    }

    else if (sub === 'skip') {
      const q = await requireQueue(); if (!q) return;
      q.node.skip();
      await interaction.reply('⏭️ Skipped.');
    }

    else if (sub === 'stop') {
      const q = useQueue(interaction.guildId!);
      if (q) q.delete();
      await interaction.reply('⏹️ Stopped and queue cleared.');
    }

    else if (sub === 'pause') {
      const q = await requireQueue(); if (!q) return;
      if (q.node.isPaused()) { q.node.resume(); await interaction.reply('▶️ Resumed.'); }
      else { q.node.pause(); await interaction.reply('⏸️ Paused.'); }
    }

    else if (sub === 'queue') {
      const q = useQueue(interaction.guildId!);
      if (!q) { await interaction.reply({ content: '❌ Nothing in the queue.', flags: MessageFlags.Ephemeral }); return; }
      const page = (interaction.options.getInteger('page') ?? 1) - 1;
      await interaction.reply({ embeds: [queueEmbed(q, page)] });
    }

    else if (sub === 'nowplaying') {
      const q = await requireQueue(); if (!q) return;
      const track = q.currentTrack!;
      const bar = q.node.createProgressBar();
      await interaction.reply({ embeds: [nowPlayingEmbed(track).addFields({ name: 'Progress', value: bar ?? '―' })] });
    }

    else if (sub === 'volume') {
      const q = useQueue(interaction.guildId!);
      const level = interaction.options.getInteger('level', true);
      if (q) q.node.setVolume(level);
      await db.setMusicVolume(interaction.guildId!, level);
      await interaction.reply(`🔊 Volume set to **${level}%**.`);
    }

    else if (sub === 'loop') {
      const q = await requireQueue(); if (!q) return;
      const { QueueRepeatMode } = await import('discord-player');
      const mode = interaction.options.getString('mode', true);
      const modeMap: Record<string, any> = { off: QueueRepeatMode.OFF, track: QueueRepeatMode.TRACK, queue: QueueRepeatMode.QUEUE, autoplay: QueueRepeatMode.AUTOPLAY };
      q.setRepeatMode(modeMap[mode]);
      await interaction.reply(`🔁 Loop mode set to **${mode}**.`);
    }

    else if (sub === 'shuffle') {
      const q = await requireQueue(); if (!q) return;
      q.tracks.shuffle();
      await interaction.reply('🔀 Queue shuffled.');
    }

    else if (sub === 'remove') {
      const q = await requireQueue(); if (!q) return;
      const pos = interaction.options.getInteger('position', true) - 1;
      const track = q.tracks.at(pos);
      if (!track) { await interaction.reply({ content: '❌ No track at that position.', flags: MessageFlags.Ephemeral }); return; }
      q.node.remove(track);
      await interaction.reply(`🗑️ Removed **${track.title}** from the queue.`);
    }

    else if (sub === 'seek') {
      const q = await requireQueue(); if (!q) return;
      const timeStr = interaction.options.getString('time', true);
      const parts = timeStr.split(':').map(Number);
      let ms = 0;
      if (parts.length === 1) ms = (parts[0] ?? 0) * 1000;
      else if (parts.length === 2) ms = ((parts[0] ?? 0) * 60 + (parts[1] ?? 0)) * 1000;
      else ms = ((parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0)) * 1000;
      await q.node.seek(ms);
      await interaction.reply(`⏩ Seeked to **${timeStr}**.`);
    }

    else if (sub === 'host') {
      await interaction.reply({ content: 'DJ transfer is not implemented yet.', flags: MessageFlags.Ephemeral });
    }
  },
};

export default Music;
