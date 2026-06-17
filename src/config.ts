const envVars = {
  CLIENT_ID: Bun.env.CLIENT_ID,
  GUILD_ID: Bun.env.GUILD_ID,
  DISCORD_TOKEN: Bun.env.TOKEN,
  NODE_ENV: Bun.env.NODE_ENV || 'development',
};

const missingVars = Object.entries(envVars)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
}

interface Env {
  DISCORD_TOKEN: string;
  CLIENT_ID: string;
  GUILD_ID: string;
  NODE_ENV: string;
}

const Config: Env = {
  CLIENT_ID: envVars.CLIENT_ID!,
  GUILD_ID: envVars.GUILD_ID!,
  DISCORD_TOKEN: envVars.DISCORD_TOKEN!,
  NODE_ENV: envVars.NODE_ENV,
};

export default Config;
