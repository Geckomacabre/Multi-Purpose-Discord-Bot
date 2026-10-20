<div align="center">

# 🤖 TMCBot

**An all-in-one Discord bot for moderation, economy, leveling, games, and server management.**

Built by **Geckomacabre** and Claude · Home of [CTIServers.org](https://ctiservers.org)

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6.svg?style=for-the-badge&logo=TypeScript&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-000?style=for-the-badge&logo=bun&logoColor=white)
![discord.js](https://img.shields.io/badge/discord.js-5865F2.svg?style=for-the-badge&logo=discord&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57.svg?style=for-the-badge&logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/License-GPL--3.0-blue.svg?style=for-the-badge)

[**Quick Start**](#-quick-start) · [**Features**](#-features) · [**Web Dashboard**](#-web-dashboard) · [**Database**](#️-database)

</div>

---

## ✨ Features

| | Area | What's inside |
|:-:|---|---|
| 🛡️ | [**Moderation & Safety**](#️-moderation--safety) | Mod commands and cases · raid, spam and phishing protection · automod · detailed logs · ✅ verification gate |
| ⚙️ | [**Server Setup**](#️-server-setup) | Welcome messages · self, auto, voice and reaction roles · join-to-create voice · tickets · stat channels · streaming · starboard · sticky messages · poll archive · topics · birthdays · timezones · free games |
| 💰 | [**Economy & Leveling**](#-economy--leveling) | MEE6-style XP and rank cards · coins and drought bonuses · 10 casino games · progressive jackpot · daily lottery · shop · reputation |
| 🎮 | [**Games & Fun**](#-games--fun) | Counting · movie, TV, video game and song guessing · giveaways · trivia, GIFs and more |
| 🧰 | [**Utility**](#-utility) | User and server info · reminders · tags · translate · custom commands |
| 🖼️ | [**Image Editing**](#️-image-editing) | 57 effects powered by native C++ (libvips) |
| 🎵 | [**Music**](#-music-separate-bot) | A separate Lavalink-powered music bot with a live control panel |
| 🌐 | [**Web Dashboard**](#-web-dashboard) | Manage settings in your browser instead of slash commands |

> [!NOTE]
> Many server settings live under one **`/config`** command (for example `/config automod add` or `/config logs channel`), which keeps the bot under Discord's 100-command limit. `/config` requires **Manage Server**.

---

## 🚀 Quick Start

**You'll need**

- [Bun](https://bun.sh)
- A Discord application and bot token from the [Developer Portal](https://discord.com/developers/applications)
- Both **privileged intents** turned on under **Developer Portal → Bot**: *Server Members Intent* and *Presence Intent*

**1. Configure.** Create a `.env` file in the project root:

```env
# ── Required ─────────────────────────────────────────────
TOKEN=your_discord_bot_token
CLIENT_ID=your_application_id
GUILD_ID=your_server_id
NODE_ENV=development            # or production

# ── Web dashboard (needed only to enable it) ─────────────
DISCORD_CLIENT_SECRET=          # OAuth2 client secret from the Developer Portal
WEB_PORT=3000                   # Port the dashboard listens on
WEB_URL=http://localhost:3000   # Public URL (used for the OAuth redirect)

# ── Optional: each one unlocks a feature ─────────────────
WEATHER_API_KEY=                # /weather (OpenWeatherMap)
REPORT_CHANNEL_ID=              # Fallback channel for /report when no modlog is set
TENOR_API_KEY=                  # /gif (free: https://developers.google.com/tenor)
TMDB_API_KEY=                   # Movie/TV guessing (free: https://www.themoviedb.org/settings/api)
RAWG_API_KEY=                   # Video game guessing (free: https://rawg.io/apidocs)
RANGE_API_TOKEN=                # Lets ctiservers.org's Range spend coins (see The Range Bridge)
# Song guessing uses Deezer's public API, so it needs no key.
```

**2. Run.**

```bash
bun install
bun run dev                 # Development: guild commands, hot reload
bun run start:production    # Production: global commands
```

> [!IMPORTANT]
> On the very first run, add `CREATE_DB=1` to create the database. See [Database](#️-database) for why.

Slash commands re-register every time the bot starts: to `GUILD_ID` only in development, and globally in production.

---

## 🛡️ Moderation & Safety

### 🔨 Moderation

Each action is its own command, and members without the matching permission don't see it.

<details>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/ban <user>` | Ban a member. Supports temporary bans (`1d`, `12h`) that expire automatically. |
| `/unban <user_id>` | Unban a user by ID. |
| `/kick <user>` | Kick a member. |
| `/timeout <user> <duration>` | Time out a member using Discord's native timeout (up to 28 days). |
| `/untimeout <user>` | Remove a member's active timeout. |
| `/warn <user> <reason>` | Warn a member. Warnings are stored and DM'd to the user. |
| `/purge <amount>` | Delete up to 1,000 messages of any age (pinned messages are kept). Filter by user, keyword, bots, attachments, or embeds. Messages older than 14 days are deleted one at a time (about 1 per second), with a progress counter. |
| `/report <user> <reason>` | Report a member to staff via the modlog channel. Available to everyone. |
| `/case <number>` | View a mod case. |
| `/reason <case> <reason>` | Edit the reason on an existing mod case. |
| `/warnings list <user>` | View all of a user's warnings. |
| `/warnings delete <id>` | Delete one warning by ID. |
| `/warnings clear <user>` | Clear all of a user's warnings. |
| `/modconfig modlog [channel]` | Set the channel where mod actions are logged. |
| `/modconfig dm <enabled>` | Choose whether punished users get a DM. |
| `/modconfig view` | View moderation settings. |

</details>

### 🚨 Raid Detection

Always on. If **5 or more accounts under 3 days old** join within 60 seconds, the bot posts a **🚨 Possible Raid Detected** alert to your modlog (or member-log) channel.

- The alert lists every account with a clickable mention and its age, so you can go straight to `/ban`.
- Alerts are throttled to one every 5 minutes per server, so an ongoing raid doesn't flood the channel.

<details>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/raidguard recent [minutes] [max_age_days]` | List recently joined accounts, newest first. Reads live member data, so it works right after a restart. Defaults to the last 5 minutes with no age filter. |

</details>

### 🧹 Spam Detection

Always on, with no setup. Offenders get a **24-hour timeout**, and their messages from the last hour are purged from every channel.

| Trigger | What it catches |
|---|---|
| **Repeated messages** | The same message 4+ times in 10 seconds |
| **Flood rate** | 8+ messages in 6 seconds, whatever the content. Quick, distinct chatting won't trip it. |
| **Cross-channel images** | Images or videos posted in 3+ channels within 30 seconds |
| **Cross-channel messages/links** | The same message, *or the same link*, posted in 3+ channels within 45 seconds |
| **Command spam** | 6+ slash commands in 8 seconds |

Every trigger posts a full report (the reason, the action taken, and every purged message) to your member/message log channels and the modlog.

> [!IMPORTANT]
> Members with **Manage Messages** skip the rate, duplicate, and image checks, but **not** the cross-channel message/link check. Nothing legitimate posts identical content across several channels, so it also catches compromised staff accounts.

### 🎣 AntiPhishing

On by default. Members with **Manage Messages** can still post links freely. It works in three layers:

1. **Known phishing domains** from the [sinking.yachts](https://phish.sinking.yachts) blocklist, refreshed every 30 minutes.
2. **Lookalike domains** within 2 characters of `discord.com`, `discordapp.com`, `steamcommunity.com`, `steampowered.com`, or `epicgames.com` (like `discocd.gift`), which catches new scams before they reach the blocklist.
3. **Invite links** (`discord.gg/*` and `discord.com/invite/*`), the most common raid-spam payload.

Each removal posts an alert to the modlog with the domain or invite code, the user, and the channel.

<details>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/config antiphishing toggle <enabled>` | Turn antiphishing on or off. |
| `/config antiphishing invites <enabled>` | Toggle invite-link removal. |
| `/config antiphishing lookalike <enabled>` | Toggle lookalike-domain detection. |
| `/config antiphishing view` | View antiphishing settings. |

</details>

### 🤖 AutoMod

Custom rules, each with a trigger and an action.

- **Triggers:** `spam` · `caps` · `links` · `words` · `mentions` · `regex`
- **Actions:** `delete` · `warn` · `timeout` · `kick` · `ban`

<details>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/config automod add` | Create a rule. |
| `/config automod list` | List rules with their ID, status, and settings. |
| `/config automod delete` | Delete a rule by ID. |
| `/config automod toggle` | Turn a rule on or off. |

</details>

### 📜 Logging

Logs member joins and leaves, message edits and deletes, bans and unbans, nickname and role changes, and *optionally* every slash command used (who ran it, the options, and the channel).

- **Deletes** show *who* deleted the message and *why*, from the audit log. No audit-log entry means the author deleted it themselves.
- **Bulk deletes** from `/purge` or a spam purge get their own entry. Messages older than 14 days that `/purge` or the poll archive delete one at a time aren't logged individually.
- **Leaves** show how long the member was in the server and the roles they held.
- **Kicks** show as **Member Kicked**, with who kicked them and the reason.
- Each category (member, message, voice, server, command) can have its own channel, set in the [Web Dashboard](#-web-dashboard). `/config logs channel` sets the fallback.

<details>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/config logs channel` | Set the fallback log channel. |
| `/config logs toggle` | Turn logging on or off. |
| `/config logs events` | Choose which events to log: joins, leaves, edits, deletes, bans, nicknames, roles, commands. |
| `/config logs ignore` | Toggle ignoring a channel in message logs. |
| `/config logs view` | View log settings. |

</details>

### ✅ Verification Gate

New members verify by reacting ✅ on your rules post, or by clicking a **Verify** button. Verifying gives them the member role (and can remove an "unverified" role). Removing the ✅ takes it away again.

**Server lock.** The gate can also hide every public channel from `@everyone` and show it only to the member role, so new members see just the rules channel until they verify. In the rules channel, everyone can read but can't chat or add new emojis.

- **Existing members are grandfathered in.** The first lock gives everyone already in the server the member role, so nobody loses access. Pick `existing_members: Must re-verify` to take it from anyone who hasn't reacted ✅ instead. Re-running a lock never grandfathers again.
- **Staff are never locked out.** Anyone with a role above the bot's highest role bypasses the lock, staff/private channels are left exactly as they are, and every bot gets the member role.
- **New channels are locked automatically.** Channels in Server Onboarding stay public, because Discord requires it.

<details>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/verify rules <channel> <member_role> [message_id] [unverified_role] [lock] [existing_members]` | Members react ✅ on the rules post (yours, or one the bot posts) to get the role. Locks the server unless `lock:false`. |
| `/verify setup <channel> <member_role> [unverified_role] [title] [description]` | Post a verify button instead. |
| `/verify lock [existing_members]` | Hide all public channels until members verify. |
| `/verify unlock` | Restore every channel the lock changed. |
| `/verify remove` | Turn verification off: unlocks channels and clears the ✅ reactions. Members keep their role. |
| `/verify config` | Show the current verify settings. |

</details>

> [!IMPORTANT]
> The bot's role must be **above** the member role. If you move roles above or below the bot later, run `/verify lock` again to update the lock.

---

## ⚙️ Server Setup

### 👋 Welcome Messages

Greets new members in a channel, and can DM them too. Templates support `{user}`, `{username}`, `{server}`, `{membercount}`, and `{#membercount}`.

<details>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/config welcome channel <channel>` | Set the welcome channel. |
| `/config welcome message <text>` | Set the welcome message. |
| `/config welcome dm <text>` | Set a DM for new members (`none` turns it off). |
| `/config welcome toggle` | Turn welcome messages on or off. |
| `/config welcome test` | Preview the message as if you had just joined. |
| `/config welcome view` | View welcome settings. |

</details>

### 🎭 Roles

| Type | How members get it |
|---|---|
| **Self-assign** | `/roles self <name>` toggles it on themselves |
| **Autorole** | Automatically on join, with an optional delay |
| **Voice role** | While they're in a specific voice channel |
| **Reaction role** | Reacting with an emoji on a message (removing the reaction takes it away) |
| **Bulk** | Staff add or remove a role for many members at once |

Admin commands need **Manage Roles**, and the bot can only give roles **below its own highest role**. `/rolesconfig reaction list` flags any reaction role it can't give.

<details>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/roles self <name>` | Toggle a self-assignable role on yourself. |
| `/rolesconfig bulk <action> <role> <filter>` | Add or remove a role for many members at once (all, has role, missing role, bots, humans). |
| `/rolesconfig self-assign add <name> <role>` | Register a self-assignable role, with an optional group. |
| `/rolesconfig self-assign remove <id>` | Remove a self-assignable role. |
| `/rolesconfig self-assign list` | List self-assignable roles. |
| `/rolesconfig auto add <role> [delay] [target]` | Give new members a role automatically, with an optional delay. The target can be everyone, humans, or bots. |
| `/rolesconfig auto remove <id>` | Remove an autorole. |
| `/rolesconfig auto list` | List autoroles. |
| `/rolesconfig voice add <channel> <role>` | Give a role while a member is in a voice channel. |
| `/rolesconfig voice remove <id>` | Remove a voice role binding. |
| `/rolesconfig voice list` | List voice role bindings. |
| `/rolesconfig reaction add <message_link> <emoji> <role>` | Link a reaction on a message to a role. |
| `/rolesconfig reaction remove <id>` | Remove a reaction role. |
| `/rolesconfig reaction clear <message_link>` | Remove every reaction role from a message. |
| `/rolesconfig reaction list` | List reaction roles. |

</details>

### 🔊 Join-to-Create Voice

Joining the hub channel (like **➕ Join to Create**) creates a voice channel named after that member and moves them into it.

- **Owners** can rename it, set a user limit or bitrate, and disconnect people. They choose who can join with `lock`, `unlock`, `permit` and `reject`.
- **Staff can always join.** Owners can't edit the channel's permissions, so they can never shut out admins or mods (Administrator, Manage Server/Channels, Moderate/Kick/Ban/Move Members, or a role above the bot).
- **One channel per member.** Joining the hub again takes them back to theirs.
- **Empty channels are deleted** as soon as the last person leaves. If the owner leaves first, anyone still inside can `claim` it.

<details>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/tempvoice setup [channel] [category] [name]` | *(Manage Server)* Set the hub. Leave `channel` empty and the bot makes one. New channels go in `category`, or the hub's category. `name` defaults to `{user}`. |
| `/tempvoice disable` | *(Manage Server)* Stop creating channels. Existing ones are deleted as they empty. |
| `/tempvoice lock` | Only staff and people you permit can join your channel. People already in it stay. |
| `/tempvoice unlock` | Let anyone join again. |
| `/tempvoice permit <user>` | Let someone join, even while locked. |
| `/tempvoice reject <user>` | Block someone and disconnect them (not staff). |
| `/tempvoice claim` | Take over the channel you're in when its owner has left. |

</details>

> [!NOTE]
> The bot needs **Manage Channels**, **Manage Roles** and **Move Members**, and can only give owners permissions it has itself.

### 🎫 Tickets

Members open private support channels with a button or a command. Staff manage the ticket and collect ratings.

**Monthly maintenance** runs on the 1st for servers with a log channel: tickets idle for 14+ days are closed, a test ticket is opened and closed to confirm everything works, and a report is posted (tickets opened and closed, stale closures, average rating, and the test result).

<details>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/ticket create` | Open a support ticket. |
| `/ticket close` | Close and archive the current ticket. |
| `/ticket delete` | Permanently delete the ticket channel. |
| `/ticket add <user>` | Add a user to the ticket. |
| `/ticket remove <user>` | Remove a user from the ticket. |
| `/ticket panel [channel]` | Post an **Open Ticket** button panel. |
| `/ticket redirect [channel]` | Post a "wrong channel" message that points to tickets. |
| `/ticket ratings [user]` | View support ratings for one staff member or the whole server. |
| `/ticket config set` | Set the ticket category, log channel, and support role. |
| `/ticket config view` | View ticket settings. |

</details>

### 📊 Server Stats

Shows server activity, and runs voice channels whose names update with live counts, like **Members: 1,234**.

- **Stat types:** `members` · `humans` · `bots` · `boosters` · `channels` · `roles` · `text`
- `text` is a locked channel that just shows your label. For example, `/config serverstats add type:text label:🌐 ctiservers.org` shows your website.

<details>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/config serverstats view [hours]` | Show messages, joins, leaves, and member count for the last N hours (default 24, max 168). |
| `/config serverstats add <type> [label]` | Create a live stat channel. |
| `/config serverstats remove <id>` | Delete a stat channel. |
| `/config serverstats list` | List stat channels. |

</details>

### 📺 Streaming

**Stream announcements.** When a member goes live (detected through their Discord presence), the bot posts a message and can give them a role while they stream. Needs the **Presence Intent**.

**Stream VC.** A locked voice channel that members ask to join. Members with the required role send a request, an approver presses **Review** to approve or reject it privately, and approving gives that member access.

<details>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/config streaming set` | Set the channel, the "streaming" role, and the message (`{username}`, `{game}`, `{url}`). |
| `/config streaming view` | View streaming settings. |
| `/streamvc request [reason]` | Ask to join (needs the configured role). |
| `/streamvc config set [vc] [request_channel] [required_role]` | Set the VC (it's locked automatically), the request channel, and the required role. |
| `/streamvc config panel [channel]` | Post a **Request to Join** button panel. |
| `/streamvc config add-approver <user/role>` | Add an approver. |
| `/streamvc config remove-approver <user/role>` | Remove an approver. |
| `/streamvc config view` | View stream VC settings. |

</details>

> [!NOTE]
> The bot needs **Manage Roles/Channels** on the stream VC. Keep the request channel visible only to approvers. Anyone with **Manage Channels** can always approve requests.

### ⭐ Starboard

Messages that get enough of a chosen reaction are reposted to a starboard channel, and the count updates live.

<details>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/config starboard channel <channel>` | Set the starboard channel. |
| `/config starboard threshold <count>` | Set how many reactions are needed (default 3). |
| `/config starboard emoji <emoji>` | Set the reaction to watch (default ⭐). |
| `/config starboard toggle` | Turn the starboard on or off. |
| `/config starboard view` | View starboard settings. |

</details>

### 📌 Sticky Messages

Keeps a message at the bottom of a channel by re-posting it as people chat. Handy for rules or "read this first" notices.

- Re-posts happen at most once every 30 seconds per channel, so a burst of chat costs one re-post.
- The **jackpot sticky** (`/jackpot sticky:True`) shows the live jackpot and edits itself in place every 10 minutes, so quiet channels aren't bumped as unread.
- Sticky commands need **Manage Messages**. The bot needs **Send Messages** and **Manage Messages** in the channel.

<details>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/sticky set <message> [channel] [embed]` | Stick a message (as an embed by default; `embed:false` for plain text). Running it again replaces the old one. |
| `/sticky remove [channel]` | Remove the sticky and clean up its last copy. |
| `/sticky list` | List every sticky in the server. |

</details>

### 🗳️ Poll Archive

Keeps a poll channel clean. When a **Discord poll** (the built-in Poll button) ends, Jade:

1. Posts a **results card** to the archive channel: each answer's votes and percentage, the winner 🏆, who asked, and when it ran.
2. Attaches a **`.txt` log** of who voted for what, plus every message posted while the poll was running.
3. Deletes the poll, Discord's "poll ended" notice, and that discussion. Pinned messages and polls still running are left alone.

**Older polls count too.** Setting up a channel archives every poll that already ended, oldest first, and polls that end while the bot is offline are picked up within 10 minutes of it coming back.

<details>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/config pollarchive set <poll_channel> <archive_channel> [include_old]` | Archive polls from one channel into another, starting with any that already ended (`include_old:false` skips those). Run it again to change the archive channel. |
| `/config pollarchive remove <poll_channel>` | Stop archiving a channel. |
| `/config pollarchive view` | List poll channels, where they archive to, and any missing permissions. |
| `/config pollarchive sweep [poll_channel]` | Search the full history and archive every poll that has already ended. Shows progress as it goes. |

</details>

> [!NOTE]
> Jade needs **Manage Messages** and **Read Message History** in the poll channel, and **Send Messages**, **Embed Links** and **Attach Files** in the archive channel. `/config pollarchive view` flags anything missing.

### 💬 Topic Rotation

Posts discussion prompts to a channel on a schedule, in order or at random.

<details>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/config topics setup <channel> <interval> [mode]` | Start a rotation (for example `6h` or `1d`). The mode is `sequential` or `random`. |
| `/config topics add <channel> <topic>` | Add a topic to a channel's queue. |
| `/config topics delete <id>` | Remove a topic. |
| `/config topics list <channel>` | List topics and settings. |
| `/config topics post <channel>` | Post the next topic now. |
| `/config topics remove <channel>` | Stop the rotation. |

</details>

### 🎂 Birthdays

Members set their birthday once, and the bot announces it on the day.

<details>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/birthday set <month> <day>` | Set your birthday. |
| `/birthday view [user]` | See someone's birthday and how many days away it is. |
| `/birthday list` | List upcoming birthdays. |
| `/birthday remove` | Remove your birthday. |
| `/birthdayconfig channel <channel>` | Set the announcement channel. |
| `/birthdayconfig toggle` | Turn announcements on or off. |
| `/birthdayconfig delete <user>` | Remove a member's birthday. |
| `/birthdayconfig view` | View birthday settings. |

</details>

### 🕐 Timezones

Members register an IANA timezone so others can see their local time.

<details>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/config timezone set <timezone>` | Set your timezone (for example `America/New_York`). |
| `/config timezone view [user]` | See someone's local time. |
| `/config timezone list` | List everyone's timezones. |
| `/config timezone remove` | Remove your timezone. |

</details>

### 🎁 Free Game Tracker

Checks **Epic Games Store**, **Steam**, and **GOG** every hour. Each free game is posted with a claim button, the original price, and how long the offer lasts, and the same game is never posted twice in a server.

<details>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/freegames now` | Show games that are free right now. |
| `/freegames upcoming` | Show upcoming free games on Epic. |
| `/config freegames setup <channel>` | Turn on the tracker, with an optional role to ping. |
| `/config freegames platforms` | Choose which stores to track. |
| `/config freegames ping [role]` | Set or clear the ping role. |
| `/config freegames disable` | Turn off the tracker. |
| `/config freegames view` | View tracker settings. |
| `/config freegames check` | Check for free games and post any new ones now. |

</details>

---

## 💰 Economy & Leveling

### 📈 Leveling

Members earn **15–25 XP per message** (60-second cooldown each), and every level-up is announced and pays **level × 50 coins**. XP needed per level is `5n² + 50n + 100`, the same formula as MEE6.

<details>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/rank [user]` | Show a rank card image with level, XP bar, and server rank. |
| `/level rank [user]` | Show text-based rank details: level, XP progress, and message count. |
| `/level leaderboard [limit]` | Show the top users by XP. |
| `/levelconfig toggle <enabled>` | Turn XP gain on or off. |
| `/levelconfig channel [channel]` | Set the level-up announcement channel. |
| `/levelconfig xp [min] [max] [cooldown]` | Set the XP range and cooldown. |
| `/levelconfig message <text>` | Customize the level-up message (`{user}`, `{username}`, `{level}`). |
| `/levelconfig announce <enabled>` | Turn level-up announcements on or off. |
| `/levelconfig background [url]` | Set a custom rank card background (leave it out to reset). |
| `/levelconfig view` | View leveling settings. |
| `/levelconfig roles add <level> <role>` | Give a role at a set level. |
| `/levelconfig roles remove <id>` | Remove a level role. |
| `/levelconfig roles list` | List level roles. |

`/levelconfig` requires **Manage Server**.

</details>

### 🪙 Earning Coins

Each server has its own currency.

| Command | Cooldown | Notes |
|---|---|---|
| `/daily` | 20 hours | 🔥 Drought bonus |
| `/weekly` | 7 days | |
| `/monthly` | 30 days | |
| `/yearly` | 365 days | |
| `/work` | 1 hour | 🔥 Drought bonus |
| `/beg` | 15 minutes | Pays 10–100 coins · 🔥 Drought bonus |
| `/balance [user]` | | Current balance and total earned |
| `/pay <user> <amount>` | | Send coins to another member |
| `/economy leaderboard [limit]` | | The richest members |

<details>
<summary><b>🔥 Drought Bonus</b></summary>

`/work`, `/daily`, and `/beg` track when **anyone in the server** last used them. The longer a command goes unused, the bigger the next payout:

| Command | Grace period | After that, the payout doubles every |
|---|---|---|
| `/work` | 6 hours | 12 hours |
| `/daily` | 4 days | 24 hours |
| `/beg` | 3 hours | 6 hours |

The bonus caps at **1,000,000 coins**, and claiming resets the timer. Boosted claims are labeled: 🔥 small bonus, 💰 drought bonus, 🎰 jackpot.

</details>

**🎟️ Daily Lottery.** Once a day, a random member wins **50,000 coins**. Anyone with at least 1 XP is entered, and 🎟️ **Loaded Dice** doubles your chance. The previous winner's message is deleted when the new one is posted. Turn it on with `/economyconfig lottery <channel>`.

### 🎰 Casino

| Game | How it works |
|---|---|
| `/flip <bet>` | A coin flip that pays 2× (50/50). Lucky Charm boosts wins to 1.5×. |
| `/highroll <bet>` | Roll 1–100 against the bot. The higher roll wins, and ties refund your bet. |
| `/slots <bet>` | Pairs pay 🍒½× 🍋1× 🔔1.5× 💎2× 7️⃣3×. Triples pay 🍒4× 🍋7× 🔔12× 💎25× 7️⃣75×. About 60% of spins win. |
| `/scratch <bet>` | Reveal 9 symbols and match 4 or more: 🍒1× 🍋2× 🍊3× 🍇6× ⭐12× 💎25×. |
| `/roulette <bet> <type>` | Red/black, even/odd, or low/high pays 2×. A single number (1–36) pays 35×. No zero, so the odds are exactly fair. |
| `/crash <bet>` | A multiplier swings up and down. Cash out above 1×, or lose your bet if it crashes. Timing out cashes you out automatically. |
| `/plinko <bet>` | An animated drop down a 10-row board into 11 buckets. The edges pay 48×, and about 1 drop in 9 pays 3× or more. Exactly fair (RTP 1.000). |
| `/blackjack <bet>` | Hit, stand, or double down. Blackjack pays 1.5×. |
| `/poker <bet>` | Jacks or Better video poker. A royal flush pays 250×. |
| `/games leaderboard <game>` | Top players for any casino or guessing game. |

**💎 Progressive Jackpot.** Every casino game feeds one shared pot with **5% of every loss**. Any bet can hit it (bigger bets have better odds); the whole pot pays out and restarts from a base amount. All of it goes back to players, which is why each game's own RTP is slightly under 1.000.

| Command | Description |
|---|---|
| `/jackpot` | Show the current pot and who last won it. |
| `/jackpot sticky:True` | *(Manage Messages)* Pin a live jackpot message to the bottom of the channel. Remove it with `/sticky remove`. |

### 🦹 Robbing

| Command | Description |
|---|---|
| `/rob <user>` | 50/50 odds. On success you steal a random amount, from 1 coin up to their entire balance. The cooldown is 30 minutes after a failure and 1 hour after a success. |
| `/protection` | Pay 5,000 coins for mob protection that blocks robberies for 24 hours. |

### 🛒 Shop

Browse with `/shop browse` and buy with `/shop buy <item> [cooldown]` (the `cooldown` option is only for Time Skip). One-shot items stay usable for 7 days after you buy them.

| Item | Effect | Price |
|---|---|---:|
| 🔮 **XP Surge** | 2× XP from all sources for 1 hour | 25,000 |
| 🍀 **Lucky Charm** | 1.5× gambling winnings for 30 minutes | 30,000 |
| ⚡ **Hint Rush** | No hint cooldown in the guessing games for 15 minutes | 15,000 |
| 💼 **Overtime Permit** | `/work` cooldown cut to 30 minutes for 4 hours | 20,000 |
| 🧲 **Coin Magnet** | 1.5× coins from `/work`, `/daily`, and `/beg` for 24 hours | 40,000 |
| 🎟️ **Loaded Dice** | 2× chance in the next daily lottery | 15,000 |
| 🥊 **Goon Squad** | *One-shot:* your next failed `/rob` has no cooldown | 25,000 |
| 🛡️ **Gambling Insurance** | *One-shot:* 50% back on your next lost bet | 30,000 |
| 🔁 **Second Chance** | *One-shot:* a `/crash` bust below 1.5× refunds your bet | 40,000 |
| 💖 **Extra Life** | *One-shot:* forgives your next counting mistake | 35,000 |
| ⏩ **Time Skip** | *Instant:* resets your `/daily`, `/work`, or `/beg` cooldown | 35,000 |
| 📦 **Mystery Box** | *Instant:* 60% chance of 2k–8k coins, 25% a random boost, 10% nothing, 5% a 50k jackpot | 10,000 |

### 🔧 Economy Admin

<details>
<summary><b>📋 Commands</b> (Manage Server)</summary>

| Command | Description |
|---|---|
| `/economyconfig currency <name> <symbol>` | Set the currency name and symbol. |
| `/economyconfig starting <amount>` | Set the starting balance for new users. |
| `/economyconfig daily <min> <max>` | Set the `/daily` reward range. |
| `/economyconfig weekly <min> <max>` | Set the `/weekly` reward range. |
| `/economyconfig monthly <min> <max>` | Set the `/monthly` reward range. |
| `/economyconfig yearly <min> <max>` | Set the `/yearly` reward range. |
| `/economyconfig work <min> <max>` | Set the `/work` reward range. |
| `/economyconfig lottery [channel]` | Turn on the daily lottery (leave out the channel to turn it off). |
| `/economyconfig view` | View economy settings. |
| `/admin givemoney <user> <amount>` | *(Admin)* Give coins to a user. |

</details>

### 🏅 Reputation

| Command | Description |
|---|---|
| `/rep give <user>` | Give someone +1 rep (1-hour cooldown per person). |
| `/rep view [user]` | View someone's reputation. |
| `/rep leaderboard` | Show the top 10 reputation holders. |
| `/repconfig take <user>` | *(Admin)* Take away 1 rep. |

---

## 🎮 Games & Fun

### 🔢 Counting

Members count up one number at a time in a channel. Set it up with `/config counting`.

- Tracks high scores, and answers questions like *"what is the count"*.
- A wrong number sets the count back by a random amount and times the person out for 60 seconds. Edited and deleted numbers are caught.
- 💖 **Extra Life** from the shop forgives a mistake.

### 🎬 Guessing Games

Four games, each in its own channel: 🎬 **Movie**, 📺 **TV Show**, 🎮 **Video Game** and 🎵 **Song**. Every round has **💡 Hint** and **⏭️ Vote Skip** buttons.

| Game | Source | Notes |
|---|---|---|
| 🎬 Movie / 📺 TV | [TMDB](https://www.themoviedb.org/settings/api) (`TMDB_API_KEY`) | Scene stills from MovieStillsDB, falling back to TMDB backdrops. Titles from 1975 onward. |
| 🎮 Video Game | [RAWG](https://rawg.io/apidocs) (`RAWG_API_KEY`) | Only games with a Metacritic score of 60+, so they're recognizable |
| 🎵 Song | Deezer (no key needed) | Plays the first **5 seconds** as audio. The full 30-second preview is posted once someone guesses it. Picked from current charts across popular genres. |

- **Hints** are shared by the channel and posted publicly, 60 seconds apart, and never lower the XP reward.
  - *Movie, TV and game:* an info card, then the masked title, an anagram, another screenshot, and the description
  - *Song:* info (year, genre, duration), then the masked title, an anagram, a later 10-second clip, the artist, and the album art
- Titles don't repeat in a channel for 6 hours, and win/loss stats are kept.
- On the **1st of each month**, each channel gets a top-10 leaderboard post and a fresh round.

<details>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/hint` or 💡 | Reveal the next hint (5 per round, 6 for songs). |
| `/voteskip` or ⏭️ | Vote to skip the round. It takes 2 votes and opens after the first 5 minutes. |
| `/mediaguess setup <type> <channel>` | *(Admin)* Set up a game channel and start it. |
| `/mediaguess stop` | *(Admin)* Stop the game and remove its settings. |
| `/mediaguess skip` | *(Admin)* Skip the round without a vote. |
| `/mediaguess info` | *(Admin)* View settings and the current round for all four games. |

</details>

### 🎉 Giveaways

Members enter with a button, and winners are picked at random when the timer ends.

<details>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/giveaway start <prize> <duration> <winners> [channel]` | Start a giveaway (for example `1h`, `30m`, or `2d`). |
| `/giveaway end <id>` | End it early and pick winners now. |
| `/giveaway reroll <id>` | Pick new winners. |
| `/giveaway list` | List active giveaways. |
| `/giveaway entries <id>` | See who entered *(Manage Server)*. |

</details>

### 🎲 Fun & Random

| Command | Description |
|---|---|
| `/trivia` | Answer a multiple-choice trivia question with buttons (from OpenTDB). |
| `/gif <query>` | Search Tenor for a GIF (needs `TENOR_API_KEY`). |
| `/8ball <question>` | Ask the magic 8-ball. |
| `/wouldyourather` | Get a would-you-rather question. |
| `/topic` | Get a random conversation starter. |
| `/dadjoke` | Get a random dad joke. |
| `/advice` | Get a random piece of advice. |
| `/roll [dice]` | Roll dice (for example `2d6` or `1d20+5`). |

---

## 🧰 Utility

<details open>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/ping` | Check bot and API latency. |
| `/avatar [user] [server]` | Show a full-size avatar (`server:true` for the server avatar). |
| `/banner [user] [server]` | Show a profile banner. |
| `/userinfo [user]` | Show account age, join date, roles, and nickname. |
| `/serverinfo` | Show the owner, member count, boost level, and verification level. |
| `/listroles` | List all roles with member counts. |
| `/viewperms [user] [channel]` | Show someone's permissions, either server-wide or in one channel. |
| `/weather <location>` | Show the current weather (needs `WEATHER_API_KEY`). |
| `/define <word>` | Look up a word's definition. |
| `/translate <text> [to] [from]` | Translate between 16 languages (from MyMemory, no key needed). |
| `/reminder set` / `list` / `delete` | Set a reminder (`10m`, `2h`, `1d`). It fires in the channel where you set it. |
| `/tag create` / `get` / `edit` / `delete` / `info` / `list` | Create and share text snippets. Owners or mods can edit them. |
| `/base64 <encode\|decode> <text>` | Encode or decode base64. |
| `/status set` / `clear` / `view` | Set the bot's status *(bot owner only)*. |

</details>

- **Custom commands** are managed in the [Web Dashboard](#-web-dashboard). Triggers can be `command`, `startswith`, `contains`, `exact`, or `regex`, and responses support `{user}`, `{username}`, `{server}`, `{channel}`, and `{membercount}`.
- **Right-click menus** (right-click a message, then **Apps**): **Make it a Quote** turns it into a black-and-white quote card, and **Select Image** picks an image for your next `/image` command.

---

## 🖼️ Image Editing

**57 effects** ported from [esmBot](https://github.com/esmBot/esmBot), all under one **`/image`** command. Pick one with the `effect` option, for example `/image effect:deepfry`.

- Attach an image or give a `url`. With neither, the bot uses the most recent image in the channel.
- Some effects take extra input through `text`, `number`, `font`, or `choice`. Autocomplete shows which.

| Category | Effects |
|---|---|
| 🎨 Color & Filter | `blur` `sharpen` `grayscale` `sepia` `invert` `hue` `deepfry` `jpeg` `vignette` `pixelate` |
| 📐 Transform | `flip` `flop` `rotate` `crop` `circle` `wide` `squish` `stretch` `tile` `wall` |
| 🪞 Mirror | `haah` `hooh` `waaw` `woow` |
| 🌀 Distortion | `swirl` `explode` `implode` `magik` `globe` `togif` |
| 🎞️ Animation | `spin` `bounce` `slide` `fade` `reverse` `speed` `slow` `freeze` `unfreeze` |
| 💬 Text | `caption` `caption2` `meme` `motivate` `snapchat` `whisper` `uncanny` `uncaption` |
| 😂 Memes | `sonic` `homebrew` `spotify` `reddit` `gamexplain` `scott` |
| 🏳️ Overlays | `flag` (rainbow, trans, pirate, checkered) · `watermark` (9gag, bandicam, hypercam, ifunny, …) |

<details>
<summary><b>🔧 Building the native addon</b></summary>

All pixel processing runs in esmBot's compiled C++ addon (libvips).

```bash
# Ubuntu/Debian
apt install libvips-dev libfontconfig1-dev cmake build-essential
bun run build:native
```

`bun install` tries to build it automatically. If the build fails (for example on a Windows dev machine), the bot still starts, but image commands ask you to build the addon.

**Optional build flags**

- `WITH_MAGICK=ON` turns on the `magik` effect. It needs `libmagick++-dev`.
- `WITH_ZXING=ON` (on by default on Linux) turns on native QR code support. It needs `libzxing-dev`.

</details>

---

## 🎵 Music (separate bot)

Music runs as its own process in [`music-bot/`](music-bot/), under **Jade's account**, and registers its commands in the main server only. See [`music-bot/README.md`](music-bot/README.md) for setup.

- **Plays almost anything:** YouTube and YouTube Music, Spotify and Apple Music links (songs, albums, playlists, played from YouTube Music without API keys), Bandcamp, Twitch, Vimeo, radio streams, and search text
- **Live control panel** with ⏮️ ⏯️ ⏭️ ⏹️ 🔁 🔀 📜 🎤 buttons, plus search-as-you-type on `/play`
- **DJ system** with an optional DJ role, vote-skip, and a session host
- **Effects** (bass boost, nightcore, vaporwave, 8D, vocal remover), playback speed, **lyrics**, **SponsorBlock**, **24/7** and autoplay

<details>
<summary><b>📋 Commands</b></summary>

| Command | Description |
|---|---|
| `/play <query> [next]` | Play a song or playlist, or add it to the queue. *(DJ)* `next` queues it first. |
| `/skip` | Skip, or start a vote if you aren't a DJ. |
| `/stop` | *(DJ)* Stop, clear the queue and leave. |
| `/queue [page]` · `/nowplaying` · `/lyrics [query]` | Show the queue, the current song, or lyrics. |
| `/volume` · `/loop` · `/shuffle` · `/filter` | *(DJ)* Adjust playback. |
| `/remove <position>` | Remove a song. Anyone can remove their own. |
| `/music-settings` | *(Manage Server)* DJ role, 24/7 mode and SponsorBlock. |

Pause, previous and stop are also buttons on the Now Playing panel.

</details>

> [!NOTE]
> It runs natively on Windows rather than in Docker, because Docker Desktop's virtual network makes Discord voice choppy. Audio plays through a local [Lavalink](https://github.com/lavalink-devs/Lavalink) server, so the bot's own work can't interrupt it, following [BeatDock](https://github.com/albertgmz/BeatDock)'s approach.

---

## 🌐 Web Dashboard

A dark-themed web panel in the style of YAGPDB for managing settings without slash commands. It starts with the bot when `DISCORD_CLIENT_SECRET` is set.

**Pages:** Economy · Leveling & Level Roles · Welcome · Starboard · AutoMod · Logging · Reaction Roles · Giveaways · Topic Rotation · Birthdays · Timezones · Stat Channels

**Setup**

1. In the [Developer Portal](https://discord.com/developers/applications), open your app, then go to **OAuth2 → Redirects**.
2. Add `http://localhost:3000/auth/callback`, or `<WEB_URL>/auth/callback` in production.
3. Add `DISCORD_CLIENT_SECRET`, `WEB_PORT`, and `WEB_URL` to `.env`.
4. Make sure port 3000 is exposed. It already is in `docker-compose.yaml`.
5. Open `http://localhost:3000` and log in with Discord.

---

## 🎯 The Range Bridge (ctiservers.org)

The minigames on [ctiservers.org](https://ctiservers.org)'s **Range** sell boosters and revives for economy coins. The leaderboard Worker charges players through two token-protected routes, served on `WEB_PORT` (the dashboard doesn't need to be enabled).

| Call | Response |
|---|---|
| `GET /api/range/wallet/<discord user id>` | `{ "balance": 1234 }` |
| `POST /api/range/spend` with `{ user, amount, ref, reason }` | `{ "ok": true, "balance": 834 }`, or **402** `{ "error": "insufficient_funds", "balance": 120 }` |

- The website sets the prices; the bot only deducts coins.
- Each `ref` is charged only once, so a retried request never charges twice.
- Every spend is recorded in the `range_spends` table.

**Setup**

1. Set `RANGE_API_TOKEN` in `.env` to a long random string (16+ characters).
2. Put `WEB_PORT` behind HTTPS on a public address, using a reverse proxy or tunnel.
3. On the Worker, run `npx wrangler secret put ECONOMY_URL` with that address, and `npx wrangler secret put ECONOMY_TOKEN` with the same token.

---

## 🗄️ Database

TMCBot uses a local **SQLite** file at `data/db.sqlite` (override it with `DB_PATH`). No external database is needed, and tables are set up automatically on startup.

> [!CAUTION]
> The bot **refuses to start if the database file is missing**, because an empty database would look exactly like every user losing their levels and coins. On a genuine first run, start it once with `CREATE_DB=1`.

---

## 🚫 Not Included

Most features were ported from [YAGPDB](https://yagpdb.xyz) and rewritten in TypeScript. These were left out on purpose:

| Feature | Reason |
|---|---|
| Verification (reCAPTCHA) | Needs an external reCAPTCHA callback. TMCBot has its own [verification gate](#-verification-gate) (✅ reaction or button) instead. |
| Personalizer | Discord heavily rate-limits per-server avatar and name changes |
| Premium system | Not relevant for a self-hosted bot |
| Safe Browsing (Google) | Covered by [AntiPhishing](#-antiphishing) |

---

<div align="center">

Licensed under **GPL-3.0-or-later** · Made with 💜 for [CTIServers.org](https://ctiservers.org)

</div>
