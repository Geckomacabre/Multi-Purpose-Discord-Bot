## TMCBot
Official Discord Bot for The Midnight Club.

<a href="https://discord.gg/the-midnight-club">
  <img src="https://img.shields.io/badge/Discord-5865F2.svg?style=for-the-badge&logo=Discord&logoColor=white">
</a>

## Built With
![](https://img.shields.io/badge/TypeScript-3178C6.svg?style=for-the-badge&logo=TypeScript&logoColor=white)
![](https://img.shields.io/badge/Bun-000?style=for-the-badge&logo=bun&logoColor=white)

[discord.js](https://github.com/discordjs/discord.js)

---

## Setup

### Requirements
- [Bun](https://bun.sh) runtime
- A Discord application with a bot token ([Discord Developer Portal](https://discord.com/developers/applications))
- **Privileged intents** enabled in the Developer Portal → Bot:
  - Server Members Intent
  - Presence Intent

### Environment Variables

Create a `.env` file in the project root:

```env
# Required
TOKEN=your_discord_bot_token
CLIENT_ID=your_application_id
GUILD_ID=your_server_id
NODE_ENV=development   # or production

# Web Dashboard — required to enable the dashboard
DISCORD_CLIENT_SECRET=   # OAuth2 client secret from Discord Developer Portal
WEB_PORT=3000            # Port the dashboard listens on
WEB_URL=http://localhost:3000  # Public-facing URL (used for OAuth redirect)

# Optional — enables specific features
TWITCH_CLIENT_ID=        # Twitch live alerts (/twitch)
TWITCH_CLIENT_SECRET=    # Twitch live alerts (/twitch)
YOUTUBE_API_KEY=         # YouTube upload alerts (/youtube)
WEATHER_API_KEY=         # OpenWeatherMap key (/weather)
REPORT_CHANNEL_ID=       # Fallback channel for /report when no modlog is set
TENOR_API_KEY=           # GIF search (/gif) — free key at https://developers.google.com/tenor
```

### Running

```bash
bun install
bun run dev       # Development (guild commands, hot reload)
bun run start:production  # Production (global commands)
```

---

## Features

### Original Features
These were part of TMCBot before the YAGPDB port.

| Feature | Description |
|---|---|
| **Counting** | Sequential number counting game per channel. Tracks high scores, punishes wrong numbers with a random count setback, catches edits/deletes, and responds to natural language queries like "what is the count". Configured with `/counting`. |

---

### Added Features
Everything below was ported from [YAGPDB](https://yagpdb.xyz) and re-implemented in TypeScript.

#### Moderation
| Command | Description |
|---|---|
| `/ban` | Ban a member. Supports temporary bans (e.g. `1d`, `12h`) that auto-expire. |
| `/unban` | Unban a user by ID. |
| `/kick` | Kick a member. |
| `/timeout` | Timeout a member (Discord native, up to 28 days). |
| `/removetimeout` | Remove a member's active timeout. |
| `/warn` | Warn a member. Warnings are stored and DM'd to the user. |
| `/warnings list` | View all warnings for a user. |
| `/warnings delete` | Delete a specific warning by ID. |
| `/warnings clear` | Clear all warnings for a user. |
| `/reason` | Edit the reason for an existing mod case. |
| `/case` | View the details of a mod case by number. |
| `/clean` | Bulk-delete up to 100 messages. Filter by user or bots-only. |
| `/report` | Report a member to staff. Sends to the modlog channel. |
| `/modconfig modlog` | Set the channel where mod actions are logged. |
| `/modconfig dm` | Toggle whether punished users are DM'd. |
| `/modconfig view` | View current moderation settings. |

#### AutoMod
| Command | Description |
|---|---|
| `/automod add` | Create an automod rule. Trigger types: `spam`, `caps`, `links`, `words`, `mentions`, `regex`. Actions: `delete`, `warn`, `timeout`, `kick`, `ban`. |
| `/automod list` | List all rules with their ID, status, and config. |
| `/automod delete` | Delete a rule by ID. |
| `/automod toggle` | Enable or disable a rule. |

#### Logging
| Command | Description |
|---|---|
| `/logs channel` | Set the channel for server logs. |
| `/logs toggle` | Enable or disable logging entirely. |
| `/logs events` | Choose which events to log: joins, leaves, edits, deletes, bans, nicknames, roles. |
| `/logs ignore` | Toggle ignoring a channel from message logs. |
| `/logs view` | View current log settings. |

Logged events: member join/leave, message edit/delete, bans/unbans, nickname changes, role changes.

#### Role Management
| Command | Description |
|---|---|
| `/autorole add` | Assign a role automatically to new members (with optional delay). |
| `/autorole remove` | Remove an autorole by ID. |
| `/autorole list` | List all autoroles. |
| `/rolecommands add` | Register a self-assignable role with a name and optional group. |
| `/rolecommands remove` | Remove a role command by ID. |
| `/rolecommands list` | List all self-assignable roles. |
| `/role` | Toggle a self-assignable role on yourself. |
| `/voiceroles add` | Assign a role when members join a specific voice channel. |
| `/voiceroles remove` | Remove a voice role binding. |
| `/voiceroles list` | List all voice role bindings. |
| `/bulkrole` | Assign or remove a role from many members at once with filters (all, has role, missing role, bots, humans). |

#### Reputation
| Command | Description |
|---|---|
| `/rep give` | Give +1 reputation to a user (1-hour cooldown per target). |
| `/rep take` | Remove 1 reputation from a user (Manage Guild required). |
| `/rep view` | View a user's reputation. |
| `/rep leaderboard` | Show the top 10 reputation holders. |

#### Tickets
| Command | Description |
|---|---|
| `/ticket create` | Open a new support ticket channel. |
| `/ticket close` | Close and delete the current ticket channel. |
| `/ticket add` | Add a user to the current ticket. |
| `/ticket remove` | Remove a user from the current ticket. |
| `/ticketconfig set` | Configure ticket category, log channel, and support role. |
| `/ticketconfig view` | View current ticket settings. |

#### Reminders
| Command | Description |
|---|---|
| `/reminder set` | Set a reminder (e.g. `10m`, `2h`, `1d`). Fires in the channel where it was set. |
| `/reminder list` | List your active reminders. |
| `/reminder delete` | Delete a reminder by ID. |

#### Custom Commands
| Command | Description |
|---|---|
| `/cc create` | Create a custom command with trigger types: `command`, `startswith`, `contains`, `exact`, `regex`. Response supports `{user}`, `{username}`, `{server}`, `{channel}`, `{membercount}`. |
| `/cc edit` | Update a custom command's response. |
| `/cc delete` | Delete a custom command. |
| `/cc toggle` | Enable or disable a command. |
| `/cc list` | List all custom commands. |

#### Feed Subscriptions
All feeds are polled every 5 minutes.

| Command | Description |
|---|---|
| `/twitch add` | Subscribe to Twitch live alerts for a channel. Requires `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`. |
| `/twitch remove` | Remove a Twitch subscription. |
| `/twitch list` | List Twitch subscriptions. |
| `/youtube add` | Subscribe to YouTube upload alerts for a channel. Requires `YOUTUBE_API_KEY`. |
| `/youtube remove` | Remove a YouTube subscription. |
| `/youtube list` | List YouTube subscriptions. |
| `/reddit add` | Subscribe to new posts from a subreddit (no API key needed). |
| `/reddit remove` | Remove a Reddit subscription. |
| `/reddit list` | List Reddit subscriptions. |
| `/rss add` | Subscribe to an RSS/Atom feed. |
| `/rss remove` | Remove an RSS feed. |
| `/rss list` | List RSS feeds. |

#### Streaming Announcements
Powered by Discord presence detection. Requires the **Presence Intent**.

| Command | Description |
|---|---|
| `/streaming set` | Configure the announcement channel, a role to assign while streaming, and a custom message template (`{username}`, `{game}`, `{url}`). |
| `/streaming view` | View current streaming settings. |

#### Server Stats
| Command | Description |
|---|---|
| `/stats` | Show server activity for the last N hours (default 24, max 168). Displays total messages, joins, leaves, and current member count. |

#### RSVP / Events
| Command | Description |
|---|---|
| `/rsvp create` | Create a server event with a title, time, and optional description. |
| `/rsvp list` | List upcoming events. |
| `/rsvp attend` | RSVP as attending. |
| `/rsvp decline` | RSVP as not attending. |
| `/rsvp maybe` | RSVP as maybe. |
| `/rsvp view` | View an event's details and full attendee list. |

#### AntiPhishing
No configuration needed — active automatically. Detects and deletes messages containing known phishing domains using the [sinking.yachts](https://phish.sinking.yachts) API. Domain list refreshes every 30 minutes.

#### Utility
| Command | Description |
|---|---|
| `/ping` | Check bot and API latency. |
| `/avatar` | Get a user's full-size avatar. |
| `/userinfo` | Display account creation date, join date, roles, and nickname. |
| `/serverinfo` | Display server stats: owner, member count, boost level, verification level. |
| `/roll` | Roll dice (e.g. `2d6`, `1d20+5`). |
| `/poll` | Create a reaction poll with up to 5 options. |
| `/calc` | Evaluate a math expression (supports `+`, `-`, `*`, `/`, `^`, `%`). |
| `/8ball` | Ask the magic 8-ball a yes/no question. |
| `/topic` | Get a random conversation topic. |
| `/catfact` | Get a random cat fact. |
| `/dogfact` | Get a random dog fact. |
| `/dadjoke` | Get a random dad joke. |
| `/advice` | Get a random piece of advice. |
| `/inspire` | Get an inspirational quote. |
| `/roast` | Roast a user (all in good fun). |
| `/wouldyourather` | Get a would-you-rather question with reaction voting. |
| `/listroles` | List all roles in the server with member counts. |
| `/viewperms` | View a user's permissions globally or in a specific channel. |
| `/weather` | Get current weather for a location. Requires `WEATHER_API_KEY`. |
| `/define` | Look up a word's dictionary definition, part of speech, and example. |
| `/xkcd` | Get a random or specific xkcd comic. |

#### Fun
| Command | Description |
|---|---|
| `/cah create` | Start a Cards Against Humanity game in the current channel. |
| `/cah join` | Join the current CAH game. |
| `/cah start` | Start the game (host only, minimum 3 players). |
| `/cah hand` | View your current hand (private). |
| `/cah play` | Play a card from your hand. |
| `/cah pick` | Card Czar: pick the winning submission. |
| `/cah end` | End the current game. |
| `/trivia [category] [difficulty]` | Answer a multiple-choice trivia question with button responses. 10 categories, 3 difficulties, 30-second timer. Powered by OpenTDB (no API key needed). |
| `/gif <query>` | Search for a GIF using Tenor. Requires `TENOR_API_KEY` in `.env`. |

---

### Economy & Leveling
These features were added natively to TMCBot (not ported from YAGPDB).

#### Leveling
XP is awarded per message sent (15–25 XP by default, 60-second cooldown per user). Level-up announcements are posted automatically. Leveling up also awards coins as a bonus reward.

Level formula (MEE6-style): `5n² + 50n + 100` XP required per level.
Coin reward on level-up: `level × 50` coins.

| Command | Description |
|---|---|
| `/rank [user]` | View your or another user's level, XP progress bar, and total messages. |
| `/leaderboard` | Show the top users by XP and level. |
| `/levelconfig toggle` | Enable or disable XP gain for the server. |
| `/levelconfig channel` | Set the channel for level-up announcements. |
| `/levelconfig xp` | Set XP per message range and cooldown seconds. |
| `/levelconfig message` | Customize the level-up announcement. Supports `{user}`, `{username}`, `{level}`. |
| `/levelconfig view` | View current leveling settings. |
| `/levelroles add` | Assign a role automatically when users reach a specific level. |
| `/levelroles remove` | Remove a level role binding by ID. |
| `/levelroles list` | List all level role bindings. |

#### Economy
Each server has its own virtual currency. Earn coins through daily rewards, work, leveling up, and gambling.

| Command | Description |
|---|---|
| `/balance [user]` | Check your or another user's coin balance and total earned. |
| `/daily` | Claim a daily coin reward (20-hour cooldown). |
| `/work` | Work to earn coins with a random job flavor text (1-hour cooldown). |
| `/pay <user> <amount>` | Transfer coins to another user. |
| `/baltop` | Show the richest users in the server. |

#### Gambling
All gambling commands bet against your coin balance.

| Command | Description |
|---|---|
| `/gamble flip <bet>` | Bet on a coin flip — win doubles your bet (50/50). |
| `/gamble roll <bet>` | Roll 1–100 against the bot — higher roll wins; ties refund your bet. |
| `/gamble slots <bet>` | Spin the slot machine — match 3 symbols to win. Payouts: 🍒×3=1.5× \| 🍋×3=2× \| 🔔×3=3× \| 💎×3=5× \| 7️⃣×3=10×. |

#### Free Game Tracker
Polls Epic Games Store, Steam, and GOG every hour for free game promotions. Posts to a configured channel with a claim button, the original price, and how long the freebie lasts. Deduplicates per server so no game is posted twice.

| Command | Description |
|---|---|
| `/freegames setup <channel>` | Enable the tracker and set the announcement channel. Optionally set a role to ping. |
| `/freegames platforms` | Toggle which platforms to track (Epic, Steam, GOG). |
| `/freegames ping [role]` | Set or clear the role pinged for new free game alerts. |
| `/freegames disable` | Disable the tracker for this server. |
| `/freegames view` | View current tracker settings. |
| `/freegames check` | Manually trigger a check and post any new free games immediately. |

Supported platforms:
- **Epic Games Store** — weekly free games via their official promotions API
- **Steam** — featured 100%-off specials (free weekends, permanent giveaways)
- **GOG** — discounted-to-free games from their catalog

#### Economy Admin
| Command | Description |
|---|---|
| `/econconfig currency` | Set the currency name and symbol for this server. |
| `/econconfig starting` | Set how many coins new users start with. |
| `/econconfig daily` | Set the daily reward min/max range. |
| `/econconfig work` | Set the work reward min/max range. |
| `/econconfig view` | View current economy settings. |

---

### Welcome System
Sends a customizable message to a channel (and optionally a DM) whenever a new member joins.

Supports template variables: `{user}`, `{username}`, `{server}`, `{membercount}`, `{#membercount}`.

| Command | Description |
|---|---|
| `/welcome channel <channel>` | Set the channel where welcome messages are posted. |
| `/welcome message <text>` | Set the welcome message template. |
| `/welcome dm <text>` | Set a DM sent to new members (`none` to disable). |
| `/welcome toggle` | Enable or disable the welcome system. |
| `/welcome test` | Preview the welcome message as if you just joined. |
| `/welcome view` | View current welcome settings. |

---

### Birthday Tracker
Members set their birthday once and the bot announces it on the day in a configured channel.

| Command | Description |
|---|---|
| `/birthday set <month> <day>` | Set your birthday. |
| `/birthday view [user]` | View a user's birthday and how many days away it is. |
| `/birthday list` | Show upcoming birthdays in the server, sorted by soonest. |
| `/birthday remove` | Remove your birthday from this server. |
| `/birthday delete <user>` | Remove a user's birthday (Manage Server required). |
| `/birthdayconfig channel <channel>` | Set the birthday announcement channel. |
| `/birthdayconfig toggle` | Enable or disable birthday announcements. |
| `/birthdayconfig view` | View current birthday settings. |

---

### Timezone Tracker
Members register their IANA timezone so others can see what time it is for them.

| Command | Description |
|---|---|
| `/timezone set <timezone>` | Set your timezone (e.g. `America/New_York`, `Europe/London`). |
| `/timezone view [user]` | See the current local time for a user. |
| `/timezone list` | List timezones of all members who have set one. |
| `/timezone remove` | Remove your timezone. |

---

### Starboard
Messages that receive enough of a configured reaction are automatically reposted to a dedicated starboard channel. The star count updates live.

| Command | Description |
|---|---|
| `/starboard channel <channel>` | Set the starboard channel. |
| `/starboard threshold <count>` | Set the minimum reaction count needed (default: 3). |
| `/starboard emoji <emoji>` | Set which reaction to watch (default: ⭐). |
| `/starboard toggle` | Enable or disable the starboard. |
| `/starboard view` | View current starboard settings. |

---

### Topic Rotation
Automatically posts a discussion prompt to a channel on a configurable schedule. Topics cycle sequentially or randomly.

| Command | Description |
|---|---|
| `/topics setup <channel> <interval> [mode]` | Set up rotation for a channel. Interval examples: `6h`, `1d`, `12h`. Mode: `sequential` or `random`. |
| `/topics add <channel> <topic>` | Add a discussion topic to a channel's queue. |
| `/topics delete <id>` | Remove a topic by ID. |
| `/topics list <channel>` | List all topics and current settings for a channel. |
| `/topics post <channel>` | Manually post the next topic immediately. |
| `/topics remove <channel>` | Stop topic rotation for a channel. |

---

### Giveaways
Button-based giveaway system. Users click to enter, winners are picked randomly when time expires or the host ends it early.

| Command | Description |
|---|---|
| `/giveaway start <prize> <duration> <winners> [channel]` | Start a giveaway. Duration examples: `1h`, `30m`, `2d`. |
| `/giveaway end <id>` | End a giveaway early and pick winners immediately. |
| `/giveaway reroll <id>` | Re-pick winners for an already-ended giveaway. |
| `/giveaway list` | List all active giveaways in the server. |

---

### Reaction Roles
Attach a role to a reaction emoji on any message. Members gain the role by reacting and lose it by removing the reaction.

| Command | Description |
|---|---|
| `/reactionroles add <message_link> <emoji> <role>` | Bind an emoji reaction on a message to a role. Paste the message link directly from Discord. |
| `/reactionroles remove <id>` | Remove a binding by ID. |
| `/reactionroles clear <message_link>` | Remove all reaction roles from a message. |
| `/reactionroles list` | List all active reaction role bindings. |

---

### Server Stat Channels
Creates read-only voice channels that display live server statistics, updating every 10 minutes.

| Command | Description |
|---|---|
| `/statschannels add <type> [label]` | Create a stat channel. Types: `members`, `humans`, `bots`, `channels`, `roles`. |
| `/statschannels remove <id>` | Delete a stat channel. |
| `/statschannels list` | List all stat channels. |

---

### Translation
Translate text between 16 languages instantly. No API key required.

| Command | Description |
|---|---|
| `/translate <text> [to] [from]` | Translate text. Target language defaults to English. Source is auto-detected if not specified. Powered by MyMemory. |

---

### Message Purge
Advanced bulk message deletion with multiple filters. Works on messages less than 14 days old.

| Command | Description |
|---|---|
| `/purge <amount> [user] [keyword] [bots] [attachments] [embeds]` | Delete up to 200 messages. Filter by author, content keyword, bots only, has attachment, or has embed. |

---

### Tags

Community text snippets. Anyone can create a tag; the owner (or a mod) can edit/delete it.

| Command | Description |
|---|---|
| `/tag create <name> <content>` | Create a new tag. |
| `/tag get <name>` | Display a tag. |
| `/tag edit <name> <content>` | Edit your tag. |
| `/tag delete <name>` | Delete your tag (Manage Guild can delete any tag). |
| `/tag info <name>` | Show tag metadata (owner, uses, creation date). |
| `/tag list` | List all tags in the server. |

---

### Music

Full-featured music player. Supports YouTube, Spotify, SoundCloud, Apple Music, and more via `discord-player`.

**Requires:** `ffmpeg` installed and available on your system PATH.

| Command | Description |
|---|---|
| `/music play <query>` | Play a song or add it to the queue. Accepts names, URLs, or playlists. |
| `/music skip` | Skip the current track. |
| `/music stop` | Stop playback and clear the queue. |
| `/music pause` | Pause or resume playback. |
| `/music queue [page]` | Show the current queue. |
| `/music nowplaying` | Show what's currently playing with a progress bar. |
| `/music volume <1-200>` | Set the playback volume (persisted per server). |
| `/music loop <off\|track\|queue\|autoplay>` | Set the loop mode. |
| `/music shuffle` | Shuffle the queue. |
| `/music remove <position>` | Remove a track from the queue by position. |
| `/music seek <time>` | Seek to a position (e.g. `1:30` or `90`). |

---

### Image Editing

55 image manipulation commands ported from [esmBot](https://github.com/esmBot/esmBot). All commands accept an optional `image` attachment; if none is provided, the most recent image in the channel is used.

Uses esmBot's native C++ image processing addon (libvips). The TypeScript layer is thin — all pixel work runs in compiled C++.

**Build Requirements (Linux/production):**

```bash
# Ubuntu/Debian
apt install libvips-dev libfontconfig1-dev cmake build-essential

# Then compile the native addon
bun run build:native
```

The `install` script attempts to build automatically. If it fails (Windows dev machine, missing deps), the bot will start but image commands will return an error message prompting you to build the addon.

**Optional features:**
- `WITH_MAGICK=ON` — enables `/magik` (content-aware scale); requires `libmagick++-dev`
- `WITH_ZXING=ON` (default on Linux) — enables `/qr` (QR code generation via native ZXing); requires `libzxing-dev`

#### Filters & Adjustments
| Command | Description |
|---|---|
| `/blur` | Gaussian blur. |
| `/sharpen` | Sharpen edges. |
| `/grayscale` | Convert to grayscale. |
| `/sepia` | Apply a sepia tone. |
| `/invert` | Invert colors. |
| `/hue [degrees]` | Shift hue (default 180°). |
| `/deepfry` | Apply the deep-fried meme effect. |
| `/jpeg` | Re-encode as extremely low-quality JPEG. |
| `/vignette` | Add a dark vignette border. |
| `/pixelate [amount]` | Pixelate the image. |

#### Transforms
| Command | Description |
|---|---|
| `/flip` | Flip vertically. |
| `/flop` | Flip horizontally. |
| `/rotate [90\|180\|270]` | Rotate by 90, 180, or 270 degrees. |
| `/crop` | Crop to a square. |
| `/circle` | Crop to a circle. |
| `/wide` | Stretch horizontally to 2.5× width. |
| `/squish` | Compress vertically to 40% height. |
| `/stretch` | Stretch to 512×512. |
| `/tile` | Tile 2×2. |
| `/wall` | Tile 4×4. |

#### Distortion
| Command | Description |
|---|---|
| `/swirl` | Swirl distortion (polar coordinate math). |
| `/explode` | Outward pixel displacement. |
| `/implode` | Inward pixel displacement. |
| `/magik` | Content-aware scale distortion. |
| `/globe` | Map onto a sphere. |
| `/haah` | Mirror left half. |
| `/woow` | Mirror right half. |
| `/hooh` | Mirror top half. |
| `/waaw` | Mirror bottom half. |

#### Animation
| Command | Description |
|---|---|
| `/spin` | Make the image spin (30 frames). |
| `/bounce` | Make the image bounce (15 frames). |
| `/slide` | Slide in from the left. |
| `/reverse` | Reverse a GIF. |
| `/speed [multiplier]` | Speed up a GIF. |
| `/slow` | Slow down a GIF by 50%. |
| `/freeze` | Freeze a GIF on its last frame. |
| `/unfreeze` | Turn a static image into a ping-pong GIF. |
| `/fade` | Fade to black. |
| `/gif` | Convert a static image into a GIF. |

#### Meme / Text Overlay
| Command | Description |
|---|---|
| `/caption <text>` | Add a white caption bar above the image. |
| `/caption2 <text>` | Add a black caption bar below the image. |
| `/meme [top] [bottom]` | Impact-font top/bottom meme text. |
| `/motivate <title> [subtitle]` | Motivational poster format. |
| `/snapchat <text>` | Semi-transparent Snapchat-style text bar. |
| `/whisper <text>` | Whisper-style caption overlay. |
| `/speechbubble` | Add a speech bubble to the top. |
| `/uncanny <text>` | Split image with text in the middle (uncanny meme). |
| `/uncaption` | Attempt to remove a white caption bar. |
| `/sonic <text>` | Sonic speech bubble meme. |
| `/homebrew <text>` | Wii Homebrew Channel meme. |
| `/spotify <song> <artist>` | Fake Spotify now-playing card. |
| `/redditpost <title>` | Fake Reddit post template. |
| `/gamexplain <text>` | Gamexplain-style thumbnail. |
| `/scott` | Apply the Scott the Woz face-swap effect. |

#### Watermarks
`/watermark`, `/9gag`, `/ifunny`, `/hypercam`, `/kinemaster`, `/bandicam`, `/avs4you`, `/memecenter`, `/deviantart`

#### Flags
`/flag` (rainbow), `/transflag`, `/pirateflag`

---

### Additional Fun & Utility

| Command | Description |
|---|---|
| `/cat` | Random cat picture. |
| `/dog` | Random dog picture. |
| `/bird` | Random bird picture. |
| `/base64 <encode\|decode> <text>` | Encode or decode base64. |
| `/qr <text>` | Generate a QR code. |
| `/snowflake <id>` | Decode a Discord snowflake ID into its timestamp and components. |
| `/emote <emoji>` | Get the full-size image and info for a custom emoji. |

---

## Database

TMCBot uses a local SQLite file (`db.sqlite`) managed automatically on startup. No external database is required.

---

### Web Dashboard

A YAGPDB-style dark-themed web panel for managing all bot settings without slash commands. Starts automatically with the bot when `DISCORD_CLIENT_SECRET` is set.

**Setup:**
1. Go to [Discord Developer Portal](https://discord.com/developers/applications) → your app → **OAuth2 → Redirects**
2. Add `http://localhost:3000/auth/callback` (or `WEB_URL/auth/callback` for production)
3. Add `DISCORD_CLIENT_SECRET`, `WEB_PORT`, and `WEB_URL` to your `.env`
4. Visit `http://localhost:3000` and log in with Discord

**Config pages:** Economy · Leveling & Level Roles · Welcome · Starboard · AutoMod · Logging · Reaction Roles · Giveaways · Topic Rotation · Birthdays · Timezones · Stat Channels

---

## Not Included

The following YAGPDB features were intentionally not ported:

| Feature | Reason |
|---|---|
| Verification (reCAPTCHA) | Requires external reCAPTCHA callback handling |
| Personalizer | Bot avatar/name changes per guild are heavily rate-limited by Discord |
| Premium system | Not relevant for a self-hosted bot |
| Safe Browsing (Google) | Covered by the built-in AntiPhishing module |
