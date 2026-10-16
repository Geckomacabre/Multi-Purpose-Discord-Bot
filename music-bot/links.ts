// Spotify and Apple Music links. Their audio is DRM-protected and there are no API
// keys here, so each link is read from its public web page for the song titles,
// artists and durations, and Lavalink then plays the matching song from YouTube
// Music (see toUnresolved in lavalink.ts).
//
// Spotify: the embed page's __NEXT_DATA__ JSON, the same keyless approach as
// @discord-player/extractor and spotify-url-info (both MIT licensed).
// Apple Music: the "serialized-server-data" JSON on the public music.apple.com page.

export type LinkTrack = { title: string; author: string; duration?: number; artworkUrl?: string | null };
export type LinkResult = { name: string | null; url: string; artworkUrl: string | null; tracks: LinkTrack[] };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const TIMEOUT_MS = 10_000;

const SPOTIFY = /^https?:\/\/(?:open\.spotify\.com|spotify\.link|spotify\.app\.link)\//i;
const APPLE = /^https?:\/\/(?:geo\.)?music\.apple\.com\//i;

export const isLinkSource = (query: string) => SPOTIFY.test(query) || APPLE.test(query);

async function get(url: string): Promise<{ html: string; url: string }> {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`the page returned HTTP ${res.status}`);
  return { html: await res.text(), url: res.url };
}

function jsonScript(html: string, id: string): any {
  // Apple leaves some id attributes unquoted (id=schema:song).
  const m = html.match(new RegExp(`<script\\b[^>]*?\\bid="?${id}"?(?=[\\s>])[^>]*>([\\s\\S]*?)</script>`));
  if (!m) throw new Error('the page layout changed, so the link could not be read');
  return JSON.parse(m[1]!);
}

/** Track metadata for a Spotify or Apple Music link, or null for any other query. */
export async function resolveLink(query: string): Promise<LinkResult | null> {
  if (SPOTIFY.test(query)) return spotify(query);
  if (APPLE.test(query)) return apple(query);
  return null;
}

// ── Spotify ──────────────────────────────────────────────────────────────────

async function spotify(link: string): Promise<LinkResult> {
  let url = link;
  // spotify.link short links redirect to the open.spotify.com page.
  if (!/open\.spotify\.com/i.test(url)) url = (await get(url)).url;
  const m = url.match(/open\.spotify\.com\/(?:intl-[\w-]+\/)?(track|album|playlist)\/([A-Za-z0-9]+)/i);
  if (!m) throw new Error('only Spotify song, album and playlist links are supported');
  const [, kind, id] = m;

  const { html } = await get(`https://open.spotify.com/embed/${kind!.toLowerCase()}/${id}`);
  const e = jsonScript(html, '__NEXT_DATA__')?.props?.pageProps?.state?.data?.entity;
  if (!e) throw new Error('Spotify did not return that item. It may be private or region-locked');

  const cover = (e.visualIdentity?.image ?? e.coverArt?.sources ?? [])
    .reduce((best: any, img: any) => ((img?.maxWidth ?? img?.width ?? 0) > (best?.maxWidth ?? best?.width ?? 0) ? img : best), null)?.url ?? null;

  if (Array.isArray(e.trackList)) {
    return {
      name: e.name ?? e.title ?? null,
      url,
      artworkUrl: cover,
      tracks: e.trackList
        .filter((t: any) => t?.title && t.isPlayable !== false)
        .map((t: any) => ({ title: t.title, author: t.subtitle ?? '', duration: t.duration || undefined })),
    };
  }
  return {
    name: null,
    url,
    artworkUrl: cover,
    tracks: [{
      title: e.name ?? e.title,
      author: (e.artists ?? []).map((a: any) => a.name).join(', '),
      duration: e.duration || undefined,
      artworkUrl: cover,
    }],
  };
}

// ── Apple Music ──────────────────────────────────────────────────────────────

const appleArtwork = (art: any): string | null =>
  art?.dictionary?.url?.replace('{w}x{h}bb.{f}', '600x600bb.jpg') ?? null;

/** "PT6M1S" → ms */
function isoDuration(s: string | undefined): number | undefined {
  const m = s?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return undefined;
  return ((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 1000;
}

async function apple(url: string): Promise<LinkResult> {
  if (!/\/(album|playlist|song)\//i.test(url)) throw new Error('only Apple Music song, album and playlist links are supported');
  const { html } = await get(url);
  const sections: any[] = jsonScript(html, 'serialized-server-data')?.data?.[0]?.data?.sections ?? [];

  // Song pages: /song/<name>/<id>
  const song = sections.find((s) => s.itemKind === 'songDetailHeader')?.items?.[0];
  if (song) {
    let duration: number | undefined;
    try { duration = isoDuration(jsonScript(html, 'schema:song')?.timeRequired); } catch { /* optional */ }
    const art = appleArtwork(song.artwork);
    return { name: null, url, artworkUrl: art, tracks: [{ title: song.title, author: song.artists ?? '', duration, artworkUrl: art }] };
  }

  const header = sections.find((s) => s.itemKind === 'containerDetailHeaderLockup')?.items?.[0];
  const items: any[] = sections.find((s) => s.itemKind === 'trackLockup')?.items ?? [];
  if (!items.length) throw new Error('Apple Music did not list any songs for that link');
  // Album tracks leave the artist blank when it's the album artist.
  const headerArtist = (header?.subtitleLinks ?? []).map((l: any) => l.title).join(', ');
  const art = appleArtwork(header?.artwork);
  let tracks: LinkTrack[] = items.map((t) => ({
    title: t.title,
    author: (t.subtitleLinks ?? []).map((l: any) => l.title).join(', ') || headerArtist,
    duration: t.duration || undefined,
    artworkUrl: art,
    id: t.contentDescriptor?.identifiers?.storeAdamID,
  }));

  // An album link with ?i=<song id> points at one song on the album.
  const songId = new URL(url).searchParams.get('i');
  if (songId) {
    const one = tracks.filter((t: any) => t.id === songId);
    if (one.length) return { name: null, url, artworkUrl: art, tracks: one };
  }
  return { name: header?.title ?? null, url, artworkUrl: art, tracks };
}
