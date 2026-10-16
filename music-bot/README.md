# 🎵 TMCBot Music

The `/music` player for TMCBot. It runs **natively on Windows** (not in Docker),
because Discord voice is real-time UDP and Docker Desktop's virtual network makes
it choppy. The main bot keeps running everything else in Docker.

It runs **under the main Jade bot's account**: same token, same bot user. `/music`
is registered as a server (guild) command, so it never touches the main bot's
global commands. Both processes receive every interaction, and each answers only
its own.

## ✨ Features

- **Plays almost anything:** YouTube, SoundCloud, Spotify and Apple Music links
  (songs and playlists), plain search text, and direct radio streams
- **Reliable audio:** every track is fetched with **yt-dlp**. Songs are downloaded
  whole before they play, and the next one downloads while the current one plays,
  so there are no gaps or stutters. Long mixes and live streams are streamed instead.
- **Spotify and Apple Music** are played from the same song on YouTube, since
  their own audio is DRM-protected.
- **Live control panel:** the Now Playing message has ⏮️ ⏯️ ⏭️ ⏹️ 🔁 🔀 📜 🎤
  buttons. It replaces itself on each new song instead of filling the channel.
- **Search as you type:** `/music play` suggests YouTube results while you type.
- **DJ system:** optional DJ role, vote-skip for everyone else, and a session host
- **Audio effects:** bass boost, nightcore, vaporwave, 8D, lo-fi, vocal remover
  and more, plus playback speed
- **Lyrics** for the current song or any song (from LRCLIB)
- **24/7 mode, karaoke mode, follow mode**, and autoplay of similar songs

## 🎛️ Commands

Anyone can add songs, see the queue, look up lyrics, and vote to skip. Commands
marked **DJ** need DJ controls (see below).

| Command | Description |
|---|---|
| `/music play <query>` | Play a song or playlist, or add it to the queue. |
| `/music playnext <query>` | **DJ.** Queue a song to play next. |
| `/music playnow <query>` | **DJ.** Play a song right away. |
| `/music search <query> [source]` | Search YouTube or SoundCloud and pick from the results. |
| `/music stream <url>` | Play a direct stream, such as internet radio. |
| `/music skip` | Skip the track. DJs and the person who queued it skip right away; everyone else starts a vote that needs half the listeners. |
| `/music skipto <position>` | **DJ.** Jump to a track in the queue. |
| `/music previous` | **DJ.** Play the previous track again. |
| `/music pause` | **DJ** or the person who queued the track. Pause or resume. |
| `/music stop` | **DJ.** Stop and clear the queue. |
| `/music queue [page]` | Show the queue with its total length. |
| `/music nowplaying` | Show the current track with a progress bar. |
| `/music lyrics [query]` | Show lyrics for the current song, or any song. |
| `/music volume <1-200>` | **DJ.** Set the volume (saved per server). |
| `/music speed <0.5-3>` | **DJ.** Change the playback speed. |
| `/music seek <time>` | **DJ.** Jump to a time, for example `1:30` or `90`. |
| `/music loop <mode>` | **DJ.** Off, track, queue, or autoplay (keeps playing similar songs). |
| `/music shuffle` | **DJ.** Shuffle the queue. |
| `/music remove <position>` | Remove a track. DJs can remove any; others only their own. |
| `/music move <from> <to>` | **DJ.** Move a track in the queue. |
| `/music clear` | **DJ.** Clear the queue but keep the current song. |
| `/music filter <effect>` | **DJ.** Toggle an effect, or turn them all off. |
| `/music summon` | Bring the bot to your channel. **DJ** if it's busy elsewhere. |
| `/music clean [amount]` | **DJ.** Delete the music bot's recent messages (never the main bot's). |
| `/music dj host <user>` | Hand the session's DJ controls to someone else (current host or Manage Server). |
| `/music dj follow [user]` | **DJ.** Make the bot follow someone between voice channels. |
| `/music dj karaoke` | *Manage Server.* Toggle karaoke mode: only DJs can add tracks. |
| `/music dj 247` | *Manage Server.* Toggle 24/7 mode: stay in voice when idle. |
| `/music dj role [role]` | *Manage Server.* Set or clear the DJ role. |

### 🎧 Who counts as a DJ

- **No DJ role set (the default):** everyone in the bot's voice channel.
- **With a DJ role set:** members with that role, members with **Manage Server**,
  the session host (whoever started the music), and anyone alone with the bot.

Controls only work from the bot's voice channel, except for Manage Server members.
When nothing is queued, the bot leaves after 5 minutes, or 30 seconds after everyone
leaves, unless 24/7 mode is on.

## 🚀 Setup

### 1. Requirements (already installed on this machine)

- **Bun** (runtime)
- **ffmpeg** on PATH
- **yt-dlp** on PATH, kept up to date. `start.ps1` updates it on every start.
- **Deno** on PATH. yt-dlp uses it to solve YouTube's player challenges.

### 2. Configure

```powershell
cd music-bot
copy .env.example .env
```

Fill in `.env` with the **main Jade bot's** values:

| Variable | Value |
|---|---|
| `TOKEN` | The main bot's token (same as `TOKEN` in `C:\TMCBot-PROD\secrets.env`) |
| `CLIENT_ID` | The main bot's application ID |
| `GUILD_ID` | The server to register `/music` in: `337294816641679370` |
| `YOUTUBE_COOKIE` | *Optional.* A YouTube cookie string, which helps with rate limits |

> [!IMPORTANT]
> `GUILD_ID` is required when sharing Jade's token. Without it, `/music` would be
> registered globally, where the main bot deletes it on every restart.

### 3. Run

```powershell
powershell -ExecutionPolicy Bypass -File start.ps1
```

`start.ps1` updates yt-dlp, starts the bot, restarts it if it ever exits, and logs
to `music-bot.log`. Leave the window open, or run it at sign-in with Task Scheduler:

```powershell
schtasks /Create /TN "TMCBot Music" /SC ONLOGON /RL LIMITED /TR "powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File D:\Bots\TMCBot-PROD\music-bot\start.ps1"
```

For development, `bun run dev` restarts the bot on file changes.

## 🔧 Troubleshooting

| Symptom | Fix |
|---|---|
| Songs fail with "HTTP Error 403: Forbidden" in the log | yt-dlp is out of date. Restart `start.ps1`, or run `python -m pip install -U "yt-dlp[default]"`. |
| The bot joins but no sound plays | `@snazzah/davey` must stay installed. Discord requires the DAVE voice protocol. |
| `/music` disappeared | It's re-registered within 5 minutes automatically. Restarting the music bot also brings it back immediately. |
| Choppy audio | Make sure the music bot runs natively, not in Docker. |

## 🗂️ Files

| File | Purpose |
|---|---|
| `index.ts` | Startup, command registration, interaction routing |
| `music.ts` | The `/music` command, panel buttons and autocomplete |
| `player.ts` | discord-player setup, Now Playing panel, DJ permissions, filters |
| `audio.ts` | yt-dlp downloading, caching and streaming |
| `store.ts` | Per-server settings in `music-config.json` |
| `start.ps1` | Launcher with yt-dlp updates and auto-restart |
