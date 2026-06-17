import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import * as db from '../../utils/db';
import Config from '../../config';
import logger from '../../utils/logger';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getChannel(bot: Client, id: string): Promise<TextChannel | null> {
  try {
    const ch = await bot.channels.fetch(id);
    return ch instanceof TextChannel ? ch : null;
  } catch { return null; }
}

// ─── RSS ──────────────────────────────────────────────────────────────────────

function parseRssItems(xml: string): { id: string; title: string; link: string; published: string }[] {
  const items: { id: string; title: string; link: string; published: string }[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>|<entry>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1] ?? m[2];
    const title = (/<title[^>]*>([\s\S]*?)<\/title>/.exec(block)?.[1] ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim();
    const link = (/<link[^>]*href="([^"]+)"/.exec(block)?.[1] ?? /<link[^>]*>([\s\S]*?)<\/link>/.exec(block)?.[1] ?? '').trim();
    const guid = (/<guid[^>]*>([\s\S]*?)<\/guid>/.exec(block)?.[1] ?? /<id>([\s\S]*?)<\/id>/.exec(block)?.[1] ?? link).trim();
    const published = (/<pubDate>([\s\S]*?)<\/pubDate>/.exec(block)?.[1] ?? /<published>([\s\S]*?)<\/published>/.exec(block)?.[1] ?? '').trim();
    if (title && link) items.push({ id: guid, title, link, published });
  }
  return items;
}

async function pollRss(bot: Client) {
  const feeds = await db.getAllRssFeeds();
  for (const feed of feeds) {
    try {
      const res = await fetch(feed.feed_url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseRssItems(xml);
      if (!items.length) continue;

      const newItems = feed.last_item_id
        ? items.filter(i => i.id !== feed.last_item_id).slice(0, 5)
        : items.slice(0, 1);

      for (const item of newItems.reverse()) {
        const ch = await getChannel(bot, feed.channel_id);
        if (!ch) continue;
        const embed = new EmbedBuilder()
          .setTitle(item.title.slice(0, 256))
          .setURL(item.link)
          .setColor(0xff6600)
          .setTimestamp(item.published ? new Date(item.published) : new Date());
        await ch.send({ embeds: [embed] }).catch(() => {});
      }

      if (items[0]) await db.updateRssLastItem(feed.id, items[0].id);
    } catch (err) {
      logger.debug(`RSS poll error for ${feed.feed_url}: ${err}`);
    }
  }
}

// ─── Reddit ───────────────────────────────────────────────────────────────────

async function pollReddit(bot: Client) {
  const feeds = await db.getAllRedditFeeds();
  for (const feed of feeds) {
    try {
      const url = `https://www.reddit.com/r/${feed.subreddit}/new.json?limit=5`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'TMCBot/1.0' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      const json: any = await res.json();
      const posts: any[] = json?.data?.children?.map((c: any) => c.data) ?? [];
      if (!posts.length) continue;

      const newPosts = feed.last_post_id
        ? posts.filter(p => p.id !== feed.last_post_id && !p.over_18 || feed.nsfw).slice(0, 3)
        : posts.slice(0, 1);

      for (const post of newPosts.reverse()) {
        if (post.over_18 && !feed.nsfw) continue;
        const ch = await getChannel(bot, feed.channel_id);
        if (!ch) continue;
        const embed = new EmbedBuilder()
          .setTitle(post.title.slice(0, 256))
          .setURL(`https://reddit.com${post.permalink}`)
          .setColor(0xff4500)
          .setAuthor({ name: `r/${feed.subreddit}` })
          .setDescription((post.selftext || '').slice(0, 400) || null)
          .setTimestamp(new Date(post.created_utc * 1000));
        if (post.thumbnail && post.thumbnail.startsWith('http')) embed.setImage(post.thumbnail);
        await ch.send({ embeds: [embed] }).catch(() => {});
      }

      if (posts[0]) await db.updateRedditLastPost(feed.id, posts[0].id);
    } catch (err) {
      logger.debug(`Reddit poll error for r/${feed.subreddit}: ${err}`);
    }
  }
}

// ─── YouTube ──────────────────────────────────────────────────────────────────

async function pollYoutube(bot: Client) {
  if (!Config.YOUTUBE_API_KEY) return;
  const feeds = await db.getAllYoutubeFeeds();
  for (const feed of feeds) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?channelId=${feed.youtube_channel_id}&order=date&maxResults=1&part=snippet&type=video&key=${Config.YOUTUBE_API_KEY}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const json: any = await res.json();
      const item = json?.items?.[0];
      if (!item) continue;
      const videoId = item.id?.videoId;
      if (!videoId || videoId === feed.last_video_id) continue;

      const ch = await getChannel(bot, feed.channel_id);
      if (!ch) continue;

      const msg = (feed.message ?? '🎬 New video from **{channel}**: {url}')
        .replace('{channel}', feed.youtube_channel_name ?? 'YouTube')
        .replace('{title}', item.snippet?.title ?? '')
        .replace('{url}', `https://youtu.be/${videoId}`);

      await ch.send(msg).catch(() => {});
      await db.updateYoutubeLastVideo(feed.id, videoId);
    } catch (err) {
      logger.debug(`YouTube poll error: ${err}`);
    }
  }
}

