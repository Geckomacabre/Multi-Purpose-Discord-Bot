const envVars = {
  CLIENT_ID: Bun.env.CLIENT_ID,
  GUILD_ID: Bun.env.GUILD_ID,
  DISCORD_TOKEN: Bun.env.TOKEN,
  ACTION_LOG_CHANNEL: Bun.env.ACTION_LOG_CHANNEL,
  DISCORD_CLIENT_SECRET: Bun.env.DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI: Bun.env.DISCORD_REDIRECT_URI,
  TWITCH_CLIENT_ID: Bun.env.TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET: Bun.env.TWITCH_CLIENT_SECRET,
  TWITCH_REDIRECT_URI: Bun.env.TWITCH_REDIRECT_URI,
  COOKIE_SECRET: Bun.env.COOKIE_SECRET,
  NODE_ENV: Bun.env.NODE_ENV || "development",
};

const missingVars = Object.entries(envVars)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  throw new Error(`Missing environment variables: ${missingVars.join(", ")}`);
}

interface Env {
  DISCORD_TOKEN: string;
  CLIENT_ID: string;
  GUILD_ID: string;
  ACTION_LOG_CHANNEL: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_REDIRECT_URI: string;
  TWITCH_CLIENT_ID: string;
  TWITCH_CLIENT_SECRET: string;
  TWITCH_REDIRECT_URI: string;
  COOKIE_SECRET: string;
  NODE_ENV: string;
}

const Config: Env = {
  CLIENT_ID: envVars.CLIENT_ID!,
  GUILD_ID: envVars.GUILD_ID!,
  DISCORD_TOKEN: envVars.DISCORD_TOKEN!,
  ACTION_LOG_CHANNEL: envVars.ACTION_LOG_CHANNEL!,
  DISCORD_CLIENT_SECRET: envVars.DISCORD_CLIENT_SECRET!,
  DISCORD_REDIRECT_URI: envVars.DISCORD_REDIRECT_URI!,
  TWITCH_CLIENT_ID: envVars.TWITCH_CLIENT_ID!,
  TWITCH_CLIENT_SECRET: envVars.TWITCH_CLIENT_SECRET!,
  TWITCH_REDIRECT_URI: envVars.TWITCH_REDIRECT_URI!,
  COOKIE_SECRET: envVars.COOKIE_SECRET!,
  NODE_ENV: envVars.NODE_ENV!,
};

export default Config;
