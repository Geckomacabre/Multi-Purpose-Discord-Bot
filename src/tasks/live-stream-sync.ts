import { Client, EmbedBuilder, TextChannel } from "discord.js";
import {
  db,
  getLiveStream,
  setLiveStream,
  removeLiveStream,
} from "../infrastructure/db.ts";
import * as twitch from "../server/twitch.ts";
import { Channels } from "../constants.ts";
import logger from "../infrastructure/logger.ts";

interface TwitchLink {
  discord_user_id: string;
  twitch_id: string;
}

export default {
  name: "Twitch Stream Sync",
  intervalMs: 60_000,

  async run(client: Client) {
    const links = await db<TwitchLink[]>`
      SELECT discord_user_id, twitch_id 
      FROM twitch_links
    `;

    if (!links.length) return;

    const channel = await client.channels
      .fetch(Channels.SelfPromo)
      .catch(() => null);

    if (!channel?.isTextBased()) {
      logger.warn(
        "[TwitchSync] SelfPromo channel unavailable or not text-based",
      );
      return;
    }

    const textChannel = channel as TextChannel;

    const twitchIds = links.map((l) => l.twitch_id);
    const liveStreams = await twitch.getLiveStreams(twitchIds);
    const liveSet = new Set(liveStreams.map((s) => s.user_id));

    await Promise.all(
      links.map((link) => this.syncLink(link, liveSet, textChannel)),
    );
  },

  async syncLink(link: TwitchLink, liveSet: Set<string>, channel: TextChannel) {
    const isLive = liveSet.has(link.twitch_id);
    const existing = await getLiveStream(link.discord_user_id);

    if (isLive && !existing) {
      const streams = await twitch.getStreamsByUserIds([link.twitch_id]);
      const stream = streams[0];

      if (!stream) return;

      await this.handleStreamStart(link, stream, channel);
    } else if (!isLive && existing) {
      await this.handleStreamEnd(link, existing, channel);
    }
  },

  async handleStreamStart(
    link: TwitchLink,
    stream: twitch.TwitchStream,
    channel: TextChannel,
  ) {
    try {
      const username = stream.user_login;
      const title = stream.title ?? "Live on Twitch";
      const game = stream.game_name ?? "Unknown game";

      const thumbnail = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${username}-1280x720.jpg?rand=${Date.now()}`;
      const twitchUrl = `https://twitch.tv/${username}`;

      const embed = new EmbedBuilder()
        .setColor(0x9146ff)
        .setTitle(`${stream.user_name} is live on Twitch`)
        .setURL(twitchUrl)
        .setDescription(title)
        .addFields(
          { name: "Game", value: game, inline: true },
          {
            name: "Viewers",
            value: String(stream.viewer_count ?? 0),
            inline: true,
          },
        )
        .setImage(thumbnail)
        .setTimestamp();

      const msg = await channel.send({
        content: `🔴 <@${link.discord_user_id}> is now live!`,
        embeds: [embed],
      });

      if (!msg.guild) return;

      await setLiveStream({
        user_id: link.discord_user_id,
        guild_id: msg.guild.id,
        channel_id: channel.id,
        message_id: msg.id,
        platform: "twitch",
      });

      logger.info(`[TwitchSync] Stream started for ${link.discord_user_id}`);
    } catch (err) {
      logger.error(
        `[TwitchSync] Failed to post stream start for ${link.discord_user_id}`,
      );
    }
  },

  async handleStreamEnd(
    link: TwitchLink,
    existing: { message_id: string },
    channel: TextChannel,
  ) {
    try {
      const msg = await channel.messages.fetch(existing.message_id);
      await msg.delete();
    } catch {
      logger.warn(
        `[TwitchSync] Could not delete message ${existing.message_id} for ${link.discord_user_id}`,
      );
    }

    try {
      await removeLiveStream(link.discord_user_id);
      logger.info(`[TwitchSync] Stream ended for ${link.discord_user_id}`);
    } catch (err) {
      logger.error(
        `[TwitchSync] Failed to remove stream record for ${link.discord_user_id}`,
      );
    }
  },
};
