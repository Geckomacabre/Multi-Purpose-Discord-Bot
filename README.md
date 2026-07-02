## Mutlipurpose Bot
Official Discord Bot built by Geckomacabre and Claude.


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
WEATHER_API_KEY=         # OpenWeatherMap key (/weather)
REPORT_CHANNEL_ID=       # Fallback channel for /report when no modlog is set
TENOR_API_KEY=           # GIF search (/gif) — free key at https://developers.google.com/tenor
TMDB_API_KEY=            # Movie/TV guessing games — free key at https://www.themoviedb.org/settings/api
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
| **Counting** | Sequential number counting game per channel. Tracks high scores, punishes wrong numbers with a random count setback, catches edits/deletes, and responds to natural language queries like "what is the count". Configured with `/config counting`. |

---

### Added Features
Everything below was ported from [YAGPDB](https://yagpdb.xyz) and re-implemented in TypeScript.

> **Server configuration** for many features (automod, logging, streaming, welcome, starboard, topic rotation, timezones, free-game tracker, stat channels, and counting) is grouped under a single **`/config`** command with subcommand groups — e.g. `/config automod add`, `/config logs channel`. This keeps the global slash-command count under Discord's 100-command limit. `/config` requires **Manage Server**.

#### Moderation
Each moderation action is its own top-level command. Action commands are hidden from members who lack the matching permission (via default member permissions).

| Command | Description |
|---|---|
| `/ban <user>` | Ban a member. Supports temporary bans (e.g. `1d`, `12h`) that auto-expire. |
| `/unban <user_id>` | Unban a user by ID. |
| `/kick <user>` | Kick a member. |
| `/timeout <user> <duration>` | Timeout a member (Discord native, up to 28 days). |
| `/untimeout <user>` | Remove a member's active timeout. |
| `/warn <user> <reason>` | Warn a member. Warnings are stored and DM'd to the user. |
| `/purge <amount>` | Bulk-delete up to 200 messages. Filter by user, keyword, bots, attachments, or embeds. |
| `/report <user> <reason>` | Report a member to staff. Sends to the modlog channel. Available to everyone. |
| `/case <number>` | View the details of a mod case by number. |
| `/reason <case> <reason>` | Edit the reason for an existing mod case. |
| `/warnings list <user>` | View all warnings for a user. |
| `/warnings delete <id>` | Delete a specific warning by ID. |
| `/warnings clear <user>` | Clear all warnings for a user. |
| `/modconfig modlog [channel]` | Set the channel where mod actions are logged. |
| `/modconfig dm <enabled>` | Toggle whether punished users are DM'd. |
| `/modconfig view` | View current moderation settings. |

#### AutoMod
| Command | Description |
|---|---|
| `/config automod add` | Create an automod rule. Trigger types: `spam`, `caps`, `links`, `words`, `mentions`, `regex`. Actions: `delete`, `warn`, `timeout`, `kick`, `ban`. |
| `/config automod list` | List all rules with their ID, status, and config. |
| `/config automod delete` | Delete a rule by ID. |
| `/config automod toggle` | Enable or disable a rule. |

#### Logging
| Command | Description |
|---|---|
| `/config logs channel` | Set the channel for server logs. |
| `/config logs toggle` | Enable or disable logging entirely. |
| `/config logs events` | Choose which events to log: joins, leaves, edits, deletes, bans, nicknames, roles. |
| `/config logs ignore` | Toggle ignoring a channel from message logs. |
| `/config logs view` | View current log settings. |

Logged events: member join/leave, message edit/delete, bans/unbans, nickname changes, role changes.

#### Role Management

User commands:

| Command | Description |
|---|---|
| `/roles self <name>` | Toggle a self-assignable role on yourself. |

Admin configuration is under `/rolesconfig` (Manage Roles required):

| Command | Description |
|---|---|
| `/rolesconfig bulk <action> <role> <filter>` | Assign or remove a role from many members at once (all, has role, missing role, bots, humans). |
| `/rolesconfig self-assign add <name> <role>` | Register a self-assignable role with a name and optional group. |
| `/rolesconfig self-assign remove <id>` | Remove a role command by ID. |
| `/rolesconfig self-assign list` | List all self-assignable roles. |
| `/rolesconfig auto add <role>` | Assign a role automatically to new members (with optional delay). |
| `/rolesconfig auto remove <id>` | Remove an autorole by ID. |
| `/rolesconfig auto list` | List all autoroles. |
| `/rolesconfig voice add <channel> <role>` | Assign a role when members join a specific voice channel. |
| `/rolesconfig voice remove <id>` | Remove a voice role binding. |
| `/rolesconfig voice list` | List all voice role bindings. |
| `/rolesconfig reaction add <message_link> <emoji> <role>` | Bind an emoji reaction on a message to a role. |
| `/rolesconfig reaction remove <id>` | Remove a reaction role binding by ID. |
| `/rolesconfig reaction clear <message_link>` | Remove all reaction roles from a message. |
| `/rolesconfig reaction list` | List all active reaction role bindings. |

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
| `/ticket close` | Close and archive the current ticket channel. |
| `/ticket delete` | Permanently delete the ticket channel. |
| `/ticket add <user>` | Add a user to the current ticket. |
| `/ticket remove <user>` | Remove a user from the current ticket. |
| `/ticket panel [channel]` | Post a panel with an **Open Ticket** button in a channel. |
| `/ticket redirect [channel]` | Post a "wrong channel" redirect message pointing users to the ticket channel. |
| `/ticket ratings [user]` | View support ratings for a staff member or the whole server. |
| `/ticket config set` | Configure ticket category, log channel, and support role. |
| `/ticket config view` | View current ticket settings. |

#### Reminders
| Command | Description |
|---|---|
| `/reminder set` | Set a reminder (e.g. `10m`, `2h`, `1d`). Fires in the channel where it was set. |
| `/reminder list` | List your active reminders. |
| `/reminder delete` | Delete a reminder by ID. |

#### Custom Commands
Custom commands are managed entirely through the [Web Dashboard](#web-dashboard) — there are no `/cc` slash commands. Supported trigger types: `command`, `startswith`, `contains`, `exact`, `regex`. Responses support `{user}`, `{username}`, `{server}`, `{channel}`, `{membercount}`.

#### Streaming Announcements
Powered by Discord presence detection. Requires the **Presence Intent**.

| Command | Description |
|---|---|
| `/config streaming set` | Configure the announcement channel, a role to assign while streaming, and a custom message template (`{username}`, `{game}`, `{url}`). |
| `/config streaming view` | View current streaming settings. |

#### Stream VC — Request to Join
A locked voice channel (e.g. a streamer's private VC). Setting the channel **auto-locks it** (denies `@everyone` Connect). Only members with the configured **required role** (e.g. Self Promo) can request. Each request posts a notice in the **request channel** with a **Review** button; when an approver clicks it, the **Approve/Reject panel opens ephemerally** (only that approver sees it). Approving **unlocks the channel for that member** (grants `Connect`), and the notice updates to show the outcome.

| Command | Description |
|---|---|
| `/streamvc request [reason]` | Ask the approvers to let you in (requires the configured role). |
| `/streamvc config set [vc] [request_channel] [required_role]` | Set the voice channel (auto-locked), the channel where requests are posted, and the role needed to request (Manage Server). |
| `/streamvc config panel [channel]` | Post a persistent **Request to Join** button panel members can click (Manage Server). |
| `/streamvc config add-approver <user/role>` | Add a user or role that can review and approve/reject requests (Manage Server). |
| `/streamvc config remove-approver <user/role>` | Remove an approver (Manage Server). |
| `/streamvc config view` | Show the current stream VC settings. |

> The bot needs **Manage Roles/Channels** on the voice channel to lock it and grant access. Make the request channel visible only to approvers so requests stay private. Anyone with **Manage Channels** can always approve, in addition to the configured approvers.

#### Server Stats
| Command | Description |
|---|---|
| `/config serverstats view [hours]` | Show server activity for the last N hours (default 24, max 168). Displays total messages, joins, leaves, and current member count. |
| `/config serverstats channels add <type>` | Create an auto-updating stat channel. Types: `members`, `humans`, `bots`, `channels`, `roles`. |
| `/config serverstats channels remove <id>` | Delete a stat channel by ID. |
| `/config serverstats channels list` | List all stat channels. |

#### AntiPhishing
No configuration needed — active automatically. Detects and deletes messages containing known phishing domains using the [sinking.yachts](https://phish.sinking.yachts) API. Domain list refreshes every 30 minutes.

#### Utility
| Command | Description |
|---|---|
| `/ping` | Check bot and API latency. |
| `/avatar [user] [server]` | Get a user's full-size avatar. Use `server:true` to show their server-specific avatar. |
| `/banner [user] [server]` | Get a user's profile banner. Use `server:true` to prefer the server-specific banner. |
| `/userinfo [user]` | Display account creation date, join date, roles, and nickname. |
| `/serverinfo` | Display server stats: owner, member count, boost level, verification level. |
| `/roll [dice]` | Roll dice (e.g. `2d6`, `1d20+5`). |
| `/listroles` | List all roles in the server with member counts. |
| `/viewperms [user] [channel]` | View a user's permissions globally or in a specific channel. |
| `/weather <location>` | Get current weather for a location. Requires `WEATHER_API_KEY`. |
| `/define <word>` | Look up a word's dictionary definition, part of speech, and example. |

#### Random

| Command | Description |
|---|---|
| `/8ball <question>` | Ask the magic 8-ball a yes/no question. |
| `/wouldyourather` | Get a would-you-rather question. |

#### Guessing Games

Channel-based movie and TV show guessing games.

| Command | Description |
|---|---|
| `/hint` | Reveal the next clue for the active guessing game (5 hints per round: year, genre, cast, screenshot, synopsis) |
| `/voteskip` | Vote to skip the current round (2 votes needed) |
| `/mediaguess setup <type> <channel>` | *(Admin)* Set up the movie or TV show game channel and start the first round |
| `/mediaguess stop` | *(Admin)* Stop the game in this channel and remove its config |
| `/mediaguess skip` | *(Admin)* Force-skip the current round without a vote |
| `/mediaguess info` | *(Admin)* View game configuration and active round status |

Powered by the **TMDB API** — add `TMDB_API_KEY=your_key` to `.env` (free key at [themoviedb.org](https://www.themoviedb.org/settings/api)). No local database needed; titles and metadata are fetched live from thousands of popular movies and shows (1975 to present). Scene stills are sourced from **MovieStillsDB** (genuine publicity/production stills with no title overlay), falling back to TMDB backdrops when a title isn't available there. Repeats are suppressed per channel for 6 hours.

#### Fun

| Command | Description |
|---|---|
| `/gif <query>` | Search for a GIF using Tenor. Requires `TENOR_API_KEY` in `.env`. |
| `/trivia` | Answer a multiple-choice trivia question with button responses. Powered by OpenTDB (no API key needed). |
| `/freegames now` | Show games that are free right now on Epic Games Store, Steam, and GOG. |
| `/freegames upcoming` | Show upcoming free games on Epic Games Store. |

---

### Economy & Leveling
These features were added natively to TMCBot (not ported from YAGPDB).

#### Leveling
XP is awarded per message sent (15–25 XP by default, 60-second cooldown per user). Level-up announcements are posted automatically. Leveling up also awards coins as a bonus reward.

Level formula (MEE6-style): `5n² + 50n + 100` XP required per level.
Coin reward on level-up: `level × 50` coins.

User commands:

| Command | Description |
|---|---|
| `/rank [user]` | View a user's rank card image showing level, XP bar, and server rank. |
| `/level rank [user]` | Text-based rank showing level, XP progress, and message count. |
| `/level leaderboard [limit]` | Show the top users by XP and level. |

Admin configuration is under `/levelconfig` (Manage Server required):

| Command | Description |
|---|---|
| `/levelconfig toggle <enabled>` | Enable or disable XP gain for the server. |
| `/levelconfig channel [channel]` | Set the channel for level-up announcements. |
| `/levelconfig xp [min] [max] [cooldown]` | Set XP per message range and cooldown seconds. |
| `/levelconfig message <text>` | Customize the level-up announcement. Supports `{user}`, `{username}`, `{level}`. |
| `/levelconfig announce <enabled>` | Enable or disable level-up announcement messages. |
| `/levelconfig background [url]` | Set a custom background image URL for rank cards (omit to reset to default). |
| `/levelconfig view` | View current leveling settings. |
| `/levelconfig roles add <level> <role>` | Assign a role automatically when users reach a specific level. |
| `/levelconfig roles remove <id>` | Remove a level role binding by ID. |
| `/levelconfig roles list` | List all level role bindings. |

#### Economy
Each server has its own virtual currency. Earn coins through daily rewards, work, leveling up, and gambling.

All economy commands are under `/economy`.

| Command | Description |
|---|---|
| `/balance [user]` | Check your or another user's coin balance and total earned. |
| `/daily` | Claim a daily coin reward (20-hour cooldown). |
| `/weekly` | Claim a weekly coin reward (7-day cooldown). |
| `/monthly` | Claim a monthly coin reward (30-day cooldown). |
| `/yearly` | Claim a yearly coin reward (365-day cooldown). |
| `/work` | Work to earn coins with a random job flavor text (1-hour cooldown). |
| `/beg` | Beg for a small coin reward (15-minute cooldown, 10–100 coins). |
| `/pay <user> <amount>` | Transfer coins to another user. |
| `/economy leaderboard [limit]` | Show the richest users in the server. |
| `/flip <bet>` | Bet on a coin flip — win doubles your bet (50/50). Lucky Charm boosts wins 1.5×. |
| `/highroll <bet>` | Roll 1–100 against the bot — higher roll wins; ties refund your bet. |
| `/slots <bet>` | Spin the slot machine — match 3 symbols to win. Payouts: 🍒×3=1.5× \| 🍋×3=2× \| 🔔×3=3× \| 💎×3=5× \| 7️⃣×3=10×. |
| `/scratch <bet>` | Buy a scratch card — reveal 9 symbols, match 3 to win (pure RNG, up to 10×). |
| `/roulette <bet> <type>` | Bet on Red/Black, Even/Odd, Low/High (2×), or a single number 1–36 (35×). |
| `/crash <bet>` | Ride a stock-style multiplier that swings up and down — cash out at any value above 1×, but it can crash to 0 and wipe your bet. |
| `/blackjack <bet>` | Classic blackjack — Hit, Stand, or Double Down. Blackjack pays 1.5×. |
| `/poker <bet>` | Jacks or Better video poker. Royal Flush = 250×. |
| `/rob <user>` | Attempt to rob another user (50/50). On success a **random amount** — anywhere from 1 up to their entire balance — is stolen. 30-min cooldown on fail, 1-hour on success. |
| `/protection` | Hire mob protection for 5,000 coins — blocks rob attempts for 24 hours. |
| `/shop browse` | View all shop items — boosts, one-shots, and instants. |
| `/shop buy <item> [cooldown]` | Buy a shop item (the `cooldown` option is only for Time Skip). |
| `/games leaderboard <game>` | Show the top players for a specific game (flip, highroll, slots, roulette, crash, blackjack, poker, scratch, movie guesser, TV guesser). |

**Shop items:**

| Item | Effect | Price |
|---|---|---|
| 🔮 XP Surge | 2× XP from all sources for 1 hour | 25,000 |
| 🍀 Lucky Charm | 1.5× gambling winnings for 30 minutes | 30,000 |
| ⚡ Hint Rush | No hint cooldown in the guessing games for 15 minutes | 75,000 |
| 💼 Overtime Permit | Half `/work` cooldown (30 min) for 4 hours | 20,000 |
| 🧲 Coin Magnet | 1.5× coins from `/work`, `/daily`, `/beg` for 24 hours | 40,000 |
| 🎟️ Loaded Dice | Double your chance in the next daily lottery draw | 15,000 |
| 🥊 Goon Squad | One-shot: your next failed `/rob` has no cooldown (keeps 7 days) | 25,000 |
| 🛡️ Gambling Insurance | One-shot: your next lost bet is 50% refunded (keeps 7 days) | 30,000 |
| 🔁 Second Chance | One-shot: a `/crash` bust below 1.5x refunds your bet (keeps 7 days) | 40,000 |
| ⏩ Time Skip | Instant: reset your `/daily`, `/work`, or `/beg` cooldown | 35,000 |
| 📦 Mystery Box | Instant: 60% coins (2k–8k), 25% a random boost, 10% nothing, 5% 50k jackpot | 10,000 |

#### Daily Lottery
Once per day, one random server member wins **50,000 coins** automatically. Any member with at least 1 XP (i.e. anyone who has ever chatted) is entered. Buying 🎟️ **Loaded Dice** from the shop doubles your chance for the next draw. Winners are announced in the configured lottery channel. Enable it with `/economyconfig lottery <channel>`.

#### Free Game Tracker
Polls Epic Games Store, Steam, and GOG every hour for free game promotions. Posts to a configured channel with a claim button, the original price, and how long the freebie lasts. Deduplicates per server so no game is posted twice.

| Command | Description |
|---|---|
| `/config freegames setup <channel>` | Enable the tracker and set the announcement channel. Optionally set a role to ping. |
| `/config freegames platforms` | Toggle which platforms to track (Epic, Steam, GOG). |
| `/config freegames ping [role]` | Set or clear the role pinged for new free game alerts. |
| `/config freegames disable` | Disable the tracker for this server. |
| `/config freegames view` | View current tracker settings. |
| `/config freegames check` | Manually trigger a check and post any new free games immediately. |

Supported platforms:
- **Epic Games Store** — weekly free games via their official promotions API
- **Steam** — featured 100%-off specials (free weekends, permanent giveaways)
- **GOG** — discounted-to-free games from their catalog

#### Economy Config (Manage Server required)
All admin economy commands are under `/economyconfig`.

| Command | Description |
|---|---|
| `/economyconfig currency <name> <symbol>` | Set the currency name and symbol for this server. |
| `/economyconfig starting <amount>` | Set how many coins new users start with. |
| `/economyconfig daily <min> <max>` | Set the daily reward min/max range. |
| `/economyconfig weekly <min> <max>` | Set the weekly reward min/max range. |
| `/economyconfig monthly <min> <max>` | Set the monthly reward min/max range. |
| `/economyconfig yearly <min> <max>` | Set the yearly reward min/max range. |
| `/economyconfig work <min> <max>` | Set the work reward min/max range. |
| `/economyconfig lottery [channel]` | Enable daily lottery with an announcement channel, or disable by omitting channel. |
| `/economyconfig view` | View current economy settings. |

---

### Welcome System
Sends a customizable message to a channel (and optionally a DM) whenever a new member joins.

Supports template variables: `{user}`, `{username}`, `{server}`, `{membercount}`, `{#membercount}`.

| Command | Description |
|---|---|
| `/config welcome channel <channel>` | Set the channel where welcome messages are posted. |
| `/config welcome message <text>` | Set the welcome message template. |
| `/config welcome dm <text>` | Set a DM sent to new members (`none` to disable). |
| `/config welcome toggle` | Enable or disable the welcome system. |
| `/config welcome test` | Preview the welcome message as if you just joined. |
| `/config welcome view` | View current welcome settings. |

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
| `/birthday config channel <channel>` | Set the birthday announcement channel. |
| `/birthday config toggle` | Enable or disable birthday announcements. |
| `/birthday config view` | View current birthday settings. |

---

### Timezone Tracker
Members register their IANA timezone so others can see what time it is for them.

| Command | Description |
|---|---|
| `/config timezone set <timezone>` | Set your timezone (e.g. `America/New_York`, `Europe/London`). |
| `/config timezone view [user]` | See the current local time for a user. |
| `/config timezone list` | List timezones of all members who have set one. |
| `/config timezone remove` | Remove your timezone. |

---

### Starboard
Messages that receive enough of a configured reaction are automatically reposted to a dedicated starboard channel. The star count updates live.

| Command | Description |
|---|---|
| `/config starboard channel <channel>` | Set the starboard channel. |
| `/config starboard threshold <count>` | Set the minimum reaction count needed (default: 3). |
| `/config starboard emoji <emoji>` | Set which reaction to watch (default: ⭐). |
| `/config starboard toggle` | Enable or disable the starboard. |
| `/config starboard view` | View current starboard settings. |

---

### Topic Rotation
Automatically posts a discussion prompt to a channel on a configurable schedule. Topics cycle sequentially or randomly.

| Command | Description |
|---|---|
| `/config topics setup <channel> <interval> [mode]` | Set up rotation for a channel. Interval examples: `6h`, `1d`, `12h`. Mode: `sequential` or `random`. |
| `/config topics add <channel> <topic>` | Add a discussion topic to a channel's queue. |
| `/config topics delete <id>` | Remove a topic by ID. |
| `/config topics list <channel>` | List all topics and current settings for a channel. |
| `/config topics post <channel>` | Manually post the next topic immediately. |
| `/config topics remove <channel>` | Stop topic rotation for a channel. |

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
Attach a role to a reaction emoji on any message. Members gain the role by reacting and lose it by removing the reaction. See [Role Management](#role-management) — use `/roles reaction` commands.

---

### Translation
Translate text between 16 languages instantly. No API key required.

| Command | Description |
|---|---|
| `/translate <text> [to] [from]` | Translate text. Target language defaults to English. Source is auto-detected if not specified. Powered by MyMemory. |

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
| `/music host <user>` | Transfer DJ privileges to another user. |

---

### Image Editing

57 image manipulation effects ported from [esmBot](https://github.com/esmBot/esmBot), all under a single **`/image`** command. Pick an effect with the autocompleting `effect` option (e.g. `/image effect:blur`, `/image effect:deepfry`). Provide an `image` attachment or a `url`; if neither is given, the most recent image in the channel is used. Effects needing extra input use the `text`, `number`, `font`, or `choice` options (the autocomplete hints which).

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
- `WITH_MAGICK=ON` — enables the `magik` effect (content-aware scale); requires `libmagick++-dev`
- `WITH_ZXING=ON` (default on Linux) — enables native ZXing QR code support; requires `libzxing-dev`

All effects below are values for the `effect` option, e.g. `/image effect:blur`. `[number]` effects take the `number` option; `<text>` effects take `text`; `flag`/`watermark`/`uncanny` take `choice`.

#### Color & Filter Effects
`blur` `sharpen` `grayscale` `sepia` `invert` `hue [number]` `deepfry` `jpeg [number]` `vignette` `pixelate [number]`

#### Geometric Transforms
`flip` `flop` `rotate [number]` `crop` `circle` `wide` `squish` `stretch` `tile` `wall`

#### Mirror & Reflection
`haah` `hooh` `waaw` `woow`

#### Distortion Effects
`swirl` `explode` `implode` `magik` `globe` `togif`

#### Animation Effects
`spin` `bounce` `slide` `fade` `reverse` `speed` `slow` `freeze` `unfreeze`

#### Text Overlays
`caption <text>` `caption2 <text>` `meme <text: "top, bottom">` `motivate <text: "top, bottom">` `snapchat <text>` `whisper <text>` `uncanny <text: "left, right">` `uncaption`

#### Meme Generators
`sonic <text>` `homebrew <text>` `spotify <text: song>` `reddit <text: title>` `gamexplain` `scott`

#### Overlays
`flag` — overlay a flag (`choice`: rainbow, trans, pirate, checkered)
`watermark` — brand watermark (`choice`: 9gag, bandicam, deviantart, hypercam, ifunny, kinemaster, avs4you, memecenter, powerdirector, shutterstock)

---

### Additional Utility

| Command | Description |
|---|---|
| `/base64 <encode\|decode> <text>` | Encode or decode base64. |
| `/status set <message> [type]` | Set the bot's presence/status message (bot owner only). Types: custom, playing, watching, listening, competing. |
| `/status clear` | Clear the bot's status message (bot owner only). |
| `/status view` | View the current bot status (bot owner only). |

---

### Context Menus

Right-click (or long-press) a message → **Apps**:

| Menu | Description |
|---|---|
| **Make it a Quote** | Turn the selected message into a stylized black-and-white quote card (grayscale avatar, diagonal top-right fade, M PLUS font). Resolves mentions and renders `**bold**`/`*italic*`. Includes a "Remove my Quote" button. |
| **Select Image** | Pick an image from the selected message to use with the next `/image` command — handy when the target image isn't the most recent one in the channel. |

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
4. Ensure port 3000 is exposed (already set in `docker-compose.yaml`)
5. Visit `http://localhost:3000` and log in with Discord

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
