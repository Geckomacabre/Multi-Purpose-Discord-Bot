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

# Optional — enables specific features
TWITCH_CLIENT_ID=        # Twitch live alerts (/twitch)
TWITCH_CLIENT_SECRET=    # Twitch live alerts (/twitch)
YOUTUBE_API_KEY=         # YouTube upload alerts (/youtube)
WEATHER_API_KEY=         # OpenWeatherMap key (/weather)
REPORT_CHANNEL_ID=       # Fallback channel for /report when no modlog is set
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

---

## Database

TMCBot uses a local SQLite file (`db.sqlite`) managed automatically on startup. No external database is required.

---

## Not Included

The following YAGPDB features were intentionally not ported:

| Feature | Reason |
|---|---|
| Web Dashboard | TMCBot uses slash commands for all configuration instead |
| Verification (reCAPTCHA) | Requires a web server to receive reCAPTCHA callbacks |
| Personalizer | Bot avatar/name changes per guild are heavily rate-limited by Discord |
| Premium system | Not relevant for a self-hosted bot |
| Safe Browsing (Google) | Covered by the built-in AntiPhishing module |
