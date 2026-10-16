# 🎵 TMCBot Music

The music player for TMCBot. It runs **natively on Windows** (not in Docker),
because Discord voice is real-time UDP and Docker Desktop's virtual network makes
it choppy. The main bot keeps running everything else in Docker.

It runs **under the main Jade bot's account**: same token, same bot user. Its
commands are registered as server (guild) commands, so they never touch the main
bot's global commands. Both processes receive every interaction, and each answers
only its own.

Audio plays through **[Lavalink](https://github.com/lavalink-devs/Lavalink)**, a
separate Java audio server that runs next to the bot on this PC. That keeps audio
smooth: the bot's own work (searches, search-as-you-type, playlist lookups) can't
delay the voice packets, because they're sent by a different program. This setup
(Lavalink 4 with the `lavalink-client` library) follows
[BeatDock](https://github.com/albertgmz/BeatDock).

## ✨ Features

- **Plays almost anything:** YouTube and YouTube Music (songs, playlists), Spotify
  and Apple Music links (songs, albums, playlists), Bandcamp, Twitch, Vimeo, direct
  audio links and internet radio, and plain search text
- **Spotify and Apple Music** are played from the same song on YouTube Music, since
  their own audio is DRM-protected. No API keys are needed: the song list is read
  from the link's public page.
- **Live control panel:** the Now Playing message has ⏮️ ⏯️ ⏭️ ⏹️ 🔁 🔀 📜 🎤
  buttons. It replaces itself on each new song instead of filling the channel.
- **Search as you type:** `/play` suggests YouTube Music results while you type.
- **DJ system:** optional DJ role, vote-skip for everyone else, and a session host
- **Audio effects:** bass boost, nightcore, vaporwave, 8D, vocal remover, and
  playback speed
- **SponsorBlock:** optionally skips sponsor reads, self-promotion and the
  non-music parts of music videos
- **Lyrics** for the current song or any song (from LRCLIB)
- **24/7 mode** and **autoplay** of similar songs when the queue runs out

## 🎛️ Commands

Anyone can add songs, see the queue, look up lyrics, and vote to skip. Commands
marked **DJ** need DJ controls (see below).

| Command | Description |
|---|---|
| `/play <query> [next]` | Play a song or playlist, or add it to the queue. `next:True` (**DJ**) puts it at the front of the queue. |
| `/skip` | Skip the song. DJs and the person who queued it skip right away; everyone else starts a vote that needs half the listeners. |
| `/stop` | **DJ.** Stop, clear the queue and leave (in 24/7 mode it stays in the channel). |
| `/queue [page]` | Show the queue with its total length. |
| `/nowplaying` | Show the current song with a progress bar. |
| `/lyrics [query]` | Show lyrics for the current song, or any song. |
| `/volume <1-200>` | **DJ.** Set the volume (saved per server). |
| `/loop <mode>` | **DJ.** Off, song, queue, or autoplay (keeps playing similar songs). |
| `/shuffle` | **DJ.** Shuffle the queue. |
| `/remove <position>` | Remove a song. DJs can remove any; others only their own. |
| `/filter [effect] [speed]` | **DJ.** Toggle bass boost, nightcore, vaporwave, 8D or vocal remover, set the speed (0.5-2), or turn everything off. With no options it lists the effects that are on. |
| `/music-settings view` | *Manage Server.* Show this server's music settings. |
| `/music-settings dj-role [role]` | *Manage Server.* Set or clear the DJ role. |
| `/music-settings 24-7 <enabled>` | *Manage Server.* Stay in voice when the queue ends or everyone leaves. |
| `/music-settings sponsorblock <enabled>` | *Manage Server.* Skip sponsor reads and non-music parts of YouTube videos. |

Pause/resume, previous song, and stop are buttons on the Now Playing panel. The
pause button also works for the person who queued the current song.

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
- **Java 21** (Lavalink 4.2 runs on Java 17 or newer). `start.ps1` looks for a
  `jdk-21*` folder under `C:\Program Files\Java`, Eclipse Adoptium or Microsoft,
  and falls back to the `java` on PATH.

Lavalink itself is downloaded for you: `lavalink/setup-lavalink.ps1` fetches the
pinned versions from their official GitHub releases and checks their SHA-256.

| Component | Version | Source |
|---|---|---|
| Lavalink | 4.2.2 | [lavalink-devs/Lavalink](https://github.com/lavalink-devs/Lavalink/releases) |
| YouTube plugin | 1.18.2 | [lavalink-devs/youtube-source](https://github.com/lavalink-devs/youtube-source/releases) |
| SponsorBlock plugin | 3.0.1 | [topi314/Sponsorblock-Plugin](https://github.com/topi314/Sponsorblock-Plugin/releases) |

To upgrade one, change its URL and SHA-256 in `setup-lavalink.ps1`.

### 2. Configure

```powershell
cd music-bot
copy .env.example .env
```

Fill in `.env` with the **main Jade bot's** values:

| Variable | Value |
|---|---|
| `TOKEN` | *Leave blank.* `start.ps1` reads the main bot's token from `C:\TMCBot-PROD\secrets.env` each time it starts, so there's only one copy. Fill it in only to run as a different bot. |
| `CLIENT_ID` | The main bot's application ID: `1517192967000031253` |
| `GUILD_ID` | The server to register the music commands in: `337294816641679370` |
| `LAVALINK_PASSWORD` | *Leave it out.* `setup-lavalink.ps1` generates a random one on first run. |
| `YOUTUBE_REFRESH_TOKEN` | *Leave it out.* Saved automatically after the YouTube sign-in below. |

> [!IMPORTANT]
> `GUILD_ID` is required when sharing Jade's token. Without it, the music commands
> would be registered globally, where the main bot deletes them on every restart.

#### YouTube sign-in

YouTube blocks logged-out playback ("Sign in to confirm you're not a bot"), so
Lavalink plays YouTube signed in to a Google account. Use a **spare account**,
not your main one: the YouTube plugin warns that Google can suspend accounts used
this way. To sign in (or switch accounts, after deleting `YOUTUBE_REFRESH_TOKEN`
from `.env`):

1. Start the bot. With no saved token, Lavalink logs a line like
   `OAUTH INTEGRATION: ... go to https://www.google.com/device and enter code XXX-XXX-XXXX`
   in `lavalink/logs/spring.log`.
2. Open google.com/device, enter the code, sign in and allow access.
3. Lavalink logs the account's refresh token, and on its next start
   `setup-lavalink.ps1` saves it to `.env` as `YOUTUBE_REFRESH_TOKEN`. Keep `.env`
   private: the token gives access to that YouTube account.

Lavalink's settings live in `lavalink/application.template.yml`. Edit that file,
not `application.yml`, which is generated from it (with the password) on every start.
Lavalink only listens on `127.0.0.1`, so nothing outside this PC can reach it.

### 3. Run

```powershell
powershell -ExecutionPolicy Bypass -File start.ps1
```

`start.ps1` prepares and starts Lavalink, waits until it answers, then starts the
bot. If the bot exits, both restart after 10 seconds. If Lavalink dies, the bot
exits after 30 seconds without it, which restarts both. Bot output goes to
`music-bot.log`; Lavalink logs to `lavalink/logs/` and `lavalink/stderr.log`.
Leave the window open, or run it at sign-in with Task Scheduler.

On this PC, the **TMCBot Music** task already does that: it starts `start.ps1` hidden
at sign-in, with no time limit and no stop on battery power. Stopping the task
doesn't stop Lavalink or the bot, but the next start cleans up any leftover copies.
To set it up elsewhere:

```powershell
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "D:\Bots\TMCBot-PROD\music-bot\start.ps1"'
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'TMCBot Music' -Action $action -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME) -Settings $settings
```

Start it now without signing out with `Start-ScheduledTask -TaskName 'TMCBot Music'`,
and watch `music-bot.log` to see it come up.

For development, start Lavalink with `start.ps1` once, then `bun run dev` restarts
the bot on file changes.

## 🔧 Troubleshooting

| Symptom | Fix |
|---|---|
| "The music server is still starting" | Lavalink isn't connected yet. It takes about 6 seconds after a restart. If it lasts, check `music-bot.log`, `lavalink/stderr.log` and `lavalink/logs/spring.log`. |
| YouTube songs fail with "Sign in to confirm you're not a bot" or "requires login" | The YouTube sign-in is missing or was revoked. Delete `YOUTUBE_REFRESH_TOKEN` from `.env`, restart, and sign in again (see YouTube sign-in above). |
| YouTube songs fail to load for another reason | YouTube changed something. Update the YouTube plugin in `setup-lavalink.ps1` to its latest release. |
| SoundCloud links don't play | Known problem: SoundCloud changed its stream format and Lavalink can't play it yet ([lavaplayer#189](https://github.com/lavalink-devs/lavaplayer/issues/189)), so SoundCloud is turned off in `application.template.yml`. |
| Short audio dropouts every few seconds | A known Lavalink 4.2.2 problem with Discord's voice encryption ([Lavalink#1222](https://github.com/lavalink-devs/Lavalink/issues/1222)). A fix is proposed in [Lavalink#1235](https://github.com/lavalink-devs/Lavalink/pull/1235); upgrade Lavalink once it's released. |
| A command disappeared | It's re-registered within 5 minutes automatically. Restarting the music bot also brings it back immediately. |
| Choppy audio | Make sure the music bot and Lavalink run natively, not in Docker. |

## 🗂️ Files

| File | Purpose |
|---|---|
| `index.ts` | Startup, command registration, interaction routing |
| `commands.ts` | The slash commands, panel buttons and autocomplete |
| `lavalink.ts` | Lavalink connection, Now Playing panel, DJ permissions, idle timers, autoplay |
| `links.ts` | Reads Spotify and Apple Music links without API keys |
| `store.ts` | Per-server settings in `music-config.json` |
| `start.ps1` | Launcher: starts Lavalink and the bot, restarts both |
| `lavalink/setup-lavalink.ps1` | Downloads and checks the Lavalink jars, writes its config |
| `lavalink/application.template.yml` | Lavalink settings |