// ─── Twitch ───────────────────────────────────────────────────────────────────

let twitchToken: { token: string; expires: number } | null = null;

async function getTwitchToken(): Promise<string | null> {
  if (!Config.TWITCH_CLIENT_ID || !Config.TWITCH_CLIENT_SECRET) return null;
  if (twitchToken && twitchToken.expires > Date.now()) return twitchToken.token;
  try {
    const res = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${Config.TWITCH_CLIENT_ID}&client_secret=${Config.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
      { method: 'POST', signal: AbortSignal.timeout(10_000) }
    );
    const json: any = await res.json();
    twitchToken = { token: json.access_token, expires: Date.now() + json.expires_in * 1000 - 60_000 };
    return twitchToken.token;
  } catch { return null; }
}

async function pollTwitch(bot: Client) {
  const token = await getTwitchToken();
  if (!token || !Config.TWITCH_CLIENT_ID) return;

  const feeds = await db.getAllTwitchFeeds();
  const usernames = [...new Set(feeds.map(f => f.twitch_username))];
  if (!usernames.length) return;

  try {
    const params = usernames.map(u => `user_login=${encodeURIComponent(u)}`).join('&');
    const res = await fetch(`https://api.twitch.tv/helix/streams?${params}`, {
      headers: {
        'Client-ID': Config.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return;
    const json: any = await res.json();
    const liveStreams: Map<string, any> = new Map(
      (json.data ?? []).map((s: any) => [s.user_login.toLowerCase(), s])
    );

    for (const feed of feeds) {
      const stream = liveStreams.get(feed.twitch_username.toLowerCase());
      const isLive = !!stream;

      if (isLive && !feed.live) {
        const ch = await getChannel(bot, feed.channel_id);
        if (ch) {
          const msg = (feed.message ?? '🔴 **{username}** is now live on Twitch!\n**{game}**\nhttps://twitch.tv/{username}')
            .replace(/{username}/g, stream.user_name)
            .replace(/{game}/g, stream.game_name ?? 'Unknown')
            .replace(/{title}/g, stream.title ?? '');
          await ch.send(msg).catch(() => {});
        }
      }
      if (isLive !== !!feed.live) {
        await db.updateTwitchFeedStatus(feed.id, isLive);
      }
    }
  } catch (err) {
    logger.debug(`Twitch poll error: ${err}`);
  }
}

// ─── Reminder poller ──────────────────────────────────────────────────────────

async function pollReminders(bot: Client) {
  const due = await db.getPendingReminders(Date.now());
  for (const reminder of due) {
    try {
      const ch = await bot.channels.fetch(reminder.channel_id).catch(() => null);
      if (ch && 'send' in ch) {
        await (ch as TextChannel).send(`⏰ <@${reminder.user_id}> Reminder: ${reminder.message}`).catch(() => {});
      }
    } catch {}
    await db.fireReminder(reminder.id);
  }
}

// ─── Start all pollers ────────────────────────────────────────────────────────

export function startFeedsPollers(bot: Client) {
  // Run immediately then on interval
  const poll = async () => {
    await Promise.all([
      pollRss(bot),
      pollReddit(bot),
      pollYoutube(bot),
      pollTwitch(bot),
      pollReminders(bot),
    ]);
  };
  poll();
  setInterval(poll, 5 * 60 * 1000); // every 5 minutes
}
