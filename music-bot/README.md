# TMCBot Music (standalone)

A separate, music-only Discord bot that runs **natively on Windows** (not in
Docker). It exists solely to keep Discord's real-time voice UDP off Docker
Desktop's virtualized network, which was causing choppy/skipping audio. The main
bot keeps running everything else in Docker.

It's a second Discord application (its own bot user), so you'll see two bots in
your server: the main one, and this music one.

## One-time setup

### 1. Create the bot application
1. Go to <https://discord.com/developers/applications> → **New Application**.
2. Name it (e.g. "TMC Music"), open the **Bot** tab → **Reset Token** → copy the token.
3. On the **Bot** tab, no privileged intents are required (music only needs Guilds + Voice States).
4. On **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`;
   bot permissions: **Connect**, **Speak**, **View Channel**, **Send Messages**,
   **Embed Links**, **Use Slash Commands**. Open the generated URL and invite it
   to your server.
5. Copy the **Application ID** from **General Information**.

### 2. Configure
```
cd music-bot
cp .env.example .env
```
Put the token in `TOKEN=` and the application ID in `CLIENT_ID=` in `.env`.
(Optional: paste a YouTube cookie string into `YOUTUBE_COOKIE=`.)

### 3. Requirements on the Windows host (already present on this machine)
- **Bun** (runtime)
- **ffmpeg** on PATH
- **yt-dlp** on PATH

### 4. Install & run
```
bun install
bun run start        # or: bun run dev  (auto-restarts on file changes)
```
Leave that terminal open — the bot runs as long as it's running. To keep it
running in the background / on boot, use a tool like NSSM or Task Scheduler, or
just a dedicated terminal window.

## Commands
Same `/music` commands as before (play, playnext, playnow, search, stream, skip,
stop, clear, pause, queue, nowplaying, volume, speed, loop, shuffle, remove,
move, seek, karaoke, summon, follow, clean). Per-server volume is stored locally
in `music-config.json`.

## Notes
- The main (Docker) bot no longer has `/music` — it lives here now.
- This bot downloads each track with yt-dlp and plays from a local buffer,
  prefetching the next queued track for seamless transitions.
